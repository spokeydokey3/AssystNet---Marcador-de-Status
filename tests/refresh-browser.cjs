// Ordinary Chromium DOM test; extension APIs and the server are simulated.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ASSYST_PLAYWRIGHT_MODULE || 'playwright');
const { root } = require('./harness.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ASSYST_CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'] });
  try {
    for (const origin of ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br']) {
      for (const home of [false, true]) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const tag = home ? 'refresh' : 'eventMonitorRefreshButton';
        const html = `<!doctype html><meta charset="utf-8"><body>
          <section><div class="axios-homepage-titlebar-outer">
          <h2 class="axios-homepage-titlebar-inner">Chamados Atribuídos a mim</h2>
          <span class="dijit dijitReset dijitInline refreshButton axios-toolbar-button flexContainer horizontal dijitButton"><span class="dijitReset dijitInline dijitButtonNode" data-dojo-attach-event="ondijitclick:__onClick" role="presentation">
            <span role="button" data-dojo-attach-point="titleNode,focusNode" title="Atualizar [Ctrl+Alt+R]" data-component-tag="${tag}"><span class="${home ? 'refreshButtonIcon' : 'refreshIcon'}"></span>Atualizar</span>
          </span><input type="button" class="dijitOffScreen" data-dojo-attach-event="onclick:_onClick" data-dojo-attach-point="valueNode" aria-hidden="true" style="position:absolute;left:-10000px" value=""></span></div>
          <div class="dgrid"><table><tr><td class="field-eventRef">S1<input type="checkbox" checked></td></tr></table></div></section>
          <div class="dijitPopup" style="position:absolute;left:-10000px;width:100px;height:20px"></div>
          <div class="dijitPopup" style="position:absolute;left:300px;top:50px;width:100px;height:20px"></div>
          <div role="listbox"><div role="option">Lista permanente</div></div>
          <div role="dialog" style="position:absolute;left:-10000px">Diálogo fechado</div>
          <div data-dojo-attach-point="_underlayNode" style="display:none;position:absolute;inset:0;opacity:.75;background:#ccc;cursor:wait"></div>`;
        await page.route(origin + '/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.goto(origin + '/assystnet/' + (home ? '#homepage' : '#eventMonitor/4'));
        await page.clock.install();
        await page.evaluate(() => {
          const prefs = { enabled: true, intervalSeconds: 30, background: false };
          const state = { assyst_revision: 0, assyst_tags: [], assyst_ticket_tags: {}, assyst_contacts: {} };
          window.nativeRequests = 0; window.wrapperClicks = 0; window.completions = 0; window.observers = 0; window.observerStacks = [];
          const Observer = window.MutationObserver;
          window.MutationObserver = class extends Observer {
            constructor(fn) {
              super(fn);
              const stack = new Error().stack;
              // Playwright installs its own observer; count only the extension sources.
              if (stack.includes('assyst-test/')) window.observers++;
              window.observerStacks.push(stack);
            }
          };
          window.browser = { runtime: { id: 'test', onMessage: { addListener() {} },
            async sendMessage() { return { ok: true, state }; } },
            storage: { local: { async get() { return { assyst_refresh_settings: prefs }; } },
              onChanged: { addListener() {}, removeListener() {} } } };
          window.AssystQueueSync = { isBusy: () => false, changed() {}, refreshFinished() { window.completions++; } };
          // Model dijit/form/_ButtonMixin.__onClick forwarding to its offscreen valueNode.
          const nativeButton = document.querySelector('.dijitButton');
          nativeButton.querySelector('.dijitButtonNode').addEventListener('click', event => {
            window.wrapperClicks++; event.preventDefault(); event.stopPropagation(); nativeButton.querySelector('input').click();
          });
          nativeButton.querySelector('input').addEventListener('click', () => {
            window.nativeRequests++;
            const underlay = document.querySelector('[data-dojo-attach-point="_underlayNode"]');
            underlay.style.display = 'block';
            setTimeout(() => { underlay.style.display = 'none'; }, 1000);
          });
        });
        for (const name of ['data.js', 'autoRefresh.js', 'content.js']) {
          await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') + `\n//# sourceURL=assyst-test/${name}` });
        }
        await page.clock.runFor(33000);
        let status = await page.evaluate(() => ({ requests: nativeRequests, completed: completions,
          observers, stacks: observerStacks, status: AssystAutoRefresh.getStatus() }));
        assert.equal(status.requests, 1); assert.equal(status.completed, 1);
        assert.equal(status.status.automaticAttempts, 1); assert.equal(status.status.automaticCompletions, 1);
        assert.equal(status.observers, 1, status.stacks.join('\n')); assert.equal(status.status.reason, 'waiting');
        await page.clock.runFor(33000);
        status = await page.evaluate(() => ({ requests: nativeRequests, completed: completions,
          pending: AssystAutoRefresh.isRefreshing() }));
        assert.equal(status.requests, 2); assert.equal(status.completed, 2); assert.equal(status.pending, false);
        assert.equal(await page.evaluate(() => wrapperClicks), 0, 'uses the supplied native valueNode without a second span click');
        assert.deepEqual(errors, []);
        console.log(`PASS Chromium native DOM: ${origin}, ${home ? 'homepage' : 'own queue'}, native valueNode click, unchanged data, one-second Standby, two cycles, one observer.`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
