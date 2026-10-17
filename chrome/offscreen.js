'use strict';
(() => {
  // This document survives service-worker suspension; it owns each Blob URL.
  const records = new Map();
  const release = token => {
    const record = records.get(token);
    if (record) { URL.revokeObjectURL(record.url); records.delete(token); }
  };
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'assyst-download' || message.target !== 'offscreen') return false;
    try {
      let result = {};
      if (message.action === 'create') {
        if (typeof message.text !== 'string' || !['application/json;charset=utf-8', 'text/csv;charset=utf-8'].includes(message.mime)) {
          throw new Error('Conteúdo de download inválido.');
        }
        const token = crypto.randomUUID();
        const url = URL.createObjectURL(new Blob([message.text], { type: message.mime }));
        records.set(token, { token, url, downloadId: null });
        result = { token, url };
      } else if (message.action === 'associate') {
        const record = records.get(message.token);
        if (!record || !Number.isInteger(message.downloadId) || message.downloadId < 0) throw new Error('Download local não encontrado.');
        record.downloadId = message.downloadId;
      } else if (message.action === 'release') release(message.token);
      else if (message.action === 'releaseById') {
        for (const [token, record] of records) if (record.downloadId === message.downloadId) release(token);
      } else if (message.action === 'list') result = { records: [...records.values()] };
      else throw new Error('Ação de download inválida.');
      sendResponse({ ok: true, ...result, remaining: records.size });
    } catch (error) { sendResponse({ ok: false, error: error.message, remaining: records.size }); }
    return false;
  });
})();
