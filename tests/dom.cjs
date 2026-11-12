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
async function setup({ route = '#events/2179427?eventType=1&currentIndex=5', index = 1, auto = false, total = 3, virtual = false, origin = 'https://cati.tjce.jus.br', home = false } = {}) {
  const html = `<nav><span class="breadcrumb">Página Inicial</span><span class="breadcrumb no-link-breadcrumb" data-component-tag="breadcrumb-index-${index}">2179427</span></nav>
    <select><option>Chamados atribuídos a mim</option></select><input id="filter" placeholder="Pesquisar">
    <p>Exibição de eventos 1 - ${total} de ${total} em Chamados Atribuídos a mim</p>
    <div class="dgrid"><table><thead><tr><th class="field-eventRef">Referência</th><th class="field-status">Status (Texto)</th></tr></thead></table>
    <div class="dgrid-scroller"><table><tbody id="rows"></tbody></table></div></div>`;
  const dom = new JSDOM(html, { url: origin + '/assystnet/' + route, pretendToBeVisual: true, runScripts: 'outside-only' });
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
  if (home) {
    const panel = doc.createElement('section');
    panel.id = 'ownPanel';
    const header = doc.createElement('div');
    header.className = 'axios-homepage-titlebar-outer';
    header.innerHTML = '<h2 class="axios-homepage-titlebar-inner">Chamados Atribuídos a mim</h2>';
    panel.append(header);
    for (const node of [...doc.body.children].filter(node => node.matches('select, input, p, .dgrid'))) panel.append(node);
    doc.body.append(panel);
    const other = doc.createElement('section');
    other.id = 'otherPanel';
    other.innerHTML = '<div class="axios-homepage-titlebar-outer"><h2 class="axios-homepage-titlebar-inner">Outros chamados</h2></div><input value="filtro de outro painel"><p>Exibição de eventos 1 - 99 de 99 em Outros chamados</p><div class="dgrid"><table><tr><th class="field-eventRef">Número</th></tr><tr><td class="field-eventRef">S999</td></tr></table></div>';
    doc.body.append(other);
  }
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
  for (const [index, origin] of [[1, 'http://cati.tj.ce.gov.br'], [2, 'https://cati.tjce.jus.br'], [5, 'https://cati.tjce.jus.br']]) {
    const env = await setup({ index, origin });
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
    assert.match(w.document.getElementById('reportStatus').textContent, /Baixe de qualquer tela/);
    w.document.getElementById('btnCSV').click();
    await until(() => bg.downloads.length === 1 && !w.document.getElementById('btnCSV').disabled);
    assert.match(w.document.getElementById('feedback').textContent, /na conferência de/);
    w.document.getElementById('btnRestoreCleanup').click();
    await until(() => w.document.getElementById('ticketCount').textContent === '2 com tag' && !w.document.getElementById('autoSync').checked);
    assert.equal(bg.read().assyst_ticket_tags.S9, 'REDMINE');
  } finally { await new Promise(resolve => setTimeout(resolve, 50)); w.close(); }
});


test('homepage panel alone authorizes complete cleanup and CSV on both internal and external hosts', async () => {
  for (const origin of ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br']) {
    const env = await setup({ route: '#homepage', home: true, origin, virtual: true });
    try {
      const live = await env.bg.send('export', { format: 'csv' });
      assert.ok(live.ok, live.error);
      assert.equal(live.count, 2);
      assert.equal(live.savedQueue, undefined);
      const liveCSV = await env.bg.downloads.at(-1).blob.text();
      assert.ok(liveCSV.includes('"S3";"Sem tag"') && !liveCSV.includes('"R2"') && !liveCSV.includes('"S999"'));
      const result = await env.bg.send('syncQueue');
      assert.ok(result.ok, result.error);
      assert.equal(result.total, 3);
      assert.equal(env.bg.read().assyst_ticket_tags.S9, undefined);
      assert.deepEqual(env.bg.read().assyst_queue_snapshot.tickets, ['2179427', 'S3']);
      env.w.history.pushState(null, '', '#events/2179427?eventType=1');
      env.options.tab.url = env.w.location.href;
      env.options.frames = [];
      const report = await env.bg.send('export', { format: 'csv' });
      assert.ok(report.ok, report.error);
      assert.equal(report.savedQueue, true);
      const csv = await env.bg.downloads.at(-1).blob.text();
      assert.ok(csv.includes('"S3";"Sem tag"'));
      assert.ok(!csv.includes('"R2"') && !csv.includes('"S999"') && !csv.includes('"S9"'));
      assert.equal(env.observers(), 1);
    } finally { await close(env); }
  }
});

test('homepage filters, duplicate own panels, missing totals and incomplete grids preserve saved marks', async () => {
  for (const mode of ['filter', 'duplicate', 'total', 'incomplete', 'loading']) {
    const env = await setup({ route: '#homepage', home: true, total: mode === 'incomplete' ? 4 : 3 });
    try {
      if (mode === 'filter') env.doc.getElementById('filter').value = 'R2';
      if (mode === 'duplicate') env.doc.querySelector('#otherPanel h2').textContent = 'Chamados Atribuídos a mim';
      if (mode === 'total') env.doc.querySelector('#ownPanel p').remove();
      if (mode === 'loading') env.doc.querySelector('#ownPanel .dgrid').setAttribute('aria-busy', 'true');
      const result = await env.bg.send('syncQueue');
      assert.equal(result.ok, false, mode);
      assert.equal(env.bg.read().assyst_ticket_tags.S9, 'ATENDIMENTO');
      assert.equal(env.bg.read().assyst_queue_snapshot, null);
      const report = await env.bg.send('export', { format: 'csv' });
      assert.equal(report.ok, false, mode);
      assert.equal(env.bg.downloads.length, 0);
    } finally { await close(env); }
  }
});

test('homepage automatically saves its own queue without opening the full monitor on both hosts', async () => {
  for (const origin of ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br']) {
    const env = await setup({ route: '#homepage', home: true, origin, auto: true });
    try {
      await until(() => env.bg.read().assyst_queue_snapshot);
      assert.equal(env.bg.read().assyst_last_queue_sync.total, 3);
      assert.equal(env.bg.read().assyst_ticket_tags.S9, undefined);
      assert.equal(env.w.location.hash, '#homepage');
      assert.equal(env.observers(), 1);
    } finally { await close(env); }
  }
});
