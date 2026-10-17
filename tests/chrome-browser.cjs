// Optional UI integration test. Extension installation is not attempted here:
// the managed test browser blocks unpacked extensions. Chrome APIs are simulated.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ASSYST_PLAYWRIGHT_MODULE || 'playwright');
const { background, root } = require('./harness.cjs');

(async () => {
  const bg = background();
  const browser = await chromium.launch({ executablePath: process.env.ASSYST_CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox'] });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.exposeFunction('assystTestRequest', async message => {
      const result = await bg.send(message.action, message);
      assert.ok(result.ok, result.error);
      return result;
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>AssystNet synthetic queue</title></head><body>
      <nav><span class="breadcrumb no-link-breadcrumb" data-component-tag="breadcrumb-index-2">2142782</span></nav>
      <select id="queue"><option>Chamados atribuídos a mim</option></select>
      <p>Exibição de eventos 1 - 3 de 3</p>
      <div class="dgrid"><table><thead><tr><th class="field-eventRef">Referência</th><th class="field-status">Status (Texto)</th></tr></thead>
      <tbody><tr><td class="field-eventRef">2142782</td><td class="field-status">Aberto</td></tr>
      <tr><td class="field-eventRef">R2478233</td><td class="field-status">Aberto</td></tr>
      <tr><td class="field-eventRef">S111</td><td class="field-status">Resolvido</td></tr></tbody></table></div>
      </body></html>`;
    await context.route('https://cati.tjce.jus.br/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://cati.tjce.jus.br/assystnet/#events/2142782?eventType=1&currentIndex=0');
    await page.evaluate(() => {
      window.testChromeListeners = [];
      window.chrome = {
        runtime: { id: 'test', getURL: p => p, sendMessage: message => window.assystTestRequest(message),
          onMessage: { addListener(fn) { window.testChromeListeners.push(fn); }, removeListener() {}, hasListener() { return false; } } },
        storage: { local: {}, onChanged: { addListener() {}, removeListener() {} } }
      };
    });
    for (const name of ['chrome/compat.js', 'data.js', 'queue.js', 'content.js', 'detail.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') });
    }
    const detail = page.locator('[data-assyst-ui="detail-controls"]');
    await detail.locator('select').selectOption('REDMINE');
    await page.waitForFunction(() => document.querySelector('td.field-eventRef select')?.value === 'REDMINE');
    for (let index = 0; index < 4; index++) {
      await detail.locator('input[type=checkbox]').nth(index).check();
      await page.waitForFunction(count => {
        const hosts = document.querySelectorAll('.assyst-contact-controls[data-ticket-id="2142782"]');
        return [...hosts].every(host => [...host.shadowRoot.querySelectorAll('input')].filter(input => input.checked).length === count &&
          !host.shadowRoot.querySelectorAll('input')[count - 1].disabled);
      }, index + 1);
    }
    assert.equal((await bg.send('get')).state.assyst_contacts['2142782'].attempts.length, 4);
    console.log('PASS Chromium UI: shared Chrome adapter, tags, four same-day attempts and both views.');

    const stale = await detail.locator('input[type=checkbox]').nth(3).elementHandle();
    await page.evaluate(() => { history.pushState(null, '', '#events/R2478233?eventType=4&currentIndex=4'); });
    await stale.evaluate(node => node.click());
    assert.equal((await bg.send('get')).state.assyst_contacts['2142782'].attempts.length, 4);
    // The rejected stale action deliberately shows an error dialog; dismiss it as a user would.
    await page.keyboard.press('Escape');
    await page.locator('.breadcrumb').evaluate(node => { node.textContent = 'R2478233'; });
    await page.waitForFunction(() => document.querySelector('[data-assyst-ui="detail-controls"]')?.dataset.ticketId === 'R2478233');
    await page.locator('[data-assyst-ui="detail-controls"] input[type=checkbox]').first().check();
    await page.waitForFunction(() => document.querySelector('[data-assyst-ui="detail-controls"] input') === null ||
      document.querySelector('[data-assyst-ui="detail-controls"] .assyst-contact-controls')?.shadowRoot.querySelector('input')?.checked);
    await page.waitForTimeout(50);
    assert.equal((await bg.send('get')).state.assyst_contacts.R2478233.attempts.length, 1);
    console.log('PASS Chromium UI: SPA navigation blocks stale controls and preserves full R references.');

    const captured = await page.evaluate(() => new Promise((resolve, reject) => {
      for (const listener of window.testChromeListeners) {
        const keep = listener({ type: 'assyst-queue', action: 'capture' }, { id: 'test' }, resolve);
        if (keep) return;
      }
      reject(new Error('No queue capture listener'));
    }));
    assert.equal(captured.ok, true, captured.error);
    assert.deepEqual(captured.tickets.sort(), ['2142782', 'R2478233']);
    console.log('PASS Chromium UI: asynchronous Chrome message bridge captures only open queue references.');

    // The actual offscreen script creates Unicode Blob URLs in a real browser document.
    const doc = await context.newPage();
    await doc.goto('https://cati.tjce.jus.br/assystnet/offscreen-test');
    await doc.evaluate(() => { window.chrome = { runtime: { id: 'test', onMessage: { addListener(fn) { window.offscreenTest = fn; } } } }; });
    await doc.addScriptTag({ content: fs.readFileSync(path.join(root, 'chrome/offscreen.js'), 'utf8') });
    const text = 'ação, ç, 漢字';
    const result = await doc.evaluate(text => {
      let response;
      window.offscreenTest({ type: 'assyst-download', target: 'offscreen', action: 'create', text, mime: 'text/csv;charset=utf-8' },
        { id: 'test' }, value => { response = value; });
      return response;
    }, text);
    assert.equal(await doc.evaluate(async url => (await fetch(url)).text(), result.url), text);
    const released = await doc.evaluate(token => {
      let response;
      window.offscreenTest({ type: 'assyst-download', target: 'offscreen', action: 'release', token }, { id: 'test' }, value => { response = value; });
      return response;
    }, result.token);
    assert.equal(released.remaining, 0);
    assert.deepEqual(errors, []);
    console.log('PASS Chromium DOM: real Blob URL preserves Unicode and is released. Chrome extension APIs remain simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
