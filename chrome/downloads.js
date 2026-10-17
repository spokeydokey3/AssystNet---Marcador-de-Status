'use strict';
(() => {
  const documentURL = chrome.runtime.getURL('chrome/offscreen.html');
  let pending = Promise.resolve();
  async function hasDocument() {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [documentURL] });
    return contexts.length > 0;
  }
  function documentMessage(action, payload = {}, create = false) {
    const operation = pending.then(async () => {
      if (!await hasDocument()) {
        if (!create) return { ok: true, remaining: 0, records: [] };
        await chrome.offscreen.createDocument({
          url: 'chrome/offscreen.html', reasons: ['BLOBS'],
          justification: 'Criar URLs locais dos backups JSON e relatórios CSV solicitados pelo usuário.'
        });
      }
      const response = await chrome.runtime.sendMessage({ type: 'assyst-download', target: 'offscreen', action, ...payload });
      if (!response?.ok) {
        if (response?.remaining === 0) await chrome.offscreen.closeDocument();
        throw new Error(response?.error || 'Não foi possível preparar o download local.');
      }
      if (action.startsWith('release') && response.remaining === 0) await chrome.offscreen.closeDocument();
      return response;
    });
    pending = operation.catch(() => undefined);
    return operation;
  }
  async function download({ text, mime, filename }) {
    const record = await documentMessage('create', { text, mime }, true);
    let id;
    try {
      id = await chrome.downloads.download({ url: record.url, saveAs: true, filename });
      await documentMessage('associate', { token: record.token, downloadId: id });
      const items = await chrome.downloads.search({ id });
      if (!items[0] || items[0].state !== 'in_progress') await documentMessage('release', { token: record.token });
      return { downloadId: id };
    } catch (error) {
      if (id !== undefined) { try { await chrome.downloads.cancel(id); } catch { /* Already finished. */ } }
      try { await documentMessage('release', { token: record.token }); } catch { /* A closed document already releases its URLs. */ }
      throw error;
    }
  }
  async function reconcile() {
    const { records } = await documentMessage('list');
    for (const record of records) {
      const items = await chrome.downloads.search(record.downloadId === null ? { url: record.url } : { id: record.downloadId });
      const item = items[0];
      if (!item || item.state !== 'in_progress') await documentMessage('release', { token: record.token });
      else if (record.downloadId === null) await documentMessage('associate', { token: record.token, downloadId: item.id });
    }
  }
  chrome.downloads.onChanged.addListener(delta => {
    if (delta.state && ['complete', 'interrupted'].includes(delta.state.current)) {
      documentMessage('releaseById', { downloadId: delta.id }).catch(error => console.warn('AssystNet: limpeza de download pendente.', error));
    }
  });
  globalThis.AssystDownloads = { download, reconcile };
  // Existing downloads can finish while a fresh worker starts; the offscreen document owns their URLs.
  queueMicrotask(() => reconcile().catch(error => console.warn('AssystNet: conferência de downloads pendente.', error)));
})();
