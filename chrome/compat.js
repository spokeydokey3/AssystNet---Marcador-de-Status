'use strict';

// A small, local adapter for the APIs this project uses. No external polyfill.
// Explicit sendResponse also supports Chrome versions without Promise listeners.
(() => {
  const listeners = new WeakMap();
  const onMessage = {
    addListener(listener) {
      if (listeners.has(listener)) return;
      const wrapped = (message, sender, sendResponse) => {
        let result;
        try { result = listener(message, sender); }
        catch (error) { sendResponse({ ok: false, error: error.message }); return false; }
        if (result === undefined) return false;
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
          return true;
        }
        sendResponse(result);
        return false;
      };
      listeners.set(listener, wrapped);
      chrome.runtime.onMessage.addListener(wrapped);
    },
    removeListener(listener) {
      const wrapped = listeners.get(listener);
      if (wrapped) { chrome.runtime.onMessage.removeListener(wrapped); listeners.delete(listener); }
    },
    hasListener(listener) {
      const wrapped = listeners.get(listener);
      return !!wrapped && chrome.runtime.onMessage.hasListener(wrapped);
    }
  };
  globalThis.browser = {
    runtime: {
      id: chrome.runtime.id,
      getURL: chrome.runtime.getURL.bind(chrome.runtime),
      sendMessage: chrome.runtime.sendMessage.bind(chrome.runtime),
      onMessage
    },
    storage: { local: chrome.storage.local, onChanged: chrome.storage.onChanged },
    tabs: chrome.tabs,
    windows: chrome.windows,
    downloads: chrome.downloads
  };
})();
