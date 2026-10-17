const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));

function dataAPI() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  return context.AssystData;
}

function background(initial = {}, options = {}) {
  let stored = clone(initial);
  let listener;
  let downloadListener;
  let failNextWrite = false;
  let serial = 0;
  const urls = new Map();
  const downloads = [];
  const revoked = [];
  const storageListeners = new Set();
  const tab = options.tab || { id: 7, url: 'https://cati.tjce.jus.br/assystnet/#eventMonitor/4' };
  const browser = {
    runtime: { id: 'test@assyst', onMessage: { addListener(fn) { listener = fn; } } },
    storage: {
      local: {
        async get(keys) {
          await new Promise(resolve => setImmediate(resolve));
          return Object.fromEntries(keys.filter(key => key in stored).map(key => [key, clone(stored[key])]));
        },
        async set(value) {
          await new Promise(resolve => setImmediate(resolve));
          if (failNextWrite) { failNextWrite = false; throw new Error('Simulated storage failure'); }
          const changes = {};
          for (const [key, item] of Object.entries(value)) {
            if (JSON.stringify(stored[key]) !== JSON.stringify(item)) changes[key] = { oldValue: stored[key], newValue: clone(item) };
          }
          Object.assign(stored, clone(value));
          for (const fn of storageListeners) fn(clone(changes), 'local');
        }
      },
      onChanged: { addListener(fn) { storageListeners.add(fn); }, removeListener(fn) { storageListeners.delete(fn); } }
    },
    downloads: {
      async download(options) { downloads.push({ ...options, blob: urls.get(options.url) }); return downloads.length; },
      async search() { return [{ state: 'in_progress' }]; },
      onChanged: { addListener(fn) { downloadListener = fn; } }
    },
    tabs: {
      async query() { return [tab]; },
      async get(id) {
        if (id === options.sourceTab?.id) return options.sourceTab;
        if (id !== tab.id) throw new Error('Tab not found');
        return tab;
      },
      async sendMessage(id, message) {
        if (message.action === 'probe') {
          for (const frameId of options.frames || [0]) {
            await listener({ type: 'assyst-tagger', action: 'queueReady', token: message.token },
              { id: browser.runtime.id, tab: options.sourceTab?.id === id ? options.sourceTab : tab,
                frameId, url: options.sourceTab?.id === id ? options.sourceTab.url : tab.url });
          }
          return undefined;
        }
        if (typeof options.capture === 'function') return options.capture();
        return options.capture || { ok: true, complete: true, total: 0, tickets: [] };
      }
    }
  };
  class TestURL extends URL {
    static createObjectURL(blob) { const url = `blob:test-${++serial}`; urls.set(url, blob); return url; }
    static revokeObjectURL(url) { urls.delete(url); revoked.push(url); }
  }
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [options.now || Date.now()])); }
    static now() { return options.now ? new Date(options.now).getTime() : Date.now(); }
  }
  const context = vm.createContext({ browser, crypto: webcrypto, Blob, URL: TestURL, Date: TestDate, setTimeout,
    AssystDownloads: options.downloadBridge });
  for (const file of ['data.js', 'background.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  const send = (action, payload = {}, sender = { id: browser.runtime.id }) => listener({ type: 'assyst-tagger', action, ...payload }, sender);
  return { send, browser, downloads, revoked, read: () => clone(stored),
    failWrite() { failNextWrite = true; }, complete(id) { downloadListener({ id, state: { current: 'complete' } }); } };
}

module.exports = { dataAPI, background, root, clone };
