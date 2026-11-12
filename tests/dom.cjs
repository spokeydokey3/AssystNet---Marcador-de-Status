const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require(process.env.ASSYST_JSDOM_MODULE || 'jsdom');
const { background, root } = require('./harness.cjs');
const until = async fn => {
  const end = Date.now() + 10000;
  while (!fn()) {
    if (Date.now() > end) throw new Error('DOM condition timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
async function setup({ route = '#events/2179427?eventType=1&currentIndex=5', index = 1, auto = false, total = 3, virtual = false } = {}) {
  const html = `<nav><span class="breadcrumb">Página Inicial</span><span class="breadcrumb no-link-breadcrumb" data-component-tag="breadcrumb-index-${index}">2179427</span></nav>
    <select><option>Chamados atribuídos a mim</option></select><input id="filter" placeholder="Pesquisar">
    <p>Exibição de eventos 1 - ${total} de ${total} em Chamados Atribuídos a mim</p>
    <div class="dgrid"><table><thead><tr><th class="field-eventRef">Referência</th><th class="field-status">Status (Texto)</th></tr></thead></table>
    <div class="dgrid-scroller"><table><tbody id="rows"></tbody></table></div></div>`;
  const dom = new JSDOM(html, { url: 'https://cati.tjce.jus.br/assystnet/' + route, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window, doc = w.document;
  let observers = 0;
  const NativeObserver = w.MutationObserver;
  w.MutationObserver = class extends NativeObserver { constructor(callback) { super(callback); observers++; } };
  w.HTMLElement.prototype.getClientRects = function() { return this.closest('[hidden]') ? [] : [{ width: 100, height: 20 }]; };
  w.CSS = { escape: value => value };
  const entries = [['2179427', 'Aberto'], ['R2', 'Resolvido'], ['S3', 'Aberto']];
  const render = start => {
    const values = virtual ? entries.slice(start, start + 1) : entries;
    doc.getElementById('rows').innerHTML = values.map(([id, status]) => `<tr data-row-index="${entries.findIndex(v => v[0] === id)}"><td class="field-eventRef">${id}</td><td class="field-status">${status}</td></tr>`).join('');
  };
  render(0);
  const scroller = doc.querySelector('.dgrid-scroller');
  let top = 0;
  Object.defineProperties(scroller, {
    clientHeight: { value: 100 }, scrollHeight: { value: 300 },
    scrollTop: { get: () => top, set: value => { top = value; if (virtual) render(Math.min(2, Math.floor(value / 100))); } }
  });
  const listeners = [];
  const options = { tab: { id: 7, url: w.location.href },
    capture: message => listeners[0](message, { id: 'test@assyst' }),
    verify: message => listeners[0](message, { id: 'test@assyst' }) };
  const bg = background({ assyst_auto_sync: auto, assyst_ticket_tags: { '2179427': 'REDMINE', S9: 'ATENDIMENTO' },
    assyst_contacts: { S9: { attempts: ['2026-10-01'] } } }, options);
  let confirmations = 0;
  w.confirm = () => { confirmations++; return true; };
  w.browser = { runtime: { id: 'test@assyst', onMessage: { addListener(fn) { listeners.push(fn); } },
    sendMessage: message => bg.send(message.action, message) }, storage: bg.browser.storage };
  for (const name of ['data.js', 'autoRefresh.js', 'queue.js', 'content.js', 'detail.js']) w.eval(fs.readFileSync(`${root}/${name}`, 'utf8'));
  await until(() => doc.querySelector('td.field-eventRef select'));
  return { dom, w, doc, bg, options, listeners, confirmations: () => confirmations, observers: () => observers };
}
async function close(env) {
  env.w.dispatchEvent(new env.w.Event('pagehide'));
  await new Promise(resolve => setTimeout(resolve, 40));
  env.w.close();
}

test('home-page and queue breadcrumbs both bind the same saved tag regardless of index', async () => {
  for (const index of [1, 2, 5]) {
    const env = await setup({ index });
    try {
      await until(() => env.doc.querySelector('[data-assyst-ui="detail-controls"] select'));
      assert.equal(env.doc.querySelector('[data-assyst-ui="detail-controls"] select').value, 'REDMINE');
      assert.equal(env.doc.querySelectorAll('[data-assyst-ui="detail-controls"]').length, 1);
      assert.equal(env.observers(), 1);
    } finally { await close(env); }
  }
});

test('any contact box toggles optimistically in both views without confirmation', async () => {
  const env = await setup();
  try {
    await until(() => env.doc.querySelector('[data-assyst-ui="detail-controls"] .assyst-contact-controls'));
    const hosts = () => [...env.doc.querySelectorAll('.assyst-contact-controls[data-ticket-id="2179427"]')];
    const box = (host, index) => host.shadowRoot.querySelectorAll('input')[index];
    for (const index of [3, 1, 3]) {
      await until(() => !box(hosts()[0], index).disabled);
      const before = box(hosts()[0], index).checked;
      box(hosts()[0], index).click();
      assert.ok(hosts().every(host => box(host, index).checked === !before));
      await until(() => !box(hosts()[0], index).disabled);
    }
    assert.deepEqual(env.bg.read().assyst_contacts['2179427'].checks, [false, true, false, false]);
    assert.equal(env.confirmations(), 0);
  } finally { await close(env); }
});

test('navigation blocks stale handlers and binds the current full R reference', async () => {
  const env = await setup();
  try {
    await until(() => env.doc.querySelector('[data-assyst-ui="detail-controls"] .assyst-contact-controls'));
    const stale = env.doc.querySelector('[data-assyst-ui="detail-controls"] .assyst-contact-controls').shadowRoot.querySelector('input');
    env.w.history.pushState(null, '', '#events/R2478233?eventType=4&currentIndex=4');
    stale.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(env.bg.read().assyst_contacts['2179427'], undefined);
    env.doc.querySelector('.no-link-breadcrumb').textContent = 'R2478233';
    await until(() => env.doc.querySelector('[data-assyst-ui="detail-controls"]')?.dataset.ticketId === 'R2478233');
  } finally { await close(env); }
});

test('full virtual-grid cleanup reads every row twice and removes only absent records', async () => {
  const env = await setup({ route: '#eventMonitor/4', virtual: true });
  try {
    env.listeners[0]({ type: 'assyst-queue', action: 'probe', token: 'test' }, { id: 'test@assyst' });
    assert.equal(env.w.AssystQueueSync.isBusy(), true, 'refresh is deferred while a scan frame is being discovered');
    const result = await env.bg.send('syncQueue');
    assert.ok(result.ok, result.error); assert.equal(result.total, 3);
    assert.equal(env.bg.read().assyst_ticket_tags.S9, undefined);
    assert.equal(env.bg.read().assyst_ticket_tags['2179427'], 'REDMINE');
    assert.ok(env.bg.read().assyst_cleanup_backup);
    assert.equal(env.doc.querySelector('.dgrid-scroller').scrollTop, 0);
  } finally { await close(env); }
});

test('active text, hidden filters, extra selectors, loading or missing rows cannot authorize cleanup', async () => {
  for (const mode of ['text', 'hidden', 'select', 'busy', 'incomplete', 'otherQueue', 'refreshing']) {
    const env = await setup({ route: mode === 'otherQueue' ? '#eventMonitor/5' : '#eventMonitor/4', total: mode === 'incomplete' ? 4 : 3 });
    try {
      if (mode === 'text') env.doc.getElementById('filter').value = 'R2';
      if (mode === 'hidden') { const node = env.doc.createElement('input'); node.type = 'hidden'; node.name = 'activeFilter'; node.value = 'restricted'; env.doc.body.append(node); }
      if (mode === 'select') { const node = env.doc.createElement('select'); node.innerHTML = '<option>Somente urgentes</option>'; env.doc.body.append(node); }
      if (mode === 'busy') env.doc.querySelector('.dgrid').setAttribute('aria-busy', 'true');
      if (mode === 'refreshing') env.w.AssystAutoRefresh = { isRefreshing: () => true, changed() {} };
      const result = await env.bg.send('syncQueue');
      assert.equal(result.ok, false, mode);
      assert.equal(env.bg.read().assyst_ticket_tags.S9, 'ATENDIMENTO');
      assert.equal(env.bg.read().assyst_cleanup_backup, undefined);
    } finally { await close(env); }
  }
});

test('automatic synchronization runs after loading the own queue, without another observer', async () => {
  const env = await setup({ route: '#eventMonitor/4', auto: true });
  try {
    await until(() => env.bg.read().assyst_last_queue_sync);
    assert.equal(env.bg.read().assyst_ticket_tags.S9, undefined);
    assert.equal(env.bg.read().assyst_last_queue_sync.total, 3);
  } finally { await close(env); }
});

test('popup separates queue/mark counts and its recovery button restores records and pauses cleanup', async () => {
  const dom = new JSDOM(fs.readFileSync(`${root}/popup.html`, 'utf8'), { url: 'https://extension.test/popup.html', runScripts: 'outside-only' });
  const w = dom.window;
  const capture = { ok: true, complete: true, total: 1, queueTickets: ['S1'], tickets: ['S1'], unfiltered: true, scope: 'own' };
  const bg = background({ assyst_ticket_tags: { S1: 'REDMINE', S9: 'REDMINE' } }, { capture });
  w.confirm = () => true;
  w.browser = { runtime: { sendMessage: message => bg.send(message.action, message) }, storage: bg.browser.storage };
  w.eval(fs.readFileSync(`${root}/data.js`, 'utf8'));
  w.eval(fs.readFileSync(`${root}/popup.js`, 'utf8'));
  try {
    await until(() => w.document.getElementById('ticketCount').textContent === '2 com tag' && !w.document.getElementById('btnSync').disabled);
    assert.equal(w.document.getElementById('refreshEnabled').checked, false);
    assert.equal(w.document.getElementById('refreshInterval').value, '60');
    w.document.getElementById('refreshEnabled').checked = true;
    w.document.getElementById('refreshEnabled').dispatchEvent(new w.Event('change'));
    await until(() => bg.read().assyst_refresh_settings?.enabled === true);
    w.document.getElementById('refreshInterval').value = '120';
    w.document.getElementById('refreshInterval').dispatchEvent(new w.Event('change'));
    await until(() => bg.read().assyst_refresh_settings?.intervalSeconds === 120);
    w.document.getElementById('btnSync').click();
    await until(() => w.document.getElementById('queueCount').textContent === 'Última fila: 1' && !w.document.getElementById('btnRestoreCleanup').hidden && !w.document.getElementById('btnRestoreCleanup').disabled);
    assert.equal(w.document.getElementById('ticketCount').textContent, '1 com tag');
    w.document.getElementById('btnRestoreCleanup').click();
    await until(() => w.document.getElementById('ticketCount').textContent === '2 com tag' && !w.document.getElementById('autoSync').checked);
    assert.equal(bg.read().assyst_ticket_tags.S9, 'REDMINE');
  } finally { await new Promise(resolve => setTimeout(resolve, 50)); w.close(); }
});
