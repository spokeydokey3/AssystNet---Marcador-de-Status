const test = require('node:test');
const assert = require('node:assert/strict');
const { background } = require('./harness.cjs');
const capture = (ids = ['S1', 'R2']) => ({ ok: true, complete: true, total: ids.length,
  tickets: ids.filter(id => id !== 'R2'), queueTickets: ids, unfiltered: true, scope: 'own-queue-unfiltered' });
const initial = () => ({ assyst_ticket_tags: { S1: 'REDMINE', R2: 'ATENDIMENTO', S9: 'REDMINE' },
  assyst_contacts: { S9: { attempts: ['2026-10-01'] }, S8: { attempts: ['2026-10-02'] } } });

test('cleanup uses full membership, preserves closed rows still in queue and keeps tag definitions', async () => {
  const bg = background(initial(), { capture: capture() });
  await bg.send('get'); const before = bg.read();
  const result = await bg.send('syncQueue');
  assert.ok(result.ok, result.error); assert.equal(result.removed, 2);
  assert.deepEqual(bg.read().assyst_ticket_tags, { S1: 'REDMINE', R2: 'ATENDIMENTO' });
  assert.deepEqual(bg.read().assyst_contacts, {});
  assert.deepEqual(bg.read().assyst_tags, before.assyst_tags);
  assert.equal(bg.read().assyst_has_cleanup_backup, true);
  assert.deepEqual(bg.read().assyst_cleanup_backup.assyst_contacts, before.assyst_contacts);
  assert.equal(bg.read().assyst_last_queue_sync.total, 2);
});

test('undo restores removed records, keeps subsequent edits and pauses automatic cleanup', async () => {
  const bg = background(initial(), { capture: capture() });
  await bg.send('syncQueue');
  await bg.send('assign', { ticket: 'S9', id: 'ATENDIMENTO' });
  const result = await bg.send('restoreCleanup');
  assert.ok(result.ok); assert.equal(result.restored, 1);
  assert.equal(bg.read().assyst_ticket_tags.S9, 'ATENDIMENTO');
  assert.ok(bg.read().assyst_contacts.S8);
  assert.equal(bg.read().assyst_auto_sync, false);
  assert.equal(bg.read().assyst_has_cleanup_backup, false);
  assert.equal(bg.read().assyst_cleanup_backup, null);
});

test('incomplete, filtered, duplicate or invalid queue membership cannot delete data', async () => {
  for (const result of [ { ...capture(), complete: false }, { ...capture(), unfiltered: false },
    { ...capture(), queueTickets: ['S1'] }, { ...capture(), queueTickets: ['S1', 'S1'] },
    { ...capture(), queueTickets: ['S1', '=1+1'] } ]) {
    const bg = background(initial(), { capture: result }); await bg.send('get'); const before = bg.read();
    assert.equal((await bg.send('syncQueue')).ok, false);
    assert.deepEqual(bg.read(), before);
  }
});

test('changed membership across scans aborts cleanup', async () => {
  let scans = 0;
  const options = { capture: () => capture(++scans === 1 ? ['S1', 'R2'] : ['S1', 'R3']), verify: capture() };
  const bg = background(initial(), options); await bg.send('get'); const before = bg.read();
  assert.equal((await bg.send('syncQueue')).ok, false);
  assert.deepEqual(bg.read(), before);
});

test('a filter or route change at final verification leaves data and recovery copy untouched', async () => {
  const bg = background(initial(), { capture: capture(), verify: { ok: false, error: 'filter changed' } });
  await bg.send('get'); const before = bg.read();
  assert.equal((await bg.send('syncQueue')).ok, false);
  assert.deepEqual(bg.read(), before);
});

test('cleanup and recovery checkpoint commit atomically; storage failures do not poison later writes', async () => {
  const bg = background(initial(), { capture: capture() }); await bg.send('get'); const before = bg.read();
  bg.failWrite(); assert.equal((await bg.send('syncQueue')).ok, false);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('assign', { ticket: 'S1', id: 'ATENDIMENTO' })).ok);
});

test('empty queues require explicit manual confirmation, automatic mode never wipes all records', async () => {
  const bg = background(initial(), { capture: capture([]) }); await bg.send('get'); const before = bg.read();
  assert.equal((await bg.send('syncQueue', { automatic: true })).needsEmptyConfirmation, true);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('syncQueue', { allowEmpty: true })).ok);
  assert.deepEqual(bg.read().assyst_ticket_tags, {});
  assert.ok(bg.read().assyst_cleanup_backup);
});

test('disabled automatic cleanup does not scan, but manual synchronization remains available', async () => {
  let scans = 0;
  const bg = background(initial(), { capture: () => { scans++; return capture(); }, verify: capture() });
  await bg.send('setAutoSync', { enabled: false });
  assert.equal((await bg.send('syncQueue', { automatic: true })).paused, true);
  assert.equal(scans, 0);
  assert.ok((await bg.send('syncQueue')).ok); assert.equal(scans, 2);
});

test('fresh edits during the scan are preserved for queue members; no-change scans keep the last checkpoint', async () => {
  let bg;
  const options = { capture: async () => { await bg.send('assign', { ticket: 'S1', id: 'ATENDIMENTO' }); return capture(); }, verify: capture() };
  bg = background(initial(), options);
  assert.ok((await bg.send('syncQueue')).ok);
  assert.equal(bg.read().assyst_ticket_tags.S1, 'ATENDIMENTO');
  const checkpoint = bg.read().assyst_cleanup_backup;
  assert.ok((await bg.send('syncQueue')).ok);
  assert.deepEqual(bg.read().assyst_cleanup_backup, checkpoint);
});

test('recovery checkpoint can be exported and survives a simulated browser restart', async () => {
  let bg = background(initial(), { capture: capture() }); await bg.send('syncQueue');
  bg = background(bg.read());
  assert.ok((await bg.send('exportCleanupBackup')).ok);
  const backup = JSON.parse(await bg.downloads[0].blob.text());
  assert.equal(backup.formatVersion, 3); assert.equal(backup.assyst_ticket_tags.S9, 'REDMINE');
  assert.ok((await bg.send('restoreCleanup')).ok);
  assert.equal(bg.read().assyst_ticket_tags.S9, 'REDMINE');
});
