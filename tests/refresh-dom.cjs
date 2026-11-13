const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require(process.env.ASSYST_JSDOM_MODULE || 'jsdom');
const FakeTimers = require(process.env.ASSYST_FAKE_TIMERS_MODULE || '@sinonjs/fake-timers');
const { root } = require('./harness.cjs');
const KEY = 'assyst_refresh_settings';
const prefs = (overrides = {}) => ({ enabled: true, intervalSeconds: 30, background: false, ...overrides });

async function setup({ hash = '#eventMonitor/4', settings = prefs(), complete = true, origin = 'https://cati.tjce.jus.br', standby = false } = {}) {
  const dom = new JSDOM(`<!doctype html><meta charset="utf-8"><body tabindex="-1">
    <input id="editor"><div id="dialog" role="dialog" hidden></div>
    <section id="assigned"><select><option>Chamados Atribuídos a mim</option><option>Outra fila</option></select>
      <span role="button" data-component-tag="eventMonitorRefreshButton" id="uniq_dynamic_1" data-test="assigned">Atualizar</span>
      <div class="dgrid"><table><tr><td class="field-eventRef">S1</td></tr></table></div></section>
    <main id="home">
      <section id="ownPanel"><div class="axios-homepage-titlebar-outer"><h2 class="axios-homepage-titlebar-inner">Chamados Atribuídos a mim</h2>
        <span role="button" data-component-tag="refresh" data-test="home"><span class="refreshButtonIcon"></span></span></div>
        <div class="dgrid"><table><tr><td class="field-eventRef">R2</td></tr></table></div></section>
      <section><div class="axios-homepage-titlebar-outer"><h2 class="axios-homepage-titlebar-inner">Outros chamados</h2>
        <span role="button" data-component-tag="refresh" data-test="wrong"><span class="refreshButtonIcon"></span></span></div>
        <div class="dgrid">Outro painel</div></section>
    </main>`, { url: origin + '/assystnet/' + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, doc = w.document;
  w.HTMLElement.prototype.getClientRects = function() { return this.closest('[hidden]') ? [] : [{ width: 100, height: 20 }]; };
  w.HTMLElement.prototype.getBoundingClientRect = function() {
    const left = parseFloat(this.style.left) || 0;
    return { left, right: left + 100, top: 0, bottom: 20, width: 100, height: 20 };
  };
  const overlay = doc.createElement('div');
  overlay.setAttribute('data-dojo-attach-point', '_underlayNode');
  overlay.style.cssText = 'display:none;position:absolute;cursor:wait;opacity:.75';
  doc.body.append(overlay);
  const clock = FakeTimers.withGlobal(w).install({ now: Date.UTC(2026, 10, 12, 12), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  let hidden = false, queueBusy = false, tagBusy = false, finished = 0, saved = settings, reads = 0;
  Object.defineProperty(doc, 'hidden', { get: () => hidden, configurable: true });
  const listeners = new Set(), clicks = [];
  w.AssystQueueSync = { isBusy: () => queueBusy, refreshFinished: () => { finished++; } };
  w.AssystTaggerUI = { isBusy: () => tagBusy };
  w.browser = { storage: {
    local: { async get() { reads++; return { [KEY]: saved }; } },
    onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } }
  } };
  function showRoute(route) {
    doc.getElementById('assigned').hidden = route !== '#eventMonitor/4';
    doc.getElementById('home').hidden = route !== '#homepage';
  }
  showRoute(hash);
  doc.addEventListener('click', event => {
    const button = event.target.closest('[data-test]');
    if (!button) return;
    clicks.push(button.dataset.test);
    if (!complete) return;
    if (standby) {
      overlay.style.display = 'block';
      w.setTimeout(() => { overlay.style.display = 'none'; }, 1000);
      return;
    }
    button.setAttribute('aria-disabled', 'true');
    w.setTimeout(() => {
      const cell = button.closest('section').querySelector('td.field-eventRef');
      if (cell) cell.textContent += 'x';
      button.setAttribute('aria-disabled', 'false');
    }, 500);
  });
  w.eval(fs.readFileSync(`${root}/data.js`, 'utf8'));
  w.eval(fs.readFileSync(`${root}/autoRefresh.js`, 'utf8'));
  // Forward native records as the production content.js observer does; the module has no observer of its own.
  const observer = new w.MutationObserver(records => w.AssystAutoRefresh.changed(records));
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled', 'aria-disabled', 'aria-busy', 'style', 'hidden'] });
  await clock.tickAsync(0);
  return { w, doc, clock, clicks, get finished() { return finished; }, get reads() { return reads; },
    queueBusy(value) { queueBusy = value; }, tagBusy(value) { tagBusy = value; },
    visibility(value) { hidden = value; doc.dispatchEvent(new w.Event('visibilitychange')); },
    settings(value) { saved = value; for (const fn of listeners) fn({ [KEY]: { newValue: value } }, 'local'); },
    route(value) { w.history.pushState(null, '', value); showRoute(value); w.dispatchEvent(new w.HashChangeEvent('hashchange')); },
    close() { w.dispatchEvent(new w.Event('pagehide')); observer.disconnect(); clock.uninstall(); w.close(); }
  };
}

test('disabled defaults never click or schedule an update', async () => {
  const e = await setup({ settings: null });
  try { await e.clock.tickAsync(600000); assert.deepEqual(e.clicks, []); assert.equal(e.clock.countTimers(), 0); }
  finally { e.close(); }
});

test('native refresh repeats without reloading and tolerates dynamic button IDs', async () => {
  const e = await setup();
  try {
    const href = e.w.location.href;
    await e.clock.tickAsync(32000); assert.deepEqual(e.clicks, ['assigned']); assert.equal(e.finished, 1);
    e.doc.querySelector('[data-test="assigned"]').id = 'new_dynamic_id';
    await e.clock.tickAsync(32000); assert.deepEqual(e.clicks, ['assigned', 'assigned']);
    assert.equal(e.w.location.href, href); assert.equal(e.clock.countTimers(), 1); assert.equal(e.reads, 1);
  } finally { e.close(); }
});

test('homepage refresh is scoped to the named panel, not the other generic refresh button', async () => {
  const e = await setup({ hash: '#homepage' });
  try { await e.clock.tickAsync(32000); assert.deepEqual(e.clicks, ['home']); assert.equal(e.finished, 1); }
  finally { e.close(); }
});

test('SPA navigation switches buttons and duplicate matching panels or unsupported routes fail closed', async () => {
  const e = await setup();
  try {
    await e.clock.tickAsync(32000); e.route('#homepage'); await e.clock.tickAsync(32000);
    assert.deepEqual(e.clicks, ['assigned', 'home']);
    e.doc.querySelector('#home > section:last-child h2').textContent = 'Chamados Atribuídos a mim';
    await e.clock.tickAsync(60000); assert.deepEqual(e.clicks, ['assigned', 'home']);
    e.route('#events/R2478233'); await e.clock.tickAsync(60000); assert.equal(e.clicks.length, 2);
  } finally { e.close(); }
});

test('turning off cancels future clicks immediately and interval changes leave only one timer', async () => {
  const e = await setup();
  try {
    await e.clock.tickAsync(29000); e.settings(prefs({ enabled: false }));
    await e.clock.tickAsync(600000); assert.deepEqual(e.clicks, []); assert.equal(e.clock.countTimers(), 0);
    e.settings(prefs({ intervalSeconds: 120 })); assert.equal(e.clock.countTimers(), 1);
    await e.clock.tickAsync(119000); assert.deepEqual(e.clicks, []);
    await e.clock.tickAsync(3000); assert.deepEqual(e.clicks, ['assigned']);
  } finally { e.close(); }
});

test('background updates are opt-in, and returning to foreground resumes safely', async () => {
  const e = await setup();
  try {
    e.visibility(true); await e.clock.tickAsync(90000); assert.deepEqual(e.clicks, []);
    e.settings(prefs({ background: true })); await e.clock.tickAsync(32000); assert.deepEqual(e.clicks, ['assigned']);
    e.settings(prefs({ background: false })); await e.clock.tickAsync(60000); assert.equal(e.clicks.length, 1);
    e.visibility(false); await e.clock.tickAsync(32000); assert.equal(e.clicks.length, 2);
  } finally { e.close(); }
});

test('manual native refresh resets the schedule rather than adding a second interval', async () => {
  const e = await setup();
  try {
    await e.clock.tickAsync(10000); e.doc.querySelector('[data-test="assigned"]').click();
    await e.clock.tickAsync(21000); assert.deepEqual(e.clicks, ['assigned']);
    await e.clock.tickAsync(12000); assert.deepEqual(e.clicks, ['assigned', 'assigned']);
    assert.equal(e.clock.countTimers(), 1);
  } finally { e.close(); }
});

test('turning off during a request allows completion but never schedules another refresh', async () => {
  const e = await setup();
  try {
    await e.clock.tickAsync(30000); assert.equal(e.clicks.length, 1);
    e.settings(prefs({ enabled: false }));
    await e.clock.tickAsync(600000); assert.equal(e.clicks.length, 1);
    assert.equal(e.w.AssystAutoRefresh.isRefreshing(), false); assert.equal(e.clock.countTimers(), 0);
  } finally { e.close(); }
});

test('editing, selections, modal dialogs, tag writes and queue scans defer automatic clicks', async () => {
  const e = await setup();
  try {
    e.doc.getElementById('editor').focus(); await e.clock.tickAsync(30000); assert.equal(e.clicks.length, 0);
    e.doc.getElementById('editor').blur(); e.doc.getElementById('dialog').textContent = 'Diálogo aberto'; e.doc.getElementById('dialog').hidden = false;
    await e.clock.tickAsync(2000); assert.equal(e.clicks.length, 0);
    e.doc.getElementById('dialog').hidden = true; e.queueBusy(true); await e.clock.tickAsync(2000); assert.equal(e.clicks.length, 0);
    e.queueBusy(false); e.tagBusy(true); await e.clock.tickAsync(2000); assert.equal(e.clicks.length, 0);
    e.tagBusy(false); e.doc.querySelector('#assigned tr').classList.add('dgrid-selected'); await e.clock.tickAsync(2000); assert.equal(e.clicks.length, 0);
    e.doc.querySelector('#assigned tr').classList.remove('dgrid-selected');
    const range = e.doc.createRange(); range.selectNodeContents(e.doc.querySelector('#assigned td'));
    e.doc.getSelection().addRange(range); await e.clock.tickAsync(2000); assert.equal(e.clicks.length, 0);
    e.doc.getSelection().removeAllRanges(); await e.clock.tickAsync(3000); assert.equal(e.clicks.length, 1);
  } finally { e.close(); }
});

test('disabled/loading buttons and missing buttons never receive clicks', async () => {
  const e = await setup();
  try {
    const button = e.doc.querySelector('[data-test="assigned"]'); button.setAttribute('aria-disabled', 'true');
    await e.clock.tickAsync(30000); assert.equal(e.clicks.length, 0);
    button.remove(); await e.clock.tickAsync(90000); assert.equal(e.clicks.length, 0);
  } finally { e.close(); }
});

test('unknown refresh completion stops repeat clicks and keeps cleanup locked; late native data can release it', async () => {
  const e = await setup({ complete: false });
  try {
    await e.clock.tickAsync(180000); assert.deepEqual(e.clicks, ['assigned']);
    assert.equal(e.w.AssystAutoRefresh.getStatus().paused, true); assert.equal(e.w.AssystAutoRefresh.isRefreshing(), true);
    e.doc.querySelector('#assigned td').textContent = 'new row'; await e.clock.tickAsync(2000);
    assert.equal(e.w.AssystAutoRefresh.isRefreshing(), false); assert.equal(e.finished, 1);
  } finally { e.close(); }
});

test('a button temporarily removed during native refresh does not release the cleanup guard', async () => {
  const e = await setup({ complete: false });
  try {
    await e.clock.tickAsync(30000);
    const button = e.doc.querySelector('[data-test="assigned"]'); button.remove();
    await e.clock.tickAsync(1000); assert.equal(e.w.AssystAutoRefresh.isRefreshing(), true);
    e.doc.getElementById('assigned').prepend(button);
    button.setAttribute('aria-disabled', 'true'); await e.clock.tickAsync(500);
    button.setAttribute('aria-disabled', 'false'); e.doc.querySelector('#assigned td').textContent = 'updated';
    await e.clock.tickAsync(1500); assert.equal(e.w.AssystAutoRefresh.isRefreshing(), false);
    assert.deepEqual(e.clicks, ['assigned']);
  } finally { e.close(); }
});

test('page lifecycle clears schedules and BFCache restore does not duplicate listeners or timers', async () => {
  const e = await setup();
  try {
    e.w.dispatchEvent(new e.w.Event('pagehide')); assert.equal(e.clock.countTimers(), 0);
    const restored = new e.w.Event('pageshow'); Object.defineProperty(restored, 'persisted', { value: true });
    e.w.dispatchEvent(restored); await e.clock.tickAsync(0); assert.equal(e.clock.countTimers(), 1);
    e.w.dispatchEvent(restored); assert.equal(e.clock.countTimers(), 1);
    await e.clock.tickAsync(32000); assert.deepEqual(e.clicks, ['assigned']);
  } finally { e.close(); }
});


test('native refresh supports both permitted hosts and both queue views', async () => {
  for (const origin of ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br']) {
    for (const hash of ['#homepage', '#eventMonitor/4']) {
      const e = await setup({ hash, origin });
      try {
        await e.clock.tickAsync(32000);
        assert.deepEqual(e.clicks, [hash === '#homepage' ? 'home' : 'assigned']);
        assert.equal(e.finished, 1);
      } finally { e.close(); }
    }
  }
});


test('one-second Dojo Standby style-only animation completes even when queue data is unchanged', async () => {
  const e = await setup({ standby: true });
  try {
    await e.clock.tickAsync(33000);
    assert.equal(e.finished, 1);
    assert.equal(e.w.AssystAutoRefresh.isRefreshing(), false);
    await e.clock.tickAsync(33000);
    assert.deepEqual(e.clicks, ['assigned', 'assigned']);
    assert.equal(e.finished, 2);
  } finally { e.close(); }
});

test('parked offscreen Dojo popup wrappers do not block automatic refresh', async () => {
  const e = await setup();
  try {
    const menu = e.doc.createElement('div');
    menu.className = 'dijitPopup';
    menu.style.cssText = 'position:absolute;left:-10000px;top:0;width:100px;height:20px';
    e.doc.body.append(menu);
    await e.clock.tickAsync(33000);
    assert.deepEqual(e.clicks, ['assigned']);
  } finally { e.close(); }
});

test('manual refresh protects scanning during Standby even when automatic clicking is disabled', async () => {
  const e = await setup({ settings: prefs({ enabled: false }), standby: true });
  try {
    e.doc.querySelector('[data-test="assigned"]').click();
    assert.equal(e.w.AssystAutoRefresh.isRefreshing(), true);
    await e.clock.tickAsync(3000);
    assert.equal(e.w.AssystAutoRefresh.isRefreshing(), false);
    assert.equal(e.finished, 1);
    await e.clock.tickAsync(120000);
    assert.deepEqual(e.clicks, ['assigned']);
  } finally { e.close(); }
});

test('continuous loading mutations cannot postpone the request timeout indefinitely', async () => {
  const e = await setup({ complete: false });
  try {
    await e.clock.tickAsync(30000);
    for (let i = 0; i < 500; i++) {
      e.doc.querySelector('#assigned .dgrid').setAttribute('aria-busy', 'true');
      await e.clock.tickAsync(100);
    }
    assert.equal(e.w.AssystAutoRefresh.getStatus().paused, true);
    assert.deepEqual(e.clicks, ['assigned']);
  } finally { e.close(); }
});

test('status explains editing, active and parked menus, loading and uncertain completion', async () => {
  const e = await setup({ complete: false });
  try {
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'waiting');
    e.doc.getElementById('editor').focus();
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'editing');
    e.doc.getElementById('editor').blur();
    const popup = e.doc.createElement('div'); popup.className = 'dijitPopup';
    popup.innerHTML = '<div role="menuitem">Abrir</div>';
    e.doc.body.append(popup);
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'menu');
    popup.style.left = '-10000px';
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'waiting');
    const standby = e.doc.querySelector('[data-dojo-attach-point="_underlayNode"]');
    standby.style.display = 'block';
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'loading');
    standby.style.display = 'none';
    await e.clock.tickAsync(80000);
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'unknown');
    e.settings(prefs({ enabled: false }));
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'disabled');
  } finally { e.close(); }
});

test('persistent listboxes, empty popup wrappers and ordinary boolean cells are not active selections', async () => {
  for (const kind of ['listbox', 'emptyPopup', 'boolean', 'cellClass', 'offscreenDialog']) {
    const e = await setup();
    try {
      const node = e.doc.createElement(kind === 'boolean' ? 'input' : 'div');
      if (kind === 'listbox') { node.setAttribute('role', 'listbox'); node.innerHTML = '<div role="option">Item fixo</div>'; }
      if (kind === 'emptyPopup') node.className = 'dijitPopup';
      if (kind === 'boolean') { node.type = 'checkbox'; node.checked = true; }
      if (kind === 'cellClass') node.className = 'dgrid-selected';
      if (kind === 'offscreenDialog') { node.setAttribute('role', 'dialog'); node.style.left = '-10000px'; node.textContent = 'Diálogo estacionado'; }
      (kind === 'boolean' || kind === 'cellClass' ? e.doc.querySelector('#assigned td') : e.doc.body).append(node);
      assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'waiting', kind);
      await e.clock.tickAsync(33000);
      assert.deepEqual(e.clicks, ['assigned'], kind);
    } finally { e.close(); }
  }
});

test('stale selections in a hidden panel and selected rows in unrelated grids do not pause the queue', async () => {
  const e = await setup({ hash: '#homepage' });
  try {
    const range = e.doc.createRange(); range.selectNodeContents(e.doc.querySelector('#assigned td'));
    e.doc.getSelection().addRange(range);
    const other = e.doc.querySelector('#home > section:last-child');
    other.innerHTML += '<div class="dgrid"><div class="dgrid-row dgrid-selected" role="row" aria-selected="true">Other grid</div></div>';
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'waiting');
    await e.clock.tickAsync(33000);
    assert.deepEqual(e.clicks, ['home']);
  } finally { e.close(); }
});

test('actual row selectors, open menus, visible dialogs and text selection report distinct pause reasons', async () => {
  const e = await setup();
  try {
    const row = e.doc.querySelector('#assigned tr');
    row.classList.add('dgrid-selected');
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'rowSelection');
    row.classList.remove('dgrid-selected');
    const box = e.doc.createElement('input'); box.type = 'checkbox'; box.className = 'dgrid-selector'; box.checked = true;
    row.append(box);
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'rowSelection');
    box.remove();
    const popup = e.doc.createElement('div'); popup.className = 'dijitPopup';
    popup.innerHTML = '<div role="menu"><div role="menuitem">Abrir</div></div>'; e.doc.body.append(popup);
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'menu');
    popup.remove();
    e.doc.getElementById('dialog').textContent = 'Ação em andamento'; e.doc.getElementById('dialog').textContent = 'Diálogo aberto'; e.doc.getElementById('dialog').hidden = false;
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'dialog');
    e.doc.getElementById('dialog').hidden = true;
    const range = e.doc.createRange(); range.selectNodeContents(e.doc.querySelector('#assigned td'));
    e.doc.getSelection().addRange(range);
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'textSelection');
    await e.clock.tickAsync(33000); assert.equal(e.clicks.length, 0);
    e.doc.getSelection().removeAllRanges();
    await e.clock.tickAsync(2000); assert.equal(e.clicks.length, 1);
  } finally { e.close(); }
});

test('only an expanded control makes a standalone listbox an open menu; stale row ARIA and transparent dialogs are ignored', async () => {
  const e = await setup();
  try {
    const control = e.doc.createElement('button'); control.setAttribute('aria-controls', 'options'); control.setAttribute('aria-expanded', 'false');
    const menu = e.doc.createElement('div'); menu.id = 'options'; menu.setAttribute('role', 'listbox'); menu.innerHTML = '<div role="option">Opção</div>';
    e.doc.body.append(control, menu);
    const row = e.doc.querySelector('#assigned tr'); row.classList.add('dgrid-selected'); row.setAttribute('aria-selected', 'false');
    const dialog = e.doc.getElementById('dialog'); dialog.hidden = false; dialog.style.opacity = '0'; dialog.innerHTML = '<p>Diálogo fechado</p>';
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'waiting');
    control.setAttribute('aria-expanded', 'true');
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'menu');
    await e.clock.tickAsync(33000); assert.equal(e.clicks.length, 0);
    control.setAttribute('aria-expanded', 'false');
    await e.clock.tickAsync(3000); assert.equal(e.clicks.length, 1);
    dialog.style.opacity = '1';
    assert.equal(e.w.AssystAutoRefresh.getStatus().reason, 'dialog');
  } finally { e.close(); }
});
