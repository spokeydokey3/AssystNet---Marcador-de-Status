(() => {
  'use strict';
  const CELL = 'td.field-eventRef';
  const OWNED = '[data-assyst-ui]';
  const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let busy = false;
  let lastCaptureEndedAt = -Infinity;
  let probeLeaseUntil = -Infinity;

  function shown(node) {
    for (let current = node; current && current !== document.documentElement; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hidden || current.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function textWithoutUI(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode(text) {
        return text.parentElement?.closest(`${OWNED}, .axios-offscreen-content`)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let text = '';
    while (walker.nextNode()) text += walker.currentNode.textContent;
    return text.trim();
  }

  function view() {
    let hash = location.hash;
    try { hash = window.top.location.hash || hash; } catch { /* Frame-local route. */ }
    if (!/^#homepage\/?$/i.test(hash)) return { root: document.body, hash, home: false };
    const headers = [...document.querySelectorAll('.axios-homepage-titlebar-outer')].filter(node => shown(node) &&
      [...node.querySelectorAll('h2.axios-homepage-titlebar-inner')].some(title => fold(title.textContent) === 'chamados atribuidos a mim'));
    if (headers.length !== 1) throw new Error('Não encontrei um único painel “Chamados atribuídos a mim” na Página Inicial.');
    for (let root = headers[0].parentElement; root && root !== document.body; root = root.parentElement) {
      if (root.querySelectorAll('.axios-homepage-titlebar-outer').length !== 1) break;
      if (root.querySelector('.dgrid, [role="grid"]')) return { root, hash, home: true };
    }
    throw new Error('Não consegui identificar a tabela do painel da sua fila.');
  }

  function grids() {
    let root;
    try { root = view().root; } catch { return []; }
    return [...new Set([...root.querySelectorAll(`${CELL}, th.field-eventRef, .dgrid-header .field-eventRef`)].filter(shown)
      .map(cell => cell.closest('.dgrid, [role="grid"]')).filter(Boolean))];
  }

  function context(grid) {
    const { root, home } = view();
    if (!root.contains(grid)) throw new Error('A tabela não pertence à sua fila.');
    const wanted = 'chamados atribuidos a mim';
    let ownQueue = false;
    let ownCounter = false;
    const signatures = [];
    for (const select of root.querySelectorAll('select')) {
      if (select.closest(OWNED) || !shown(select)) continue;
      if ([...select.options].some(option => fold(option.textContent) === wanted)) {
        const selected = fold(select.selectedOptions[0]?.textContent || '');
        if (selected !== wanted) throw new Error('Selecione “Chamados atribuídos a mim” antes de exportar.');
        ownQueue = true;
        signatures.push(selected);
      }
    }
    const totals = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode.parentElement;
      if (!node || node.closest(`${OWNED}, script, style, option, .dgrid-row, .axios-offscreen-content`) || !shown(node)) continue;
      const value = fold(walker.currentNode.textContent);
      if (value === wanted) ownQueue = true;
      // The counter may split its numbers over spans. Read small enclosing elements only.
      for (let parent = node, depth = 0; parent && depth < 3; parent = parent.parentElement, depth++) {
        const raw = fold(parent.textContent);
        if (raw.length > 220) break;
        const match = raw.match(/exibicao de eventos\s*:?\s*([\d.]+)\s*[-–]\s*([\d.]+)\s*de\s*([\d.]+)/);
        if (match) {
          totals.add(Number(match[3].replace(/\./g, '')));
          if (/\bem\s+chamados atribuidos a mim\b/.test(raw)) ownCounter = true;
        }
      }
    }
    if (!ownQueue) throw new Error('Abra “Chamados atribuídos a mim” antes de exportar.');
    if (totals.size !== 1) throw new Error('Não consegui identificar o total da fila. Confira se “Exibição de eventos … de …” está visível.');
    const [total] = totals;
    if (!Number.isSafeInteger(total) || total < 0 || total > 100000) throw new Error('O total da fila é inválido.');
    const headers = [...new Set(grid.querySelectorAll('th, [role="columnheader"], .dgrid-header .dgrid-cell'))];
    const header = headers.find(node => fold(node.textContent).replace(/[()]/g, '') === 'status texto');
    if (!header) throw new Error('Não encontrei a coluna “Status (Texto)”. Não foi gerado um relatório incompleto.');
    const field = [...header.classList].find(name => name.startsWith('field-'));
    return { total, signature: JSON.stringify([home, ...signatures]), field, index: headers.indexOf(header), ownCounter, selectedOwnQueue: signatures.length > 0, home };
  }

  function cleanupContext(grid) {
    if (globalThis.AssystAutoRefresh?.isLoading?.()) throw new Error('Aguarde o carregamento do AssystNet terminar antes de conferir a fila.');
    const { hash, root, home } = view();
    if (!home && !/^#eventMonitor\/4\/?$/i.test(hash)) throw new Error('Abra a Página Inicial ou “Chamados atribuídos a mim” para conferir a fila.');
    const current = context(grid);
    if (!home && !current.ownCounter && !current.selectedOwnQueue) throw new Error('O nome da fila não foi confirmado no contador ou seletor. Nada será limpo.');
    const neutral = value => ['', 'todos', 'todas', 'all', 'qualquer', 'sem filtro', '{}', '[]'].includes(fold(value));
    for (const node of root.querySelectorAll('input, textarea, select, [role="combobox"]')) {
      if (node.closest(OWNED)) continue;
      const hiddenFilter = node.matches('input[type="hidden"]') && /filter|filtro|search|pesquis|query/i.test((node.name || '') + ' ' + node.id);
      if (!shown(node) && !hiddenFilter) continue;
      if (node.matches('input[type="password"]')) throw new Error('Confirme o acesso ao AssystNet antes da limpeza.');
      if (node.matches('select')) {
        const selected = fold(node.selectedOptions[0]?.textContent || '');
        if (selected === 'chamados atribuidos a mim') continue;
        if (!neutral(node.value) && !neutral(selected)) throw new Error('Remova os filtros e seleções adicionais antes da limpeza.');
      } else if (node.matches('input[type="checkbox"], input[type="radio"]')) {
        if (node.checked) throw new Error('Desmarque os filtros ou seleções antes da limpeza.');
      } else if (!node.matches('input[type="button"], input[type="submit"], input[type="reset"]')) {
        const value = node.value ?? node.getAttribute('aria-valuetext') ?? node.textContent;
        if (!neutral(value) && fold(value) !== 'chamados atribuidos a mim') throw new Error('Há busca ou filtro preenchido. Nada será limpo.');
      }
    }
    for (const node of root.querySelectorAll('[aria-busy="true"], [role="dialog"][aria-modal="true"], .dgrid-loading, .dgrid-preload-loading, .filter-active, .active-filter, .dgrid-filtered, [data-filter-active="true"]')) {
      if (!node.closest(OWNED) && shown(node)) throw new Error('A fila está carregando ou tem filtros ativos. Nada será limpo.');
    }
    for (const node of document.querySelectorAll('input[type="password"], [role="dialog"][aria-modal="true"]')) {
      if (!node.closest(OWNED) && shown(node)) throw new Error('Confirme o acesso e feche os diálogos antes de conferir a fila.');
    }
    return { ...current, unfiltered: true, scope: JSON.stringify([hash, current.total, current.signature, current.field, current.index]) };
  }

  async function capture(cleanup = false) {
    if (globalThis.AssystAutoRefresh?.isRefreshing()) throw new Error('Aguarde a atualização da lista antes de conferir a fila.');
    if (busy) throw new Error('A leitura da fila já está em andamento.');
    busy = true;
    let scroller, originalTop, grid, initial;
    try {
      const candidates = grids();
      if (candidates.length !== 1) throw new Error('Não encontrei uma única tabela da fila. Recarregue o AssystNet.');
      [grid] = candidates;
      initial = cleanupContext(grid);
      const href = location.href;
      const records = new Map(), positions = new Map();
      const deadline = Date.now() + 45000;
      const assertContext = () => {
        if (globalThis.AssystAutoRefresh?.isRefreshing()) throw new Error('A atualização do AssystNet interrompeu a leitura. Aguarde e tente novamente.');
        if (!grid.isConnected || location.href !== href) throw new Error('A página mudou durante a leitura. Exporte novamente.');
        const current = cleanupContext(grid);
        if (current.total !== initial.total || current.signature !== initial.signature || current.field !== initial.field || current.index !== initial.index) {
          throw new Error('A fila mudou durante a leitura. Aguarde a atualização e exporte novamente.');
        }
      };
      const collect = () => {
        assertContext();
        const now = [];
        for (const cell of grid.querySelectorAll(CELL)) {
          if (!shown(cell)) continue;
          const ticket = AssystData.identifier(textWithoutUI(cell), 'Número do chamado');
          const row = cell.closest('tr');
          const statusCell = initial.field ? row?.querySelector('.' + CSS.escape(initial.field)) : row?.cells[initial.index];
          if (!statusCell || statusCell === cell) throw new Error('Não consegui conferir o status de todas as linhas. Nenhum CSV foi gerado.');
          const status = fold(textWithoutUI(statusCell));
          if (!status) throw new Error('A fila ainda está carregando os status. Aguarde e exporte novamente.');
          const position = cell.closest('[data-row-index], [aria-rowindex]');
          const index = position?.getAttribute('data-row-index') ?? position?.getAttribute('aria-rowindex');
          if ((index !== null && index !== undefined && positions.has(index) && positions.get(index) !== ticket) ||
              (records.has(ticket) && records.get(ticket) !== status)) throw new Error('As linhas da fila mudaram durante a leitura. Exporte novamente.');
          if (index !== null && index !== undefined) positions.set(index, ticket);
          records.set(ticket, status);
          now.push(ticket);
        }
        if (records.size > initial.total) throw new Error('A contagem da fila mudou. Exporte novamente.');
        return now;
      };
      scroller = grid.querySelector('.dgrid-scroller');
      if (scroller) { originalTop = scroller.scrollTop; scroller.scrollTop = 0; await pause(220); }
      const first = collect();
      let stalled = 0;
      while (records.size < initial.total && Date.now() < deadline) {
        if (!scroller || scroller.clientHeight <= 0) break;
        const before = records.size;
        scroller.scrollTop = Math.min(scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollTop + Math.max(100, Math.floor(scroller.clientHeight * 0.6)));
        await pause(250);
        collect();
        stalled = before === records.size ? stalled + 1 : 0;
        if (stalled >= 12) break;
      }
      if (records.size !== initial.total) throw new Error(`Fila incompleta: li ${records.size} de ${initial.total} chamados. Aguarde carregar a tabela e tente novamente. Paginação manual requer adaptação; nenhum CSV foi gerado.`);
      // Recheck the starting window after scanning, before exposing any references.
      if (scroller) { scroller.scrollTop = 0; await pause(220); }
      const last = collect();
      if (!first.every((ticket, index) => last[index] === ticket)) throw new Error('A fila mudou durante a leitura. Exporte novamente.');
      return { ok: true, complete: true, total: initial.total,
        tickets: [...records].filter(([, status]) => ['aberto', 'open'].includes(status)).map(([ticket]) => ticket),
        ...(cleanup ? { queueTickets: [...records.keys()], unfiltered: true, scope: initial.scope } : {}) };
    } finally {
      if (scroller?.isConnected && grid?.isConnected && originalTop !== undefined &&
          !globalThis.AssystAutoRefresh?.isRefreshing() && !globalThis.AssystAutoRefresh?.isLoading?.()) scroller.scrollTop = originalTop;
      busy = false;
      lastCaptureEndedAt = Date.now();
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'assyst-queue') return undefined;
    if (message.action === 'probe') {
      if (grids().length) {
        probeLeaseUntil = Date.now() + 800;
        browser.runtime.sendMessage({ type: 'assyst-tagger', action: 'queueReady', token: message.token }).catch(() => undefined);
      }
      return undefined;
    }
    if (message.action === 'capture') return capture(message.cleanup === true).catch(error => ({ ok: false, error: error.message }));
    if (message.action === 'verify') {
      try {
        if (globalThis.AssystAutoRefresh?.isRefreshing()) throw new Error('A lista está sendo atualizada. Nada será limpo.');
        const candidates = grids();
        if (candidates.length !== 1) throw new Error('Fila ambígua.');
        const info = cleanupContext(candidates[0]);
        return Promise.resolve({ ok: true, scope: info.scope, total: info.total, unfiltered: true });
      } catch (error) { return Promise.resolve({ ok: false, error: error.message }); }
    }
    return undefined;
  });

  let timer = 0, stopped = false, running = false, nextAllowed = 0, ignoreUntil = 0;
  function scheduleSync() {
    if (stopped || running || Date.now() < ignoreUntil || document.hidden || globalThis.AssystAutoRefresh?.isRefreshing()) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = 0;
      if (stopped || document.hidden || globalThis.AssystAutoRefresh?.isRefreshing()) return;
      try {
        const candidates = grids();
        if (candidates.length !== 1) return;
        cleanupContext(candidates[0]);
        running = true; nextAllowed = Date.now() + 30000;
        await browser.runtime.sendMessage({ type: 'assyst-tagger', action: 'syncQueue', automatic: true });
      } catch { /* Unsafe or incomplete views never authorize deletion. Manual sync explains the error. */ }
      finally { running = false; ignoreUntil = Date.now() + 1500; }
    }, Math.max(1200, nextAllowed - Date.now()));
  }
  globalThis.AssystQueueSync = {
    isBusy() { return busy || running || Date.now() < probeLeaseUntil || Date.now() - lastCaptureEndedAt < 1500; },
    refreshFinished() { ignoreUntil = 0; nextAllowed = Math.min(nextAllowed, Date.now()); scheduleSync(); },
    changed(records) {
      if (running || busy || Date.now() < ignoreUntil) return;
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || target.closest(OWNED)) continue;
        if (record.type === 'childList') {
          const nodes = [...record.addedNodes, ...record.removedNodes];
          if (nodes.length && nodes.every(node => node.nodeType === 1 && node.matches(OWNED))) continue;
        }
        scheduleSync(); return;
      }
    }
  };
  const storageChanged = (changes, area) => { if (area === 'local' && 'assyst_auto_sync' in changes) scheduleSync(); };
  browser.storage.onChanged.addListener(storageChanged);
  for (const name of ['hashchange', 'popstate']) window.addEventListener(name, scheduleSync);
  for (const name of ['input', 'change']) document.addEventListener(name, event => { if (!event.target.closest(OWNED)) scheduleSync(); }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); browser.storage.onChanged.removeListener(storageChanged); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && stopped) { stopped = false; browser.storage.onChanged.addListener(storageChanged); scheduleSync(); }
  });
  scheduleSync();
})();
