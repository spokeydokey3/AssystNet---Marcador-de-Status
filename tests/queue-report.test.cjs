const test = require('node:test');
const assert = require('node:assert/strict');
const { background, dataAPI, clone } = require('./harness.cjs');
const data = dataAPI();
const capture = (ids = ['S1', 'R2', 'S3']) => ({ ok: true, complete: true, total: ids.length,
  queueTickets: ids, tickets: ids.filter(id => id !== 'R2'), unfiltered: true, scope: 'own' });
const initial = () => ({ assyst_ticket_tags: { S1: 'REDMINE', R2: 'ATENDIMENTO', OLD9: 'REDMINE' } });

test('new profiles and custom-only imports have no presets; explicit old definitions and assigned legacy tags survive', async () => {
  const bg = background();
  const result = await bg.send('get');
  assert.deepEqual(clone(result.state.assyst_tags), []);
  assert.equal((await bg.send('assign', { ticket: 'S1', id: 'REDMINE' })).ok, false);
  await bg.send('saveTag', { tag: { id: 'MY', label: 'Minha tag', bg: '#abc' } });
  await bg.send('assign', { ticket: 'S1', id: 'MY' });
  const restarted = background(bg.read());
  assert.equal((await restarted.send('get')).state.assyst_tags.length, 1);
  assert.equal(restarted.read().assyst_ticket_tags.S1, 'MY');
  const custom = data.parseBackup({ assyst_custom_tags: [{ key: 'MY', label: 'Minha tag', bg: '#abc' }] });
  assert.deepEqual(clone(custom.assyst_tags).map(tag => tag.id), ['MY']);
  const legacy = data.parseBackup({ assyst_ticket_tags: { S1: 'REDMINE' } });
  assert.equal(legacy.assyst_tags.length, 1);
  assert.equal(legacy.assyst_tags[0].label, 'Redmine');
  const previous = data.normalize({ assyst_tags: [{ id: 'REDMINE', label: 'Personalizada', bg: '#abc' }] });
  assert.equal(previous.assyst_tags[0].label, 'Personalizada');
});

test('saved report includes open untagged tickets, excludes closed/absent tickets and uses current marks without any tab', async () => {
  const options = { capture: capture() };
  const bg = background(initial(), options);
  assert.ok((await bg.send('syncQueue')).ok);
  options.capture = () => { throw new Error('Report must not scan'); };
  bg.browser.tabs.query = async () => { throw new Error('No browser tab needed'); };
  assert.ok((await bg.send('assign', { ticket: 'S1', id: 'ATENDIMENTO' })).ok);
  assert.ok((await bg.send('contact', { ticket: 'S1', operation: 'toggle', index: 2, expected: data.contact() })).ok);
  const result = await bg.send('export', { format: 'csv', sourceTabId: 999 });
  assert.ok(result.ok, result.error);
  assert.equal(result.savedQueue, true);
  assert.equal(result.count, 2);
  assert.equal(result.confirmedAt, bg.read().assyst_queue_snapshot.at);
  const csv = await bg.downloads.at(-1).blob.text();
  assert.ok(csv.includes('"S1";"Em Atendimento";"1/4"'));
  assert.ok(csv.includes('"S3";"Sem tag"'));
  assert.ok(!csv.includes('"R2"') && !csv.includes('"OLD9"'));
  assert.ok(bg.downloads.at(-1).filename.startsWith('assyst_fila_conferida_'));
});

test('saved queue persists after restart and refreshes membership/status on the next validated sync', async () => {
  let bg = background(initial(), { capture: capture() });
  await bg.send('syncQueue');
  const options = { tab: { id: 7, url: 'http://cati.tj.ce.gov.br/assystnet/#events/S1' }, frames: [] };
  bg = background(bg.read(), options);
  assert.ok((await bg.send('export', { format: 'csv' })).savedQueue);
  options.frames = [0];
  options.tab.url = 'http://cati.tj.ce.gov.br/assystnet/#eventMonitor/4';
  options.capture = capture(['S3', 'R4']);
  assert.ok((await bg.send('syncQueue')).ok);
  assert.deepEqual(bg.read().assyst_queue_snapshot.tickets, ['S3', 'R4']);
  const result = await bg.send('export', { format: 'csv' });
  assert.equal(result.count, 2);
  assert.equal((await bg.downloads.at(-1).blob.text()).includes('"S1"'), false);
});

test('unconfirmed empty cleanup saves an empty report but preserves marks and the recovery checkpoint', async () => {
  const bg = background(initial(), { capture: capture([]) });
  const result = await bg.send('syncQueue', { automatic: true });
  assert.ok(result.needsEmptyConfirmation);
  assert.deepEqual(bg.read().assyst_ticket_tags, initial().assyst_ticket_tags);
  assert.deepEqual(bg.read().assyst_queue_snapshot.tickets, []);
  const report = await bg.send('export', { format: 'csv' });
  assert.ok(report.ok); assert.equal(report.count, 0);
  assert.equal((await bg.downloads.at(-1).blob.text()).split('\r\n').length, 2);
});

test('imports and undo invalidate saved membership; JSON never transfers a computer queue snapshot', async () => {
  for (const mode of ['merge', 'replace', 'undo']) {
    const bg = background(initial(), { capture: capture() });
    await bg.send('syncQueue');
    await bg.send('export', { format: 'json' });
    const backup = JSON.parse(await bg.downloads.at(-1).blob.text());
    assert.equal(backup.formatVersion, 3);
    assert.equal(backup.assyst_queue_snapshot, undefined);
    const result = mode === 'undo' ? await bg.send('restoreCleanup') :
      await bg.send('import', { backup: { ...backup, assyst_queue_snapshot: { at: '2026-11-01', total: 1, tickets: ['OLD9'] } }, mode });
    assert.ok(result.ok, result.error);
    assert.equal(bg.read().assyst_queue_snapshot, null);
  }
});

test('status changes between scans and invalid open membership do not replace a previous snapshot or delete data', async () => {
  for (const mode of ['status', 'unknown', 'duplicate', 'failure']) {
    const options = { capture: capture() };
    const bg = background(initial(), options);
    await bg.send('syncQueue');
    const before = bg.read();
    let scans = 0;
    options.capture = () => {
      const result = capture();
      if (mode === 'status' && ++scans === 2) result.tickets = ['S1'];
      if (mode === 'unknown') result.tickets = ['S999'];
      if (mode === 'duplicate') result.tickets = ['S1', 'S1'];
      return result;
    };
    if (mode === 'failure') bg.failWrite();
    assert.equal((await bg.send('syncQueue')).ok, false, mode);
    assert.deepEqual(bg.read(), before, mode);
  }
});

test('corrupt saved membership cannot be mistaken for a verified report', async () => {
  for (const snapshot of [{ at: 'invalid', total: 1, tickets: ['S1'] }, { at: '2026-11-12', total: 1, tickets: ['S1', 'S1'] },
    { at: '2026-11-12', total: 1, tickets: [null] }, { at: '2026-11-12', total: -1, tickets: [] }]) {
    assert.equal(data.queueSnapshot(snapshot), null);
    const bg = background({ assyst_schema_version: 3, assyst_tags: [], assyst_queue_snapshot: snapshot }, { frames: [] });
    assert.equal((await bg.send('export', { format: 'csv' })).ok, false);
    assert.equal(bg.downloads.length, 0);
  }
});

test('both AssystNet origins and Chrome callbacks share the same saved report with no host-specific mark namespace', async () => {
  for (const origin of ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br']) {
    for (const chrome of [false, true]) {
      let bg = background(initial(), { chrome, capture: capture(), tab: { id: 7, url: origin + '/assystnet/#homepage' } });
      assert.ok((await bg.send('syncQueue')).ok);
      bg = background(bg.read(), { chrome, frames: [], tab: { id: 7, url: 'https://example.com/' } });
      assert.ok((await bg.send('export', { format: 'csv' })).savedQueue);
      assert.equal(bg.read().assyst_ticket_tags.S1, 'REDMINE');
    }
  }
});
