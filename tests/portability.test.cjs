const test = require('node:test');
const assert = require('node:assert/strict');
const { background } = require('./harness.cjs');
const fixture = () => ({ assyst_tags: [{ id: 'A', label: 'Ação – usuário 漢字', bg: '#2563eb' }],
  assyst_ticket_tags: { '00123': 'A', R2478233: 'A', S111: 'A' },
  assyst_contacts: { R2478233: { checks: [false, true, false, true],
    markedOn: [null, '2026-11-10', null, '2026-11-09'], respondedOn: '2026-11-10' } } });
const dataOnly = state => ({ assyst_tags: state.assyst_tags, assyst_ticket_tags: state.assyst_ticket_tags, assyst_contacts: state.assyst_contacts });
const firefox = (initial = {}, options = {}) => background(initial, {
  sourceRoot: process.env.ASSYST_FIREFOX_PACKAGE_DIR, ...options });
const chrome = (initial = {}, options = {}) => {
  const files = [];
  const bg = background(initial, { chrome: true, sourceRoot: process.env.ASSYST_CHROME_PACKAGE_DIR,
    downloadBridge: { async download(file) { files.push(file); return { downloadId: files.length }; } }, ...options });
  return { ...bg, files };
};
async function ffJSON(bg) {
  const result = await bg.send('export', { format: 'json' }); assert.ok(result.ok, result.error);
  return bg.downloads.at(-1).blob.text();
}
async function chromeJSON(bg) {
  const result = await bg.send('export', { format: 'json' }); assert.ok(result.ok, result.error);
  assert.equal(bg.files.at(-1).mime, 'application/json;charset=utf-8');
  return bg.files.at(-1).text;
}

test('Firefox 3.6 JSON imports into Chrome with Unicode, full references and independent checkbox positions', async () => {
  const ff = firefox(fixture());
  const json = await ffJSON(ff);
  assert.equal(JSON.parse(json).formatVersion, 3);
  const ch = chrome({ assyst_ticket_tags: { LOCAL1: 'REDMINE' } });
  assert.ok((await ch.send('import', { backup: json, mode: 'replace' })).ok);
  assert.deepEqual(dataOnly(ch.read()), dataOnly(ff.read()));
  assert.equal(ch.read().assyst_ticket_tags['00123'], 'A');
  assert.deepEqual(ch.read().assyst_contacts.R2478233.checks, [false, true, false, true]);
});

test('Chrome export after editing imports into Firefox and back without count/date/tag loss', async () => {
  const ch = chrome(fixture(), { now: '2026-11-11T12:00:00Z' }); await ch.send('get');
  assert.ok((await ch.send('contact', { ticket: 'R2478233', operation: 'toggle', index: 0,
    expected: ch.read().assyst_contacts.R2478233 })).ok);
  const json = await chromeJSON(ch);
  assert.equal(JSON.parse(json).formatVersion, 3);
  assert.equal(JSON.parse(json).assyst_auto_sync, undefined, 'profile preferences are not ticket backup data');
  const ff = firefox({ assyst_ticket_tags: { KEEP1: 'REDMINE' } });
  assert.ok((await ff.send('import', { backup: json, mode: 'merge' })).ok);
  assert.equal(ff.read().assyst_ticket_tags.KEEP1, 'REDMINE');
  assert.deepEqual(ff.read().assyst_contacts, ch.read().assyst_contacts);
  const returned = chrome();
  assert.ok((await returned.send('import', { backup: await ffJSON(ff), mode: 'replace' })).ok);
  assert.deepEqual(dataOnly(returned.read()), dataOnly(ff.read()));
});

test('Chrome 3.5 state and v1/v2 backups migrate; restart keeps data and export is readable by Firefox 3.6', async () => {
  const oldContact = { attempts: ['2026-10-01', '2026-10-01', '2026-10-03'], respondedOn: null };
  const previous = { assyst_schema_version: 2, assyst_ticket_tags: { R1: 'REDMINE' }, assyst_contacts: { R1: oldContact } };
  let ch = chrome(previous); assert.ok((await ch.send('get')).ok);
  assert.deepEqual(ch.read().assyst_contacts.R1.markedOn, [...oldContact.attempts, null]);
  assert.equal(ch.read().assyst_schema_version, 3);
  assert.ok((await ch.send('import', { backup: { formatVersion: 1, assyst_ticket_tags: { S2: 'ATENDIMENTO' } }, mode: 'merge' })).ok);
  assert.ok((await ch.send('import', { backup: { formatVersion: 2, assyst_contacts: { S3: oldContact } }, mode: 'merge' })).ok);
  const before = ch.read(); ch = chrome(before); assert.ok((await ch.send('get')).ok);
  assert.deepEqual(dataOnly(ch.read()), dataOnly(before));
  const ff = firefox(); assert.ok((await ff.send('import', { backup: await chromeJSON(ch), mode: 'replace' })).ok);
  assert.deepEqual(dataOnly(ff.read()), dataOnly(ch.read()));
});

test('Chrome callback bridge supports queue cleanup/recovery and produces interoperable JSON and matching CSV', async () => {
  const capture = { ok: true, complete: true, total: 1, queueTickets: ['R2478233'], tickets: ['R2478233'], unfiltered: true, scope: 'own' };
  const ch = chrome(fixture(), { capture });
  const sync = await ch.send('syncQueue'); assert.ok(sync.ok, sync.error); assert.equal(sync.removed, 2);
  assert.ok(ch.read().assyst_cleanup_backup);
  assert.deepEqual(Object.keys(ch.read().assyst_ticket_tags), ['R2478233']);
  assert.ok((await ch.send('export', { format: 'csv' })).ok);
  const chromeCSV = ch.files.at(-1).text;
  const ff = firefox({}, { capture });
  assert.ok((await ff.send('import', { backup: await chromeJSON(ch), mode: 'replace' })).ok);
  assert.ok((await ff.send('export', { format: 'csv' })).ok);
  // Blob.text() strips a UTF-8 BOM; compare actual file bytes to retain Excel compatibility.
  assert.deepEqual(Buffer.from(await ff.downloads.at(-1).blob.arrayBuffer()), Buffer.from(chromeCSV, 'utf8'));
  assert.ok((await ch.send('restoreCleanup')).ok);
  assert.equal(ch.read().assyst_auto_sync, false);
  assert.equal(Object.keys(ch.read().assyst_ticket_tags).length, 3);
  const ffRestored = firefox();
  assert.ok((await ffRestored.send('import', { backup: await chromeJSON(ch), mode: 'replace' })).ok);
  assert.deepEqual(dataOnly(ffRestored.read()), dataOnly(ch.read()));
});
