(() => {
  'use strict';
  const CELL = 'td.field-eventRef';
  const OWNED = '[data-assyst-ui]';
  const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let busy = false;

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

  function grids() {
    return [...new Set([...document.querySelectorAll(`${CELL}, th.field-eventRef, .dgrid-header .field-eventRef`)].filter(shown)
      .map(cell => cell.closest('.dgrid, [role="grid"]')).filter(Boolean))];
  }

  function context(grid) {
    const wanted = 'chamados atribuidos a mim';
    let ownQueue = false;
    const signatures = [];
    for (const select of document.querySelectorAll('select')) {
      if (select.closest(OWNED) || !shown(select)) continue;
      if ([...select.options].some(option => fold(option.textContent) === wanted)) {
        const selected = fold(select.selectedOptions[0]?.textContent || '');
        if (selected !== wanted) throw new Error('Selecione “Chamados atribuídos a mim” antes de exportar.');
        ownQueue = true;
        signatures.push(selected);
      }
    }
    const totals = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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
        if (match) totals.add(Number(match[3].replace(/\./g, '')));
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
    return { total, signature: JSON.stringify(signatures), field, index: headers.indexOf(header) };
  }

  async function capture() {
    if (busy) throw new Error('A leitura da fila já está em andamento.');
    busy = true;
    let scroller, originalTop, grid, initial;
    try {
      const candidates = grids();
      if (candidates.length !== 1) throw new Error('Não encontrei uma única tabela da fila. Recarregue o AssystNet.');
      [grid] = candidates;
      initial = context(grid);
      const href = location.href;
      const records = new Map(), positions = new Map();
      const deadline = Date.now() + 45000;
      const assertContext = () => {
        if (!grid.isConnected || location.href !== href) throw new Error('A página mudou durante a leitura. Exporte novamente.');
        const current = context(grid);
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
        tickets: [...records].filter(([, status]) => ['aberto', 'open'].includes(status)).map(([ticket]) => ticket) };
    } finally {
      if (scroller?.isConnected && grid?.isConnected && originalTop !== undefined) scroller.scrollTop = originalTop;
      busy = false;
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'assyst-queue') return undefined;
    if (message.action === 'probe') {
      if (grids().length) browser.runtime.sendMessage({ type: 'assyst-tagger', action: 'queueReady', token: message.token }).catch(() => undefined);
      return undefined;
    }
    if (message.action === 'capture') return capture().catch(error => ({ ok: false, error: error.message }));
    return undefined;
  });
})();
