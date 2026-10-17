const test = require('node:test');
const assert = require('node:assert/strict');
const { background } = require('./harness.cjs');
const initial = () => ({ assyst_tags: [{ id: 'A', label: 'A', bg: '#2563EB' }, { id: 'B', label: 'B', bg: '#D97706' }], assyst_ticket_tags: {} });

test('simultaneous assignments from different contexts do not overwrite each other', async () => {
  const bg = background(initial());
  await bg.send('get');
  const results = await Promise.all(Array.from({ length: 80 }, (_, index) => bg.send('assign', { ticket: 'S' + index, id: index % 2 ? 'A' : 'B' })));
  assert.ok(results.every(result => result.ok));
  assert.equal(Object.keys(bg.read().assyst_ticket_tags).length, 80);
  const updated = await Promise.all([bg.send('assign', { ticket: 'S0', id: 'A' }), bg.send('assign', { ticket: 'S0', id: 'B' })]);
  assert.ok(updated.every(result => result.ok));
  assert.equal(bg.read().assyst_ticket_tags.S0, 'B');
});

test('deletion cleans assignments; deleting all tags does not recreate defaults', async () => {
  const bg = background(initial());
  await bg.send('assign', { ticket: '1', id: 'A' });
  await bg.send('deleteTag', { id: 'A' }); await bg.send('deleteTag', { id: 'B' });
  const result = await bg.send('get');
  assert.equal(result.state.assyst_tags.length, 0);
  assert.equal(Object.keys(result.state.assyst_ticket_tags).length, 0);
});

test('two computers transfer backup with download API, and download URL survives until completion', async () => {
  const first = background(initial());
  await first.send('assign', { ticket: 'S2471375', id: 'A' });
  const result = await first.send('export', { format: 'json' });
  assert.ok(result.ok); assert.equal(first.revoked.length, 0);
  assert.equal(first.downloads[0].saveAs, true);
  const backup = await first.downloads[0].blob.text();
  first.complete(result.downloadId); assert.equal(first.revoked.length, 1);
  const second = background({}, { capture: { ok: true, complete: true, total: 1, tickets: ['S2471375'] } });
  const imported = await second.send('import', { backup, mode: 'replace' });
  assert.ok(imported.ok); assert.equal(second.read().assyst_ticket_tags.S2471375, 'A');
  await second.send('export', { format: 'csv' });
  assert.ok((await second.downloads[0].blob.text()).includes('"S2471375";"A"'));
});

test('invalid import leaves data unchanged, merge preserves assignments, replace removes old data', async () => {
  const bg = background(initial());
  await bg.send('assign', { ticket: '1', id: 'A' });
  const before = bg.read();
  assert.equal((await bg.send('import', { backup: '{}', mode: 'replace' })).ok, false);
  assert.deepEqual(bg.read(), before);
  const backup = { assyst_tags: [{ id: 'C', label: 'C', bg: '#fff' }], assyst_ticket_tags: { '2': 'C' } };
  await bg.send('import', { backup, mode: 'merge' });
  assert.equal(bg.read().assyst_ticket_tags['1'], 'A');
  assert.equal(bg.read().assyst_ticket_tags['2'], 'C');
  await bg.send('import', { backup, mode: 'replace' });
  assert.deepEqual(bg.read().assyst_ticket_tags, { '2': 'C' });
});

test('storage failures are reported, leave stored data intact, and do not poison the queue', async () => {
  const bg = background(initial()); await bg.send('get');
  const before = bg.read(); bg.failWrite();
  assert.equal((await bg.send('assign', { ticket: '1', id: 'A' })).ok, false);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('assign', { ticket: '2', id: 'B' })).ok);
  assert.equal(bg.read().assyst_ticket_tags['2'], 'B');
});

test('inline creation saves the tag and ticket in one operation and rejects foreign senders', async () => {
  const bg = background(initial());
  const result = await bg.send('createAndAssign', { ticket: 'R1', tag: { label: 'Nova', bg: '#abc' } });
  assert.ok(result.ok);
  assert.ok(result.state.assyst_tags.some(tag => tag.id === result.state.assyst_ticket_tags.R1 && tag.label === 'Nova'));
  assert.equal(bg.send('get', {}, { id: 'foreign@example' }), undefined);
});

test('version 3.0 assignments survive migration and simulated background/browser restarts', async () => {
  const previous = { assyst_tags: [{ id: 'VIP', label: 'VIP', bg: '#abc', color: '#fff' }],
    assyst_ticket_tags: { '00123': 'VIP', S100: 'VIP', R200: 'ATENDIMENTO' } };
  let bg = background(previous);
  let result = await bg.send('get');
  assert.ok(result.ok);
  assert.deepEqual({ ...result.state.assyst_ticket_tags }, previous.assyst_ticket_tags);
  assert.ok(result.state.assyst_tags.some(tag => tag.id === 'VIP'));
  assert.ok(result.state.assyst_tags.some(tag => tag.id === 'ATENDIMENTO'));
  assert.equal(result.state.assyst_has_upgrade_backup, true);
  assert.deepEqual(bg.read().assyst_upgrade_backup.assyst_tags, previous.assyst_tags);
  assert.deepEqual(bg.read().assyst_upgrade_backup.assyst_ticket_tags, previous.assyst_ticket_tags);
  await bg.send('assign', { ticket: 'S300', id: 'VIP' });
  for (let restart = 0; restart < 3; restart++) {
    bg = background(bg.read());
    result = await bg.send('get');
    assert.ok(result.ok);
    assert.equal(result.state.assyst_ticket_tags.S300, 'VIP');
    assert.equal(result.state.assyst_ticket_tags['00123'], 'VIP');
    assert.deepEqual(bg.read().assyst_upgrade_backup.assyst_ticket_tags, previous.assyst_ticket_tags);
  }
});

test('original legacy definitions are downloadable unchanged and the upgrade snapshot is never overwritten by imports', async () => {
  const previous = { assyst_custom_tags: [{ key: 'VIP', label: 'VIP antigo', bg: '#ABC', color: '#fff' }],
    assyst_ticket_tags: { S1: 'VIP', R2: 'REDMINE' } };
  const bg = background(previous);
  await bg.send('get');
  const original = bg.read().assyst_upgrade_backup;
  await bg.send('import', { backup: { assyst_tags: [], assyst_ticket_tags: {} }, mode: 'replace' });
  assert.deepEqual(bg.read().assyst_upgrade_backup, original);
  const result = await bg.send('exportUpgradeBackup');
  assert.ok(result.ok);
  const exported = JSON.parse(await bg.downloads[0].blob.text());
  assert.deepEqual(exported.assyst_custom_tags, previous.assyst_custom_tags);
  assert.deepEqual(exported.assyst_ticket_tags, previous.assyst_ticket_tags);
  assert.equal(exported.assyst_tags, undefined);
});

test('fresh installations have no original backup and migrations never clear unrelated keys', async () => {
  const bg = background({ unrelated_setting: 'keep' });
  const result = await bg.send('get');
  assert.ok(result.ok);
  assert.equal(result.state.assyst_has_upgrade_backup, false);
  assert.equal(bg.read().unrelated_setting, 'keep');
  assert.equal((await bg.send('exportUpgradeBackup')).ok, false);
});

test('unsupported future storage schemas are preserved rather than silently downgraded', async () => {
  const previous = { ...initial(), assyst_schema_version: 999 };
  const bg = background(previous);
  assert.equal((await bg.send('get')).ok, false);
  assert.deepEqual(bg.read(), previous);
});

test('signing identity matches the uploaded 3.0 manifest and the new version uses only necessary permissions', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { root } = require('./harness.cjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.browser_specific_settings.gecko.id, 'assyst-status-tagger@tjce.local');
  assert.equal(manifest.version, '3.5.0');
  const targets = ['http://cati.tj.ce.gov.br/assystnet/*', 'https://cati.tjce.jus.br/assystnet/*'];
  assert.deepEqual(manifest.host_permissions, targets);
  assert.deepEqual(manifest.content_scripts[0].matches, targets);
  assert.deepEqual(manifest.permissions, ['storage', 'downloads']);
  assert.equal(Object.hasOwn(manifest.background, 'persistent'), false);
  assert.equal(manifest.incognito, 'not_allowed');
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
});

test('each CSV export uses a fresh queue and never deletes historical marks or restores absent tickets', async () => {
  const options = { capture: { ok: true, complete: true, total: 2, tickets: ['S2', 'NEW'] } };
  const bg = background(initial(), options);
  await bg.send('assign', { ticket: 'OLD', id: 'A' });
  await bg.send('assign', { ticket: 'S2', id: 'B' });
  assert.ok((await bg.send('export', { format: 'csv' })).ok);
  const csv = await bg.downloads[0].blob.text();
  assert.equal(csv.includes('OLD'), false);
  assert.ok(csv.includes('"S2";"B"'));
  assert.ok(csv.includes('"NEW";"Sem tag"'));
  assert.equal(bg.read().assyst_ticket_tags.OLD, 'A');
  options.capture = { ok: true, complete: true, total: 1, tickets: ['NEW'] };
  assert.ok((await bg.send('export', { format: 'csv' })).ok);
  assert.equal((await bg.downloads[1].blob.text()).includes('S2'), false);
});

test('wrong sites, ambiguous frames and incomplete queues cannot download a CSV', async () => {
  for (const options of [
    { tab: { id: 7, url: 'https://example.com/' } },
    { frames: [] }, { frames: [0, 1] },
    { capture: { ok: false, error: 'Fila incompleta' } },
    { capture: { ok: true, complete: false, total: 2, tickets: ['S1'] } },
    { capture: { ok: true, complete: true, total: 1, tickets: ['S1', 'S1'] } }
  ]) {
    const bg = background(initial(), options);
    assert.equal((await bg.send('export', { format: 'csv' })).ok, false);
    assert.equal(bg.downloads.length, 0);
  }
});

test('a slow queue scan does not block assignments and exports the latest label', async () => {
  let startScan, finishScan;
  const started = new Promise(resolve => { startScan = resolve; });
  const finished = new Promise(resolve => { finishScan = resolve; });
  const bg = background(initial(), { capture: async () => { startScan(); return finished; } });
  const report = bg.send('export', { format: 'csv' });
  await started;
  assert.ok((await bg.send('assign', { ticket: 'S1', id: 'B' })).ok);
  finishScan({ ok: true, complete: true, total: 1, tickets: ['S1'] });
  assert.ok((await report).ok);
  assert.ok((await bg.downloads[0].blob.text()).includes('"S1";"B"'));
});

test('removing a historical ticket binding retains the tag and other assignments', async () => {
  const bg = background(initial());
  await bg.send('assign', { ticket: 'OLD', id: 'A' });
  await bg.send('assign', { ticket: 'S1', id: 'A' });
  assert.ok((await bg.send('assign', { ticket: 'OLD', id: 'NONE' })).ok);
  assert.equal(bg.read().assyst_ticket_tags.OLD, undefined);
  assert.equal(bg.read().assyst_ticket_tags.S1, 'A');
  assert.ok(bg.read().assyst_tags.some(tag => tag.id === 'A'));
});
