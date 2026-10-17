const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { root, background } = require('./harness.cjs');
const code = name => fs.readFileSync(`${root}/chrome/${name}`, 'utf8');
const event = () => {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    hasListener: fn => listeners.has(fn), emit: value => { for (const fn of listeners) fn(value); }, listeners };
};

test('Chrome compatibility keeps local storage and bridges async, ignored and rejected messages', async () => {
  const onMessage = event();
  const local = {};
  const context = vm.createContext({ chrome: { runtime: { id: 'test', getURL: p => p, sendMessage() {}, onMessage },
    storage: { local, onChanged: event() } } });
  vm.runInContext(code('compat.js'), context);
  assert.equal(context.browser.storage.local, local);
  assert.equal(context.browser.storage.sync, undefined);
  let answer;
  const listener = message => message.ignore ? undefined : message.fail ? Promise.reject(new Error('failed')) : Promise.resolve({ ok: true });
  context.browser.runtime.onMessage.addListener(listener);
  context.browser.runtime.onMessage.addListener(listener);
  assert.equal(onMessage.listeners.size, 1);
  const wrapped = [...onMessage.listeners][0];
  assert.equal(wrapped({}, {}, value => { answer = value; }), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(answer.ok, true);
  answer = undefined;
  assert.equal(wrapped({ ignore: true }, {}, value => { answer = value; }), false);
  assert.equal(answer, undefined);
  wrapped({ fail: true }, {}, value => { answer = value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(answer.error, 'failed');
  assert.equal(context.browser.runtime.onMessage.hasListener(listener), true);
  context.browser.runtime.onMessage.removeListener(listener);
  assert.equal(onMessage.listeners.size, 0);
});

function downloadsHarness(options = {}) {
  let document = null;
  let serial = 0;
  const blobs = new Map();
  const downloads = new Map();
  const revoked = [];
  const counters = { created: 0, closed: 0 };
  const changed = event();
  let documentListener;
  class TestURL extends URL {
    static createObjectURL(blob) { const url = `blob:test-${++serial}`; blobs.set(url, blob); return url; }
    static revokeObjectURL(url) { blobs.delete(url); revoked.push(url); }
  }
  const runtime = {
    id: 'test', getURL: name => `chrome-extension://test/${name}`,
    async getContexts() { return document ? [{}] : []; },
    async sendMessage(message) {
      if (!documentListener) throw new Error('No offscreen listener');
      return new Promise(resolve => documentListener(message, { id: 'test' }, resolve));
    },
    onMessage: { addListener(fn) { documentListener = fn; } }
  };
  const chrome = {
    runtime,
    offscreen: {
      async createDocument() {
        assert.equal(document, null, 'one offscreen document only'); counters.created++;
        document = vm.createContext({ chrome: { runtime }, URL: TestURL, Blob, crypto: webcrypto });
        vm.runInContext(code('offscreen.js'), document);
      },
      async closeDocument() { document = null; documentListener = null; counters.closed++; }
    },
    downloads: {
      onChanged: changed,
      async download(value) {
        if (options.fail) throw new Error('Download canceled');
        assert.ok(blobs.has(value.url));
        const id = downloads.size + 1;
        downloads.set(id, { ...value, id, state: options.fast ? 'complete' : 'in_progress', blob: blobs.get(value.url) });
        if (options.fast) changed.emit({ id, state: { current: 'complete' } });
        return id;
      },
      async search(query) { return [...downloads.values()].filter(item => query.id !== undefined ? item.id === query.id : item.url === query.url); },
      async cancel(id) { downloads.get(id).state = 'interrupted'; }
    }
  };
  const start = () => {
    changed.listeners.clear();
    const worker = vm.createContext({ chrome, queueMicrotask, console });
    vm.runInContext(code('downloads.js'), worker);
    return worker.AssystDownloads;
  };
  const finish = async (id, state = 'complete') => {
    downloads.get(id).state = state; changed.emit({ id, state: { current: state } });
    await new Promise(resolve => setImmediate(resolve));
  };
  return { start, finish, counters, downloads, blobs, revoked, chrome };
}

const json = text => ({ text, mime: 'application/json;charset=utf-8', filename: 'assyst.json' });

test('simultaneous Chrome exports share a document, preserve Unicode and release only completed URLs', async () => {
  const h = downloadsHarness(); const bridge = h.start();
  const results = await Promise.all([bridge.download(json('ação ç 漢字')), bridge.download(json('second'))]);
  assert.equal(h.counters.created, 1);
  assert.equal(await h.downloads.get(results[0].downloadId).blob.text(), 'ação ç 漢字');
  assert.equal(h.blobs.size, 2);
  await h.finish(results[0].downloadId);
  assert.equal(h.blobs.size, 1);
  assert.equal(h.counters.closed, 0);
  await h.finish(results[1].downloadId, 'interrupted');
  assert.equal(h.blobs.size, 0);
  assert.equal(h.counters.closed, 1);
});

test('Chrome worker restart keeps active download URLs and releases them after completion', async () => {
  const h = downloadsHarness(); let bridge = h.start();
  const result = await bridge.download(json('backup'));
  bridge = h.start(); await bridge.reconcile();
  assert.equal(h.blobs.size, 1);
  await h.finish(result.downloadId);
  assert.equal(h.blobs.size, 0);
  assert.equal(h.counters.closed, 1);
});

test('download cancellation and very fast completion cannot leak the offscreen document', async () => {
  const failed = downloadsHarness({ fail: true });
  await assert.rejects(failed.start().download(json('x')), /canceled/);
  assert.equal(failed.blobs.size, 0);
  assert.equal(failed.counters.closed, 1);
  const fast = downloadsHarness({ fast: true });
  await fast.start().download(json('x'));
  assert.equal(fast.blobs.size, 0);
  assert.equal(fast.counters.closed, 1);
});

test('unrelated downloads do not open an offscreen document', async () => {
  const h = downloadsHarness(); const bridge = h.start();
  await bridge.reconcile();
  h.chrome.downloads.onChanged.emit({ id: 99, state: { current: 'complete' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.counters.created, 0);
});

test('invalid download content closes an empty document and does not poison later exports', async () => {
  const h = downloadsHarness(); const bridge = h.start();
  await assert.rejects(bridge.download({ ...json('x'), mime: 'text/html' }), /inválido/);
  assert.equal(h.blobs.size, 0);
  assert.equal(h.counters.closed, 1);
  const result = await bridge.download(json('valid'));
  assert.equal(h.counters.created, 2);
  await h.finish(result.downloadId);
  assert.equal(h.blobs.size, 0);
});

test('shared background exports JSON and current-queue CSV through the Chrome platform bridge', async () => {
  const files = [];
  let fail = false;
  const bg = background({ assyst_tags: [{ id: 'A', label: 'Ação', bg: '#2563eb' }], assyst_ticket_tags: { R1: 'A', OLD: 'A' },
    assyst_contacts: { R1: { attempts: ['2026-10-01', '2026-10-01'], respondedOn: null } } }, {
    capture: { ok: true, complete: true, total: 1, tickets: ['R1'] },
    downloadBridge: { async download(file) {
      if (fail) throw new Error('Canceled by Chrome');
      files.push(file); return { downloadId: files.length };
    } }
  });
  assert.ok((await bg.send('export', { format: 'json' })).ok);
  assert.equal(JSON.parse(files[0].text).assyst_ticket_tags.OLD, 'A');
  assert.equal(files[0].mime, 'application/json;charset=utf-8');
  const result = await bg.send('export', { format: 'csv' });
  assert.ok(result.ok); assert.equal(result.count, 1);
  assert.ok(files[1].text.includes('"R1";"Ação";"2/4"'));
  assert.equal(files[1].text.includes('"OLD"'), false);
  assert.equal(bg.downloads.length, 0, 'service worker never uses the Firefox Blob URL path');
  fail = true;
  const before = bg.read();
  assert.equal((await bg.send('export', { format: 'json' })).ok, false);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('assign', { ticket: 'R2', id: 'A' })).ok);
});
