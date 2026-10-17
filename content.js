(() => {
  'use strict';

  const CELL = 'td.field-eventRef';
  const SELECT = 'select.assyst-tag-select';
  const CONTACT = '.assyst-contact-controls';
  const OWNED = '[data-assyst-ui]';
  const pendingCells = new Set();
  const pendingAssignments = new Map();
  const pendingContacts = new Map();
  const temporaryTags = new Map();
  let state = null;
  let tagsVersion = '';
  let tagsById = new Map();
  let frame = 0;
  let activeDialog = null;
  let stopped = false;
  let reloadPending = false;
  let dayTimer = 0;

  async function request(action, payload = {}) {
    const response = await browser.runtime.sendMessage({ type: 'assyst-tagger', action, ...payload });
    if (!response || !response.ok) throw new Error(response?.error || 'Não foi possível salvar a marcação.');
    if (response.state) acceptState(response.state);
    return response;
  }

  function acceptState(next) {
    if (stopped || (state && next.assyst_revision < state.assyst_revision)) return;
    state = next;
    rebuildTags();
    queueVisibleCells();
  }

  function rebuildTags() {
    const tags = [...(state?.assyst_tags || [])];
    for (const tag of temporaryTags.values()) {
      if (!tags.some(item => item.id === tag.id)) tags.push(tag);
    }
    tagsVersion = JSON.stringify(tags);
    tagsById = new Map(tags.map(tag => [tag.id, tag]));
  }

  function schedule() {
    if (!stopped && !frame && pendingCells.size && state) frame = requestAnimationFrame(flush);
  }

  function queueVisibleCells() {
    for (const cell of document.querySelectorAll(CELL)) pendingCells.add(cell);
    globalThis.AssystDetailView?.refresh();
    schedule();
  }

  function queueNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || element.closest(OWNED)) return;
    const cell = element.closest(CELL);
    if (cell) pendingCells.add(cell);
    if (element.matches(CELL)) pendingCells.add(element);
    for (const child of element.querySelectorAll(CELL)) pendingCells.add(child);
  }

  function ticketIn(cell) {
    // Avoid cloning the complete cell and its dropdown on every mutation.
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest(`${OWNED}, .axios-offscreen-content`)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let text = '';
    while (walker.nextNode()) text += walker.currentNode.textContent;
    return text.trim();
  }

  function styleSelect(select, status) {
    const tag = tagsById.get(status);
    const actual = tag ? status : 'NONE';
    select.value = actual;
    select.dataset.statusId = actual;
    select.style.setProperty('background-color', tag?.bg || '#E5E7EB', 'important');
    select.style.setProperty('color', tag?.color || '#374151', 'important');
    select.title = tag ? tag.label : 'Escolher uma tag';
  }

  function options(select) {
    const nodes = [];
    for (const [id, label] of [['NONE', '+ Tag'], ...[...tagsById.values()].map(tag => [tag.id, tag.label]), ['CREATE_NEW', '+ Criar tag…']]) {
      const option = document.createElement('option'); option.value = id; option.textContent = label;
      option.style.backgroundColor = '#FFFFFF'; option.style.color = '#111827'; nodes.push(option);
    }
    select.replaceChildren(...nodes);
    select.value = tagsById.has(select.dataset.statusId) ? select.dataset.statusId : 'NONE';
    select.dataset.optionsHash = tagsVersion;
  }

  function createSelect() {
    const select = document.createElement('select');
    select.className = 'assyst-tag-select'; select.dataset.assystUi = 'select';
    const styles = { 'font-family': 'system-ui, sans-serif', 'font-size': '10px', 'font-weight': '700',
      'border': '1px solid rgba(0,0,0,.2)', 'border-radius': '10px', 'padding': '1px 5px',
      'cursor': 'pointer', 'margin-left': '6px', 'max-width': '95px', 'width': 'auto',
      'height': 'auto', 'min-height': '0', 'display': 'inline-block', 'vertical-align': 'middle' };
    for (const [name, value] of Object.entries(styles)) select.style.setProperty(name, value, 'important');
    for (const event of ['mousedown', 'click', 'dblclick', 'keydown']) select.addEventListener(event, e => e.stopPropagation());
    select.addEventListener('change', event => {
      event.stopPropagation();
      // Read the current identity; dgrid may reuse this same cell for another ticket.
      const ticket = select.dataset.ticketId;
      const id = select.value;
      if (globalThis.AssystDetailView && !globalThis.AssystDetailView.canEdit(select, ticket)) {
        showError('Aguarde o carregamento do chamado antes de alterar a marcação.');
        return;
      }
      if (id === 'CREATE_NEW') {
        styleSelect(select, select.dataset.statusId || 'NONE');
        showCreateDialog(ticket, select);
      } else assign(ticket, id, select);
    });
    return select;
  }

  function flush() {
    frame = 0;
    if (stopped || !state) return;
    const cells = [...pendingCells]; pendingCells.clear();
    for (const cell of cells) {
      if (!cell.isConnected) continue;
      let select = cell.querySelector(SELECT);
      let contacts = cell.querySelector(CONTACT);
      if (!cell.matches(CELL)) { select?.remove(); contacts?.remove(); continue; }
      const ticket = ticketIn(cell);
      if (!ticket) { select?.remove(); contacts?.remove(); continue; }
      if (!select) { select = createSelect(); cell.append(select); }
      if (!contacts) { contacts = createContacts(); cell.append(contacts); }
      contacts.dataset.ticketId = ticket;
      renderContacts(contacts);
      if (select.dataset.optionsHash !== tagsVersion) options(select);
      const changedTicket = select.dataset.ticketId !== ticket;
      select.dataset.ticketId = ticket;
      select.setAttribute('aria-label', `Tag do chamado ${ticket}`);
      const id = pendingAssignments.get(ticket)?.id || state.assyst_ticket_tags[ticket] || 'NONE';
      if (changedTicket || select.dataset.statusId !== id || select.dataset.styleVersion !== tagsVersion) {
        styleSelect(select, id); select.dataset.styleVersion = tagsVersion;
      }
    }
  }

  function contactFor(ticket) { return pendingContacts.get(ticket)?.value || AssystData.contact(state?.assyst_contacts?.[ticket]); }

  function renderContacts(host) {
    const ticket = host.dataset.ticketId;
    const value = contactFor(ticket);
    const info = AssystData.contactInfo(value);
    const busy = pendingContacts.has(ticket);
    const signature = JSON.stringify([ticket, value, busy, AssystData.today()]);
    if (host.dataset.rendered === signature) return;
    host.dataset.rendered = signature;
    host.title = `Contatos do chamado ${ticket}: ${info.count}/4. ${info.status}`;
    const group = host.shadowRoot.querySelector('.contacts');
    group.setAttribute('aria-label', host.title);
    group.dataset.state = info.respondedOn ? 'responded' : info.ready ? 'ready' : 'pending';
    for (const [index, checkbox] of [...host.shadowRoot.querySelectorAll('input')].entries()) {
      const checked = index < info.count;
      checkbox.checked = checked;
      checkbox.disabled = busy || !!info.respondedOn || (checked ? index !== info.count - 1 : index !== info.count || !info.canAdd);
      const explanation = checked ? `Registrada em ${AssystData.displayDate(info.attempts[index])}${index === info.count - 1 && !info.respondedOn ? '. Desmarque para desfazer.' : ''}`
        : index === info.count && info.canAdd ? 'Marque após realizar o contato de hoje.' : info.status;
      checkbox.title = `${index + 1}ª tentativa. ${explanation}`;
      checkbox.setAttribute('aria-label', `${index + 1}ª tentativa do chamado ${ticket}. ${explanation}`);
    }
  }

  function updateContactControls(ticket) {
    for (const host of document.querySelectorAll(CONTACT)) {
      if (host.dataset.ticketId === ticket) renderContacts(host);
    }
  }

  async function changeContact(ticket, operation, opener) {
    if (globalThis.AssystDetailView && !globalThis.AssystDetailView.canEdit(opener, ticket)) {
      updateContactControls(ticket);
      showError('Aguarde o carregamento do chamado antes de registrar contatos.');
      return;
    }
    if (pendingContacts.has(ticket)) return;
    const expected = AssystData.contact(state.assyst_contacts?.[ticket]);
    let value;
    try { value = AssystData.changeContact(expected, operation); }
    catch (error) { updateContactControls(ticket); showError(error.message); return; }
    pendingContacts.set(ticket, { value });
    // Apply immediately; observers and storage events may only confirm or roll back this state.
    updateContactControls(ticket);
    try { await request('contact', { ticket, operation, expected }); }
    catch (error) {
      try { await request('get'); } catch { /* Retain the last confirmed state on storage failure. */ }
      showError(error.message);
    } finally { pendingContacts.delete(ticket); updateContactControls(ticket); }
  }

  function createContacts() {
    const host = document.createElement('span');
    host.className = 'assyst-contact-controls'; host.dataset.assystUi = 'contacts';
    host.style.cssText = 'all: initial !important; display: inline-flex !important; vertical-align: middle !important; margin-left: 4px !important;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = element('style', undefined, shadow);
    style.textContent = `
      :host { color-scheme: light; } * { box-sizing: border-box; }
      .contacts { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 4px; background: #eef2ff; }
      .contacts[data-state=ready] { background: #fef3c7; outline: 1px solid #d97706; }
      .contacts[data-state=responded] { background: #dcfce7; }
      input { appearance: auto; width: 12px; height: 12px; margin: 0; accent-color: #2563eb; cursor: pointer; }
      input:disabled { cursor: default; } button { width: 14px; height: 14px; padding: 0; border: 0; background: transparent; color: #334155; font: bold 11px system-ui,sans-serif; cursor: pointer; }
      input:focus-visible,button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
    `;
    const group = element('span', undefined, shadow); group.className = 'contacts'; group.setAttribute('role', 'group');
    for (let index = 0; index < 4; index++) {
      const checkbox = element('input', undefined, group); checkbox.type = 'checkbox';
      checkbox.addEventListener('change', () => {
        const ticket = host.dataset.ticketId;
        const count = contactFor(ticket).attempts.length;
        // Native checkboxes toggle before this handler; render from confirmed state on cancellation.
        host.dataset.rendered = '';
        if (pendingContacts.has(ticket)) { renderContacts(host); return; }
        if (index < count) {
          renderContacts(host);
          if (!confirm(`Desfazer a última tentativa de contato do chamado ${ticket}?`)) return;
          changeContact(ticket, 'undo', host);
        } else changeContact(ticket, 'add', host);
      });
    }
    const details = element('button', '⋯', group); details.type = 'button'; details.title = 'Ver histórico e informar resposta';
    details.setAttribute('aria-label', 'Detalhes das tentativas de contato');
    details.addEventListener('click', () => showContactDialog(host.dataset.ticketId, details));
    for (const event of ['mousedown', 'click', 'dblclick', 'keydown', 'change']) host.addEventListener(event, e => e.stopPropagation());
    return host;
  }

  function showContactDialog(ticket, opener) {
    if (globalThis.AssystDetailView && !globalThis.AssystDetailView.canEdit(opener, ticket)) {
      showError('Aguarde o carregamento do chamado antes de consultar contatos.');
      return;
    }
    const panel = dialog(`Contatos · ${ticket}`, opener);
    if (!panel) return;
    const info = AssystData.contactInfo(contactFor(ticket));
    element('p', info.status, panel.box);
    element('p', 'É possível marcar até quatro tentativas no mesmo dia. Cada marcação recebe a data de hoje, inclusive para contatos anteriores. O aviso de revisão exige sete dias desde a primeira marcação e o dia seguinte à quarta, sem resposta informada.', panel.box);
    for (const [index, date] of info.attempts.entries()) element('p', `${index + 1}ª tentativa: ${AssystData.displayDate(date)}`, panel.box);
    if (info.respondedOn) element('p', `Resposta informada em ${AssystData.displayDate(info.respondedOn)}`, panel.box);
    const actions = element('div', undefined, panel.box); actions.className = 'actions';
    if (info.count) {
      const response = element('button', info.respondedOn ? 'Desmarcar resposta' : 'Usuário respondeu', actions);
      response.type = 'button'; response.disabled = pendingContacts.has(ticket);
      response.addEventListener('click', () => { panel.close(); changeContact(ticket, info.respondedOn ? 'resume' : 'respond', opener); });
      const clear = element('button', 'Limpar', actions); clear.type = 'button'; clear.disabled = pendingContacts.has(ticket);
      clear.addEventListener('click', () => {
        if (!confirm(`Apagar as datas de contato do chamado ${ticket} e iniciar um novo acompanhamento? Salve um backup para preservar esse histórico.`)) return;
        panel.close(); changeContact(ticket, 'clear', opener);
      });
    }
    const close = element('button', 'Fechar', panel.box); close.type = 'button'; close.addEventListener('click', panel.close); close.focus();
  }

  function optimistic(ticket, id, tag) {
    const token = Symbol(ticket);
    pendingAssignments.set(ticket, { id, token });
    if (tag) { temporaryTags.set(tag.id, tag); rebuildTags(); }
    // Apply synchronously, before starting any storage Promise.
    for (const select of document.querySelectorAll(SELECT)) {
      if (tag) options(select);
      if (select.dataset.ticketId === ticket) styleSelect(select, id);
    }
    return token;
  }

  async function finishOptimistic(ticket, token, tagId) {
    if (pendingAssignments.get(ticket)?.token === token) pendingAssignments.delete(ticket);
    if (tagId) { temporaryTags.delete(tagId); rebuildTags(); }
    queueVisibleCells();
  }

  async function assign(ticket, id, opener) {
    if (globalThis.AssystDetailView && !globalThis.AssystDetailView.canEdit(opener, ticket)) return;
    const token = optimistic(ticket, id);
    try { await request('assign', { ticket, id }); }
    catch (error) {
      try { await request('get'); } catch { /* Keep the last confirmed state. */ }
      showError(error.message);
    } finally { await finishOptimistic(ticket, token); }
  }

  function element(tag, text, parent) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  }

  function dialog(title, opener) {
    if (activeDialog) return null;
    const host = document.createElement('div'); host.dataset.assystUi = 'dialog';
    host.style.cssText = 'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; display: block !important;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = element('style', undefined, shadow);
    style.textContent = `
      :host { color-scheme: light; } * { box-sizing: border-box; }
      .overlay { position: fixed; inset: 0; background: #0f172a88; display: flex; align-items: center; justify-content: center; padding: 16px; font: 14px system-ui,sans-serif; color: #17233c; }
      .box { width: 340px; max-width: 100%; max-height: 90vh; overflow-y: auto; background: white; padding: 20px; border-radius: 14px; box-shadow: 0 16px 50px #0f172a44; }
      h2 { font-size: 18px; margin: 0 0 6px; } p { font-size: 12px; line-height: 1.5; color: #526079; margin: 6px 0 14px; }
      label { display: block; font-size: 12px; font-weight: 600; margin: 12px 0 5px; }
      input[type=text] { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
      input[type=color] { width: 50px; height: 38px; padding: 2px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; cursor: pointer; }
      .colors,.actions { display: flex; gap: 8px; align-items: center; margin-top: 12px; } .colors input[type=text] { width: 100px; font: 13px monospace; }
      .preview { font-size: 11px; font-weight: 700; padding: 5px 9px; border-radius: 20px; overflow-wrap: anywhere; max-width: 130px; }
      button { padding: 10px 14px; font: 600 13px system-ui,sans-serif; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #17233c; cursor: pointer; }
      .primary { flex: 1; color: white; background: #2563eb; border-color: #2563eb; } button:disabled { opacity: .5; cursor: wait; }
      button:focus-visible,input:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; } .error { color: #b91c1c; margin: 12px 0 0; }
    `;
    const overlay = element('div', undefined, shadow); overlay.className = 'overlay';
    const box = element('div', undefined, overlay); box.className = 'box';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'assystDialogTitle');
    const heading = element('h2', title, box); heading.id = 'assystDialogTitle';
    let locked = false;
    const close = (force = false) => {
      if (locked && force !== true) return;
      host.remove(); if (activeDialog?.host === host) activeDialog = null;
      if (opener?.isConnected) opener.focus();
    };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    shadow.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const focusable = [...box.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    document.body.append(host); activeDialog = { host, close, opener };
    return { box, close, lock(value) { locked = value; } };
  }

  function showError(message) {
    if (activeDialog) return;
    const panel = dialog('Não foi possível salvar');
    if (!panel) return;
    element('p', message, panel.box);
    const button = element('button', 'Fechar', panel.box); button.addEventListener('click', panel.close); button.focus();
  }

  function showCreateDialog(ticket, opener) {
    const panel = dialog('Criar e atribuir tag', opener);
    if (!panel) return;
    element('p', `A nova tag será aplicada ao chamado ${ticket}.`, panel.box);
    const form = element('form', undefined, panel.box);
    const nameLabel = element('label', 'Nome da tag', form); nameLabel.htmlFor = 'assystInlineName';
    const name = element('input', undefined, form); name.type = 'text'; name.id = 'assystInlineName'; name.maxLength = 80; name.required = true; name.placeholder = 'Ex.: Aguardando retorno';
    const colorLabel = element('label', 'Cor da tag', form); colorLabel.htmlFor = 'assystInlineColor';
    const colors = element('div', undefined, form); colors.className = 'colors';
    const picker = element('input', undefined, colors); picker.type = 'color'; picker.id = 'assystInlineColor'; picker.value = '#0ea5e9';
    const hex = element('input', undefined, colors); hex.type = 'text'; hex.value = '#0EA5E9'; hex.maxLength = 7; hex.required = true; hex.setAttribute('aria-label', 'Cor HEX');
    const badge = element('span', 'Prévia', colors); badge.className = 'preview';
    let color = '#0EA5E9';
    const preview = () => { badge.textContent = name.value.trim() || 'Prévia'; badge.style.backgroundColor = color; badge.style.color = AssystData.textColor(color); };
    picker.addEventListener('input', () => { color = AssystData.hex(picker.value); hex.value = color; hex.setCustomValidity(''); preview(); });
    hex.addEventListener('input', () => {
      try { color = AssystData.hex(hex.value); picker.value = color; hex.setCustomValidity(''); preview(); }
      catch (error) { hex.setCustomValidity(error.message); }
    });
    name.addEventListener('input', preview); preview();
    const errorText = element('p', '', form); errorText.className = 'error'; errorText.setAttribute('role', 'alert');
    const actions = element('div', undefined, form); actions.className = 'actions';
    const save = element('button', 'Criar e atribuir', actions); save.type = 'submit'; save.className = 'primary';
    const cancel = element('button', 'Cancelar', actions); cancel.type = 'button'; cancel.addEventListener('click', panel.close);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (save.disabled) return;
      if (globalThis.AssystDetailView && !globalThis.AssystDetailView.canEdit(opener, ticket)) {
        errorText.textContent = 'O chamado mudou. Reabra o formulário no chamado atual.';
        return;
      }
      let tag;
      try {
        // getRandomValues also works on the HTTP host; randomUUID requires a secure context.
        const id = 'TAG_' + [...crypto.getRandomValues(new Uint8Array(16))]
          .map(value => value.toString(16).padStart(2, '0')).join('');
        tag = AssystData.tag({ id, label: name.value.trim(), bg: AssystData.hex(hex.value) });
      }
      catch (error) { errorText.textContent = error.message; return; }
      const token = optimistic(ticket, tag.id, tag);
      panel.lock(true); save.disabled = true; cancel.disabled = true; save.textContent = 'Salvando…';
      try {
        await request('createAndAssign', { ticket, tag });
        panel.lock(false); panel.close();
      } catch (error) {
        errorText.textContent = error.message;
        try { await request('get'); } catch { /* Keep the last confirmed state. */ }
      } finally {
        await finishOptimistic(ticket, token, tag.id);
        panel.lock(false); save.disabled = false; cancel.disabled = false; save.textContent = 'Criar e atribuir';
      }
    });
    name.focus();
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!target || target.closest(OWNED)) continue;
      if (record.type === 'childList') {
        const changed = [...record.addedNodes, ...record.removedNodes];
        if (changed.length && changed.every(node => node.nodeType === Node.ELEMENT_NODE && node.matches(OWNED))) continue;
        // Removed subtrees are never retained. Only the affected cell and added subtrees matter.
        const cell = target.closest(CELL);
        if (cell) pendingCells.add(cell);
        for (const node of record.addedNodes) queueNode(node);
      } else {
        queueNode(record.target);
        if (target.matches('td') && target.querySelector(SELECT)) pendingCells.add(target);
      }
    }
    schedule();
    globalThis.AssystDetailView?.nativeChanged(records);
  });

  function onStorage(changes, area) {
    if (stopped || area !== 'local' || !['assyst_tags', 'assyst_ticket_tags', 'assyst_contacts'].some(key => key in changes) || reloadPending) return;
    reloadPending = true;
    // Coalesce storage events; never read storage from the MutationObserver.
    queueMicrotask(async () => {
      reloadPending = false;
      if (stopped) return;
      try { await request('get'); } catch (error) { showError(error.message); }
    });
  }

  function refreshDay() {
    clearTimeout(dayTimer);
    if (stopped) return;
    queueVisibleCells();
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
    dayTimer = setTimeout(refreshDay, Math.max(1000, next.getTime() - now.getTime()));
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !stopped) refreshDay(); });
  function start() {
    stopped = false;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    browser.storage.onChanged.addListener(onStorage);
    request('get').catch(error => showError(error.message));
    refreshDay();
  }
  window.addEventListener('pagehide', () => {
    stopped = true; observer.disconnect(); browser.storage.onChanged.removeListener(onStorage);
    clearTimeout(dayTimer); dayTimer = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; pendingCells.clear();
    activeDialog?.host.remove(); activeDialog = null;
  });
  window.addEventListener('pageshow', event => { if (event.persisted && stopped) start(); });
  // Shared controls for the breadcrumb view; all state and writes remain here.
  globalThis.AssystTaggerUI = {
    isReady() { return !!state && !stopped; },
    bind(target, ticket) {
      if (!state || stopped) return;
      let select = target.querySelector(SELECT);
      let contacts = target.querySelector(CONTACT);
      if (!select) { select = createSelect(); target.append(select); }
      if (!contacts) { contacts = createContacts(); target.append(contacts); }
      if (select.dataset.optionsHash !== tagsVersion) options(select);
      const changed = select.dataset.ticketId !== ticket;
      select.dataset.ticketId = ticket;
      select.setAttribute('aria-label', 'Tag do chamado ' + ticket);
      const id = pendingAssignments.get(ticket)?.id || state.assyst_ticket_tags[ticket] || 'NONE';
      if (changed || select.dataset.statusId !== id || select.dataset.styleVersion !== tagsVersion) {
        styleSelect(select, id);
        select.dataset.styleVersion = tagsVersion;
      }
      contacts.dataset.ticketId = ticket;
      renderContacts(contacts);
    },
    closeDialogs(target) {
      const opener = activeDialog?.opener;
      const host = opener?.getRootNode()?.host || opener;
      if (host && target.contains(host)) activeDialog.close(true);
    }
  };
  start();
})();
