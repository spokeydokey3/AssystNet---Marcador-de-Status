'use strict';
(() => {
  const BREADCRUMB = 'span.breadcrumb.no-link-breadcrumb[data-component-tag="breadcrumb-index-2"]';
  const OWNED = '[data-assyst-ui="detail-controls"]';
  let root = null;
  let breadcrumb = null;
  let frame = 0;
  let stopped = false;

  function eventReference(hash) {
    const match = /^#events\/([^/?#]+)(?:\?|$)/.exec(hash);
    if (!match) return null;
    try {
      const ticket = decodeURIComponent(match[1]);
      return /^[A-Za-z]*\d+$/.test(ticket) ? ticket : null;
    } catch { return null; }
  }

  function context() {
    const ticket = eventReference(location.hash);
    if (!ticket) return null;
    const candidates = [...document.querySelectorAll(BREADCRUMB)]
      .filter(node => node.isConnected && !node.closest('[hidden]') && node.getClientRects().length > 0 &&
        getComputedStyle(node).visibility === 'visible');
    if (candidates.length !== 1 || candidates[0].textContent.trim() !== ticket) return null;
    return { ticket, node: candidates[0] };
  }

  function clear() {
    if (root) {
      globalThis.AssystTaggerUI?.closeDialogs(root);
      root.remove();
    }
    root = null;
    breadcrumb = null;
  }

  function refresh() {
    if (!stopped && !frame && (root || eventReference(location.hash))) frame = requestAnimationFrame(render);
  }

  function nativeChanged(records) {
    if (stopped || frame || (!root && !eventReference(location.hash))) return;
    if (!root || !root.isConnected || !breadcrumb?.isConnected) { refresh(); return; }
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target || target.closest('[data-assyst-ui]')) continue;
      if (record.type === 'childList') {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length && nodes.every(node => node.nodeType === 1 && node.matches('[data-assyst-ui]'))) continue;
      }
      if (target === breadcrumb || target.contains(breadcrumb) || breadcrumb.contains(target)) { refresh(); return; }
    }
  }

  function render() {
    frame = 0;
    if (stopped) return;
    const current = context();
    if (!current || !globalThis.AssystTaggerUI?.isReady()) { clear(); return; }
    if (root && (!root.isConnected || breadcrumb !== current.node ||
        root.dataset.ticketId !== current.ticket || root.previousElementSibling !== current.node)) clear();
    if (!root) {
      root = document.createElement('span');
      root.dataset.assystUi = 'detail-controls';
      root.dataset.ticketId = current.ticket;
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', 'Marcadores do chamado ' + current.ticket);
      root.style.cssText = 'all: initial !important; display: inline-flex !important; align-items: center !important; vertical-align: middle !important; margin-left: 6px !important;';
      breadcrumb = current.node;
      current.node.after(root);
    }
    globalThis.AssystTaggerUI.bind(root, current.ticket);
  }

  function detailOwner(node) {
    if (!node) return null;
    const host = node.getRootNode()?.host;
    return (host || node).closest?.(OWNED) || null;
  }

  function canEdit(node, ticket) {
    const owner = detailOwner(node);
    if (!owner) return true;
    const current = context();
    const valid = !stopped && owner === root && root.isConnected && current &&
      current.ticket === ticket && root.dataset.ticketId === ticket &&
      root.previousElementSibling === current.node && breadcrumb === current.node;
    if (!valid) { refresh(); return false; }
    return true;
  }

  function navigation() {
    if (root && !canEdit(root, root.dataset.ticketId)) clear();
    refresh();
  }

  globalThis.AssystDetailView = { refresh, nativeChanged, canEdit };
  window.addEventListener('hashchange', navigation);
  window.addEventListener('popstate', navigation);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) navigation(); });
  window.addEventListener('pagehide', () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clear();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && stopped) { stopped = false; refresh(); }
  });
  refresh();
})();
