'use strict';
(() => {
  const KEY = 'assyst_refresh_settings';
  const OWNED = '[data-assyst-ui]';
  const TITLE = 'chamados atribuidos a mim';
  // dojox/widget/Standby moves its underlay to body and animates display/opacity.
  const STANDBY = '[dojoAttachPoint~="_underlayNode"], [data-dojo-attach-point~="_underlayNode"], .dojoxStandbyUnderlay';
  const LOADING = '[aria-busy="true"], .dgrid-loading, .dgrid-preload-loading, .dijitContentPaneLoading';
  const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  let settings = AssystData.refreshSettings();
  let timer = 0, nextAt = 0, stopped = false, revision = 0, lastInteraction = -Infinity;
  let route = hash(), flight = null;

  function hash() { try { return window.top.location.hash || location.hash; } catch { return location.hash; } }
  function visible(node) {
    if (!node?.isConnected || node.getClientRects().length === 0) return false;
    for (let p = node; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (p.hidden || p.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    try { if (window.frameElement && window.frameElement.getClientRects().length === 0) return false; } catch { /* Cross-origin parents are not inspected. */ }
    return true;
  }
  function target() {
    const current = hash();
    if (/^#eventMonitor\/4\/?$/i.test(current)) {
      const buttons = [...document.querySelectorAll('[data-component-tag="eventMonitorRefreshButton"][role="button"]')].filter(visible);
      if (buttons.length !== 1) return null;
      for (const select of document.querySelectorAll('select')) {
        if (select.closest(OWNED) || !visible(select)) continue;
        if ([...select.options].some(option => fold(option.textContent) === TITLE) && fold(select.selectedOptions[0]?.textContent) !== TITLE) return null;
      }
      return { button: buttons[0], root: document.body, kind: 'assigned' };
    }
    if (/^#homepage\/?$/i.test(current)) {
      const headers = [...document.querySelectorAll('.axios-homepage-titlebar-outer')].filter(header =>
        visible(header) && [...header.querySelectorAll('h2.axios-homepage-titlebar-inner')].some(title => fold(title.textContent) === TITLE));
      if (headers.length !== 1) return null;
      const buttons = [...headers[0].querySelectorAll('[data-component-tag="refresh"][role="button"]')]
        .filter(button => visible(button) && button.querySelector('.refreshButtonIcon'));
      if (buttons.length !== 1) return null;
      let root = headers[0];
      for (let p = root.parentElement; p && p !== document.body; p = p.parentElement) {
        if (p.querySelectorAll('.axios-homepage-titlebar-outer').length !== 1) break;
        root = p;
        if (p.querySelector('.dgrid, [role="grid"]')) break;
      }
      return { button: buttons[0], root, kind: 'home' };
    }
    return null;
  }
  function nativeBusy(current) {
    for (let p = current.button; p; p = p.parentElement) {
      if (p.matches(':disabled, [aria-disabled="true"], [aria-busy="true"], .dijitDisabled, .dijitButtonDisabled')) return true;
      if (p === current.root) break;
    }
    return loading(current.root);
  }
  function loading(root = document.body) {
    return [...(root.matches(LOADING) ? [root] : []), ...root.querySelectorAll(LOADING), ...document.querySelectorAll(STANDBY)]
      .some(node => !node.closest(OWNED) && visible(node));
  }
  function userBusy() {
    if (Date.now() - lastInteraction < 2000) return 'activity';
    if (globalThis.AssystQueueSync?.isBusy()) return 'scan';
    if (globalThis.AssystTaggerUI?.isBusy()) return 'marks';
    const active = document.activeElement;
    if (active && active !== document.body && active.matches('input, textarea, select, [contenteditable="true"]')) return 'editing';
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return 'selection';
    for (const node of document.querySelectorAll('[role="dialog"], [aria-modal="true"], .dijitPopup, [role="menu"], [role="listbox"], .dgrid-selected, [role="row"][aria-selected="true"], .dgrid input[type="checkbox"]:checked, [role="grid"] input[type="checkbox"]:checked, .dgrid input[type="radio"]:checked')) {
      if (node.closest(OWNED) || !visible(node)) continue;
      if (node.matches('.dijitPopup, [role="menu"], [role="listbox"]')) {
        const rect = node.getBoundingClientRect();
        // Dojo parks closed menu wrappers at negative coordinates instead of display:none.
        if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) continue;
      }
      return 'selection';
    }
    return null;
  }
  function clearTimer() { if (timer) clearTimeout(timer); timer = 0; nextAt = 0; }
  function schedule(delay = settings.intervalSeconds * 1000) {
    if (stopped) { clearTimer(); return; }
    if (flight) {
      // Native animation mutations must not keep postponing this independent watchdog.
      if (!flight.uncertain && !timer) timer = setTimeout(tick, 250);
      return;
    }
    clearTimer();
    if (settings.enabled && (settings.background || !document.hidden)) {
      nextAt = Date.now() + delay; timer = setTimeout(tick, delay);
    }
  }
  function begin() {
    clearTimer();
    flight = { route: hash(), started: Date.now(), lastChange: Date.now(), sawBusy: false, sawData: false, uncertain: false };
    schedule();
  }
  function tick() {
    timer = 0; nextAt = 0;
    if (stopped) return;
    if (hash() !== route) { navigate(); return; }
    const current = target();
    if (flight) {
      if (!current) {
        if (Date.now() - flight.started >= 45000) { flight.uncertain = true; clearTimer(); }
        else schedule();
        return;
      }
      const busy = nativeBusy(current);
      if (busy) { flight.sawBusy = true; flight.lastChange = Date.now(); }
      if (!busy && (flight.sawData || flight.sawBusy) && Date.now() - flight.lastChange >= 750) {
        flight = null;
        globalThis.AssystTaggerUI?.refreshAfterLoading?.();
        globalThis.AssystQueueSync?.refreshFinished();
        schedule(); return;
      }
      if (Date.now() - flight.started >= 45000) {
        // Unknown completion never authorizes another automatic click or cleanup.
        flight.uncertain = true; clearTimer(); return;
      }
      schedule(); return;
    }
    if (!settings.enabled || (!settings.background && document.hidden)) { schedule(); return; }
    if (!current || nativeBusy(current)) { schedule(); return; }
    if (userBusy()) { schedule(1000); return; }
    begin();
    try { current.button.click(); }
    catch { flight.uncertain = true; clearTimer(); }
  }
  function navigate() {
    const current = hash();
    if (current !== route) { route = current; flight = null; }
    schedule();
  }
  function changed(records) {
    if (stopped) return;
    if (hash() !== route) navigate();
    if (!flight) return;
    const current = target();
    if (!current) return;
    let relevant = false, nativeRecord = false;
    for (const record of records) {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!element || element.closest(OWNED)) continue;
      const nodes = record.type === 'childList' ? [...record.addedNodes, ...record.removedNodes] : [];
      if (nodes.length && nodes.every(node => node.nodeType === 1 && node.matches(OWNED))) continue;
      if (!current.root.contains(element) && !element.contains(current.root) && !element.matches(STANDBY)) continue;
      nativeRecord = true;
      const inGrid = element.closest('.dgrid, [role="grid"]');
      const addedGrid = nodes.some(node => node.nodeType === 1 &&
        (node.matches('.dgrid, [role="grid"]') || node.querySelector('td.field-eventRef')));
      if (record.type !== 'attributes' && (inGrid || addedGrid)) {
        flight.sawData = true; flight.lastChange = Date.now(); relevant = true;
      }
    }
    const busy = nativeRecord && nativeBusy(current);
    if (busy) { flight.sawBusy = true; flight.lastChange = Date.now(); relevant = true; }
    if (flight.uncertain && nativeRecord && !busy && (flight.sawData || flight.sawBusy)) {
      flight.uncertain = false; flight.started = Date.now();
    } else if (!relevant || flight.uncertain) return;
    schedule();
  }
  async function load() {
    const version = ++revision;
    try {
      const data = await browser.storage.local.get([KEY]);
      if (version !== revision || stopped) return;
      settings = AssystData.refreshSettings(data[KEY]); schedule();
    } catch { if (version === revision) { settings = AssystData.refreshSettings(); schedule(); } }
  }
  const storageChanged = (changes, area) => {
    if (area !== 'local' || !(KEY in changes) || stopped) return;
    revision++; settings = AssystData.refreshSettings(changes[KEY].newValue); schedule();
  };
  const activity = () => { lastInteraction = Date.now(); };
  document.addEventListener('pointerdown', activity, true);
  document.addEventListener('keydown', activity, true);
  document.addEventListener('input', activity, true);
  document.addEventListener('click', event => {
    if (stopped) return;
    const current = target();
    if (current && !nativeBusy(current) && current.button.contains(event.target) && (!flight || flight.uncertain)) begin();
  }, true);
  for (const name of ['hashchange', 'popstate']) window.addEventListener(name, navigate);
  document.addEventListener('visibilitychange', () => schedule());
  browser.storage.onChanged.addListener(storageChanged);
  window.addEventListener('pagehide', () => {
    stopped = true; revision++; clearTimer(); flight = null;
    browser.storage.onChanged.removeListener(storageChanged);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && stopped) {
      stopped = false; route = hash(); browser.storage.onChanged.addListener(storageChanged); load();
    }
  });
  function getStatus() {
    const current = target();
    const reason = !settings.enabled ? 'disabled' : flight?.uncertain ? 'unknown' : flight ? 'updating' :
      !settings.background && document.hidden ? 'hidden' : !current ? 'unsupported' : nativeBusy(current) ? 'loading' : userBusy() || 'waiting';
    const messages = {
      disabled: 'Atualização automática desligada.',
      unknown: 'Pausada: não foi possível confirmar o fim da atualização. Uma atualização manual concluída ou a troca de tela permite tentar novamente.',
      updating: 'Aguardando a conclusão da atualização do AssystNet.',
      hidden: 'Pausada: esta aba está em segundo plano.',
      unsupported: 'Aguardando a Página Inicial ou a fila “Chamados atribuídos a mim” com o botão Atualizar visível.',
      loading: 'Aguardando a animação de carregamento do AssystNet terminar.',
      activity: 'Aguardando você terminar a interação com a página.',
      scan: 'Aguardando a conferência da fila terminar.',
      marks: 'Aguardando o salvamento das marcações ou o fechamento da janela de edição.',
      editing: 'Pausada: há um campo em edição. Clique fora dele para continuar.',
      selection: 'Pausada: há seleção de texto/linha ou um menu aberto.',
      waiting: `Ativa: aguardando o intervalo de ${settings.intervalSeconds} segundos.`
    };
    return { enabled: settings.enabled, intervalSeconds: settings.intervalSeconds, pending: !!flight,
      paused: !!flight?.uncertain, reason, message: messages[reason], nextAt: nextAt || null };
  }
  browser.runtime?.onMessage?.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'assyst-refresh' || message.action !== 'status' || !target()) return undefined;
    return Promise.resolve(getStatus());
  });
  globalThis.AssystAutoRefresh = { changed, isRefreshing: () => !!flight, isLoading: loading, getStatus };
  load();
})();
