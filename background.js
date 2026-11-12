'use strict';

// All read/modify/write operations run here, in order, even across tabs and frames.
let queue = Promise.resolve();
const downloadURLs = new Map();
const reportJobs = new Map();

async function readState() {
  const raw = await browser.storage.local.get(AssystData.KEYS);
  if (raw.assyst_schema_version !== undefined && ![1, 2, 3].includes(raw.assyst_schema_version)) {
    throw new Error('Formato de dados não suportado. Atualize a extensão; os dados locais foram preservados.');
  }
  const state = AssystData.normalize(raw);
  const migrating = raw.assyst_schema_version !== 3;
  const metadata = {};
  if (migrating && raw.assyst_has_upgrade_backup !== true) {
    const previous = Object.fromEntries(['assyst_tags', 'assyst_custom_tags', 'assyst_ticket_tags', 'assyst_contacts']
      .filter(key => Object.prototype.hasOwnProperty.call(raw, key)).map(key => [key, raw[key]]));
    metadata.assyst_has_upgrade_backup = Object.keys(previous).length > 0;
    if (metadata.assyst_has_upgrade_backup) {
      // Save the original definitions and assignments before normalization, once only.
      metadata.assyst_upgrade_backup = { formatVersion: raw.assyst_contacts !== undefined ? 2 : 1, exportedAt: new Date().toISOString(), ...previous };
    }
  }
  state.assyst_schema_version = 3;
  state.assyst_auto_sync = raw.assyst_auto_sync !== false;
  state.assyst_refresh_settings = AssystData.refreshSettings(raw.assyst_refresh_settings);
  state.assyst_queue_snapshot = AssystData.queueSnapshot(raw.assyst_queue_snapshot);
  state.assyst_last_queue_sync = raw.assyst_last_queue_sync || null;
  state.assyst_has_cleanup_backup = raw.assyst_has_cleanup_backup === true;
  state.assyst_has_upgrade_backup = raw.assyst_has_upgrade_backup === true || metadata.assyst_has_upgrade_backup === true;
  if (migrating || JSON.stringify(raw.assyst_tags) !== JSON.stringify(state.assyst_tags) ||
      JSON.stringify(raw.assyst_ticket_tags) !== JSON.stringify(state.assyst_ticket_tags) ||
      JSON.stringify(raw.assyst_contacts) !== JSON.stringify(state.assyst_contacts)) {
    state.assyst_revision += 1;
    await browser.storage.local.set({ ...metadata, ...state });
  }
  return state;
}

async function download(state, format, original = false, tickets, confirmedAt) {
  const csv = format === 'csv';
  const text = csv ? AssystData.csv(state, tickets) : original ? JSON.stringify(state, null, 2) : AssystData.backup(state);
  const mime = csv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const filename = csv && confirmedAt ? `assyst_fila_conferida_${new Date(confirmedAt).toISOString().replace(/[:.]/g, '-')}.csv` :
    `assyst_${csv ? 'fila_atual' : original ? 'backup_anterior' : 'backup'}_${new Date().toISOString().slice(0, 10)}.${csv ? 'csv' : 'json'}`;
  // Chrome service workers cannot create Blob URLs. Firefox retains its event-page path.
  if (globalThis.AssystDownloads) return AssystDownloads.download({ text, mime, filename });
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const id = await browser.downloads.download({ url, saveAs: true, filename });
    downloadURLs.set(id, url);
    // A small download may have completed before the Promise resolved.
    const items = await browser.downloads.search({ id });
    if (items[0] && items[0].state !== 'in_progress') releaseDownload(id);
    return { downloadId: id };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function releaseDownload(id) {
  const url = downloadURLs.get(id);
  if (url) URL.revokeObjectURL(url);
  downloadURLs.delete(id);
}

browser.downloads.onChanged.addListener(delta => {
  if (delta.state && ['complete', 'interrupted'].includes(delta.state.current)) releaseDownload(delta.id);
});

function isAssyst(url) {
  try {
    const parsed = new URL(url);
    return ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br'].includes(parsed.origin) &&
      parsed.pathname.startsWith('/assystnet/');
  } catch { return false; }
}

async function readQueue(sourceTabId, cleanup = false) {
  let tab;
  if (sourceTabId !== undefined) {
    if (!Number.isInteger(sourceTabId) || sourceTabId < 0) throw new Error('A aba de origem é inválida. Reabra a janela a partir da sua fila.');
    try { tab = await browser.tabs.get(sourceTabId); }
    catch { throw new Error('A aba de origem foi fechada. Reabra a janela a partir da sua fila.'); }
  } else [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !isAssyst(tab.url)) throw new Error('Abra sua fila no AssystNet e exporte pelo ícone da extensão nessa aba.');
  if ([...reportJobs.values()].some(job => job.tabId === tab.id)) throw new Error('A leitura desta fila já está em andamento. Aguarde.');
  const token = crypto.randomUUID();
  const job = { tabId: tab.id, frames: new Set() };
  reportJobs.set(token, job);
  try {
    // Discover the frame containing the grid without adding webNavigation permissions.
    try { await browser.tabs.sendMessage(tab.id, { type: 'assyst-queue', action: 'probe', token }); }
    catch { /* Frames announce themselves through queueReady messages. */ }
    await new Promise(resolve => setTimeout(resolve, 350));
    if (job.frames.size !== 1) throw new Error('Não encontrei uma única tabela da sua fila. Abra a Página Inicial ou “Chamados atribuídos a mim” no AssystNet e aguarde carregar.');
    const result = await browser.tabs.sendMessage(tab.id, { type: 'assyst-queue', action: 'capture', cleanup },
      { frameId: [...job.frames][0] });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível conferir a fila atual.');
    const currentTab = await browser.tabs.get(tab.id);
    if (currentTab.url !== tab.url) throw new Error('A página mudou durante a leitura. Exporte novamente.');
    if (!Number.isSafeInteger(result.total) || result.total < 0 || result.complete !== true ||
        !Array.isArray(result.tickets) || result.tickets.length > result.total ||
        new Set(result.tickets).size !== result.tickets.length) throw new Error('A fila não foi conferida por completo.');
    if (cleanup) {
      validateMembership(result);
      await new Promise(resolve => setTimeout(resolve, 700));
      const second = await browser.tabs.sendMessage(tab.id, { type: 'assyst-queue', action: 'capture', cleanup: true }, { frameId: [...job.frames][0] });
      validateMembership(second);
      if (result.scope !== second.scope || JSON.stringify([...result.queueTickets].sort()) !== JSON.stringify([...second.queueTickets].sort()) ||
          JSON.stringify([...result.tickets].sort()) !== JSON.stringify([...second.tickets].sort())) {
        throw new Error('A fila mudou entre as duas leituras. Nada foi limpo.');
      }
    }
    return { result, tab, frameId: [...job.frames][0] };
  } finally { reportJobs.delete(token); }
}

function validateMembership(result) {
  const members = new Set(Array.isArray(result?.queueTickets) ? result.queueTickets : []);
  if (!result?.ok || !result.complete || result.unfiltered !== true || typeof result.scope !== 'string' ||
      !Number.isSafeInteger(result.total) || result.total < 0 || result.total > 100000 || !Array.isArray(result.queueTickets) ||
      result.queueTickets.length !== result.total || members.size !== result.total ||
      result.queueTickets.some(id => typeof id !== 'string' || !/^[A-Za-z]*\d+$/.test(id)) ||
      !Array.isArray(result.tickets) || new Set(result.tickets).size !== result.tickets.length ||
      result.tickets.some(id => !members.has(id))) {
    throw new Error(result?.error || 'A fila completa e sem filtros não foi confirmada. Nada foi limpo.');
  }
}

function serialized(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

async function exportQueue(sourceTabId) {
  const saved = await serialized(async () => {
    const state = await readState();
    const snapshot = state.assyst_queue_snapshot;
    if (!snapshot) return null;
    return { ...await download(state, 'csv', false, snapshot.tickets, snapshot.at),
      count: snapshot.tickets.length, confirmedAt: snapshot.at, savedQueue: true };
  });
  if (saved) return saved;
  const { result } = await readQueue(sourceTabId);
  return serialized(async () => {
    const state = await readState();
    return { ...await download(state, 'csv', false, result.tickets), count: result.tickets.length };
  });
}

async function syncQueue(message) {
  const initial = await serialized(readState);
  if (message.automatic && !initial.assyst_auto_sync) return { paused: true, state: initial };
  const { result, tab, frameId } = await readQueue(message.sourceTabId, true);
  return serialized(async () => {
    const state = await readState();
    if (message.automatic && !state.assyst_auto_sync) return { paused: true, state };
    const currentTab = await browser.tabs.get(tab.id);
    const final = await browser.tabs.sendMessage(tab.id, { type: 'assyst-queue', action: 'verify' }, { frameId });
    if (currentTab.url !== tab.url || !final?.ok || final.scope !== result.scope || final.total !== result.total || !final.unfiltered) {
      throw new Error('A página ou os filtros mudaram. Nada foi limpo.');
    }
    const snapshot = { total: result.total, tickets: [...result.tickets], at: new Date().toISOString() };
    if (!result.total && !message.allowEmpty) {
      // A confirmed empty report is safe; deleting all marks still needs manual confirmation.
      state.assyst_queue_snapshot = snapshot;
      state.assyst_revision++;
      await browser.storage.local.set(state);
      return { needsEmptyConfirmation: true, total: 0, state };
    }
    const keep = new Set(result.queueTickets);
    const removed = [...new Set([...Object.keys(state.assyst_ticket_tags), ...Object.keys(state.assyst_contacts)])].filter(id => !keep.has(id));
    const metadata = {};
    if (removed.length) {
      metadata.assyst_cleanup_backup = { ...JSON.parse(AssystData.backup(state)), removedTickets: removed };
      state.assyst_has_cleanup_backup = true;
    }
    for (const id of removed) { delete state.assyst_ticket_tags[id]; delete state.assyst_contacts[id]; }
    state.assyst_last_queue_sync = { total: result.total, removed: removed.length, at: snapshot.at };
    state.assyst_queue_snapshot = snapshot;
    state.assyst_revision++;
    // One write commits the recovery copy and the cleanup together.
    await browser.storage.local.set({ ...metadata, ...state });
    return { state, removed: removed.length, total: result.total };
  });
}

async function handle(message) {
  const state = await readState();
  if (message.action === 'get') return { state };
  if (message.action === 'exportCleanupBackup') {
    const saved = await browser.storage.local.get(['assyst_cleanup_backup']);
    if (!saved.assyst_cleanup_backup) throw new Error('Não há cópia anterior à limpeza.');
    return download(saved.assyst_cleanup_backup, 'json', true);
  }
  if (message.action === 'restoreCleanup') {
    const saved = (await browser.storage.local.get(['assyst_cleanup_backup'])).assyst_cleanup_backup;
    if (!saved || !Array.isArray(saved.removedTickets)) throw new Error('Não há limpeza para desfazer.');
    const previous = AssystData.parseBackup(saved);
    let restored = 0;
    for (const id of saved.removedTickets) {
      if (Object.hasOwn(state.assyst_ticket_tags, id) || Object.hasOwn(state.assyst_contacts, id)) continue;
      const tag = previous.assyst_ticket_tags[id];
      if (tag) {
        if (!state.assyst_tags.some(item => item.id === tag)) state.assyst_tags.push(previous.assyst_tags.find(item => item.id === tag));
        state.assyst_ticket_tags[id] = tag;
      }
      if (Object.hasOwn(previous.assyst_contacts, id)) state.assyst_contacts[id] = previous.assyst_contacts[id];
      restored++;
    }
    state.assyst_auto_sync = false;
    state.assyst_queue_snapshot = null;
    state.assyst_has_cleanup_backup = false;
    state.assyst_revision++;
    await browser.storage.local.set({ ...state, assyst_cleanup_backup: null });
    return { state, restored };
  }
  if (message.action === 'exportUpgradeBackup') {
    const saved = await browser.storage.local.get(['assyst_upgrade_backup']);
    if (!saved.assyst_upgrade_backup) throw new Error('Não há cópia anterior à migração neste perfil.');
    return download(saved.assyst_upgrade_backup, 'json', true);
  }
  if (message.action === 'export') {
    if (message.format !== 'json') throw new Error('Formato de exportação inválido.');
    return download(state, message.format);
  }
  if (message.action === 'setRefreshSettings') {
    state.assyst_refresh_settings = AssystData.refreshSettings(message.settings, true);
  } else if (message.action === 'setAutoSync') {
    if (typeof message.enabled !== 'boolean') throw new Error('Configuração inválida.');
    state.assyst_auto_sync = message.enabled;
  } else if (message.action === 'saveTag' || message.action === 'createAndAssign') {
    const incoming = { ...message.tag };
    if (!incoming.id) incoming.id = 'TAG_' + crypto.randomUUID();
    const tag = AssystData.tag(incoming);
    const index = state.assyst_tags.findIndex(item => item.id === tag.id);
    if (index < 0) state.assyst_tags.push(tag);
    else state.assyst_tags[index] = tag;
    if (message.action === 'createAndAssign') {
      const ticket = AssystData.identifier(message.ticket, 'Número do chamado');
      state.assyst_ticket_tags[ticket] = tag.id;
    }
  } else if (message.action === 'assign') {
    const ticket = AssystData.identifier(message.ticket, 'Número do chamado');
    if (message.id === 'NONE') delete state.assyst_ticket_tags[ticket];
    else {
      if (!state.assyst_tags.some(tag => tag.id === message.id)) throw new Error('Esta tag foi removida. Escolha outra tag.');
      state.assyst_ticket_tags[ticket] = message.id;
    }
  } else if (message.action === 'contact') {
    const ticket = AssystData.identifier(message.ticket, 'Número do chamado');
    const previous = AssystData.contact(state.assyst_contacts[ticket]);
    if (JSON.stringify(AssystData.contact(message.expected)) !== JSON.stringify(previous)) {
      throw new Error('O contato foi alterado em outra janela. Confira o histórico e tente novamente.');
    }
    // Always date contacts in the background: a page cannot spoof or backdate an attempt.
    state.assyst_contacts[ticket] = AssystData.changeContact(previous, message.operation, AssystData.today(), message.index);
  } else if (message.action === 'deleteTag') {
    state.assyst_tags = state.assyst_tags.filter(tag => tag.id !== message.id);
    for (const [ticket, id] of Object.entries(state.assyst_ticket_tags)) {
      if (id === message.id) delete state.assyst_ticket_tags[ticket];
    }
  } else if (message.action === 'import') {
    const imported = AssystData.parseBackup(message.backup);
    if (!['merge', 'replace'].includes(message.mode)) throw new Error('Modo de importação inválido.');
    const result = message.mode === 'replace' ? imported : AssystData.merge(state, imported);
    state.assyst_tags = result.assyst_tags;
    state.assyst_ticket_tags = result.assyst_ticket_tags;
    state.assyst_contacts = result.assyst_contacts;
    // A JSON backup carries marks, not proof of current queue membership on this computer.
    state.assyst_queue_snapshot = null;
  } else throw new Error('Operação desconhecida.');
  state.assyst_revision += 1;
  await browser.storage.local.set(state);
  return { state };
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'assyst-tagger' || sender.id !== browser.runtime.id) return undefined;
  if (message.action === 'queueReady') {
    const job = reportJobs.get(message.token);
    if (job && sender.tab?.id === job.tabId && Number.isInteger(sender.frameId) && isAssyst(sender.url)) {
      job.frames.add(sender.frameId);
    }
    return Promise.resolve({ ok: true });
  }
  if (message.action === 'export' && message.format === 'csv') {
    return exportQueue(message.sourceTabId).then(result => ({ ok: true, ...result }), error => ({ ok: false, error: error.message }));
  }
  if (message.action === 'syncQueue') {
    if (sender.tab) {
      if (!isAssyst(sender.url)) return Promise.resolve({ ok: false, error: 'Origem inválida.' });
      message = { ...message, sourceTabId: sender.tab.id };
    }
    return syncQueue(message).then(result => ({ ok: true, ...result }), error => ({ ok: false, error: error.message }));
  }
  const operation = queue.then(() => handle(message));
  queue = operation.catch(() => undefined);
  return operation.then(result => ({ ok: true, ...result }), error => ({ ok: false, error: error.message }));
});
