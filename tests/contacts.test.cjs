const test = require('node:test');
const assert = require('node:assert/strict');
const { dataAPI, background, clone } = require('./harness.cjs');
const data = dataAPI();
const old = () => ({ attempts: ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'], respondedOn: null });
const empty = () => clone(data.contact());
const toggle = (value, index, date = '2026-11-06') => data.changeContact(value, 'toggle', date, index);

test('legacy dates migrate to independent checks without losing their dates', () => {
  const migrated = data.contact(old());
  assert.deepEqual(clone(migrated.checks), [true, true, true, true]);
  assert.deepEqual(clone(migrated.markedOn), old().attempts);
  assert.deepEqual(clone(data.contact({ attempts: [] })), empty());
});

test('any box can toggle, including middle boxes, clock changes and response records', () => {
  let value = toggle(undefined, 3);
  value = toggle(value, 1, '2026-10-01');
  assert.deepEqual(clone(value.checks), [false, true, false, true]);
  value = toggle(value, 3);
  assert.deepEqual(clone(value.checks), [false, true, false, false]);
  assert.equal(value.markedOn[3], null);
  value = data.changeContact(value, 'respond', '2026-10-02');
  value = toggle(value, 0);
  assert.equal(value.checks[0], true);
  assert.equal(value.respondedOn, '2026-10-02');
});

test('seven-day reminder is informational and never authorizes closure', () => {
  const value = data.contact(old());
  assert.equal(data.contactInfo(value, '2026-10-07').reminder, false);
  const info = data.contactInfo(value, '2026-10-08');
  assert.equal(info.reminder, true);
  assert.equal(info.elapsedDays, 7);
  assert.match(info.status, /dias corridos/);
  assert.doesNotMatch(info.status, /encerramento/);
  assert.equal(toggle(value, 0, '2026-01-01').checks[0], false);
});

test('four same-day marks work; a fifth add and invalid indexes cannot change data', () => {
  let value = empty();
  for (let index = 0; index < 4; index++) value = toggle(value, index);
  assert.deepEqual(clone(value.markedOn), Array(4).fill('2026-11-06'));
  assert.throws(() => data.changeContact(value, 'add'));
  assert.deepEqual(clone(value.checks), [true, true, true, true]);
  for (const index of [-1, 4, '1', null]) assert.throws(() => toggle(value, index));
});

test('date math uses calendar dates and rejects impossible dates', () => {
  assert.equal(data.addDays('2026-12-31', 2), '2027-01-02');
  assert.equal(data.addDays('2028-02-28', 2), '2028-03-01');
  assert.equal(data.today(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', 'invalid']) assert.throws(() => data.day(date));
});

test('malformed legacy and new contact records are rejected', () => {
  for (const value of [null, [], { attempts: 'bad' }, { attempts: ['2026-02-30'] },
    { attempts: ['2026-10-03', '2026-10-01'] }, { attempts: [...old().attempts, '2026-10-09'] },
    { attempts: ['2026-10-01'], respondedOn: '2026-09-30' },
    { checks: [true], markedOn: [] }, { ...empty(), checks: ['yes', false, false, false] },
    { ...empty(), markedOn: ['2026-10-01', null, null, null] }]) {
    assert.throws(() => data.parseBackup({ formatVersion: 3, assyst_contacts: { S1: value } }));
  }
});

test('JSON v3 roundtrips holes; old imports preserve contacts and explicit empty records', () => {
  const current = data.normalize({ assyst_ticket_tags: { S1: 'REDMINE' }, assyst_contacts: { S2: toggle(undefined, 3) } });
  const json = data.backup(current);
  assert.equal(JSON.parse(json).formatVersion, 3);
  assert.deepEqual(clone(data.parseBackup(json)), clone(current));
  const older = data.parseBackup({ formatVersion: 1, assyst_ticket_tags: { S3: 'ATENDIMENTO' } });
  assert.deepEqual(clone(data.merge(current, older).assyst_contacts), clone(current.assyst_contacts));
  const cleared = data.parseBackup({ formatVersion: 2, assyst_contacts: { S2: { attempts: [] } } });
  assert.deepEqual(clone(data.merge(current, cleared).assyst_contacts.S2), empty());
});

test('CSV keeps checkbox positions and excludes historical tickets', () => {
  const state = data.normalize({ assyst_contacts: { S1: toggle(undefined, 3, '2026-10-01'), OLD: old() } });
  const csv = data.csv(state, ['S1', 'S1', 'S2']);
  assert.equal(csv.includes('OLD'), false);
  assert.ok(csv.includes('"S1";"Sem tag";"1/4";"";"";"";"01/10/2026"'));
  assert.equal(csv.split('\r\n').length, 4);
});

test('schema 2 migration preserves tags, contact dates and original backup across restarts', async () => {
  const previous = { assyst_schema_version: 2, assyst_tags: [{ id: 'A', label: 'A', bg: '#abc' }],
    assyst_ticket_tags: { S1: 'A' }, assyst_contacts: { S1: old() }, assyst_revision: 5,
    assyst_has_upgrade_backup: true, assyst_upgrade_backup: { formatVersion: 1, assyst_ticket_tags: { OLD: 'REDMINE' } } };
  let bg = background(previous); assert.ok((await bg.send('get')).ok);
  assert.equal(bg.read().assyst_schema_version, 3);
  for (let i = 0; i < 3; i++) { bg = background(bg.read()); assert.ok((await bg.send('get')).ok); }
  assert.deepEqual(bg.read().assyst_ticket_tags, previous.assyst_ticket_tags);
  assert.deepEqual(bg.read().assyst_contacts.S1.markedOn, old().attempts);
  assert.deepEqual(bg.read().assyst_upgrade_backup, previous.assyst_upgrade_backup);
});

test('background timestamps marks itself and rejects stale concurrent clicks', async () => {
  const bg = background({}, { now: '2026-11-06T12:00:00Z' });
  const results = await Promise.all([1, 2].map(() => bg.send('contact', {
    ticket: 'S1', operation: 'toggle', index: 3, expected: empty(), date: '2020-01-01' })));
  assert.equal(results.filter(value => value.ok).length, 1);
  assert.equal(bg.read().assyst_contacts.S1.markedOn[3], '2026-11-06');
  const before = bg.read();
  assert.equal((await bg.send('contact', { ticket: 'S1', operation: 'toggle', index: 1, expected: empty() })).ok, false);
  assert.deepEqual(bg.read(), before);
});

test('storage failures roll back contacts and clearing contacts preserves tags', async () => {
  const bg = background({ assyst_ticket_tags: { S1: 'REDMINE' }, assyst_contacts: { S1: old() } });
  await bg.send('get'); const before = bg.read(); bg.failWrite();
  assert.equal((await bg.send('contact', { ticket: 'S1', operation: 'toggle', index: 1, expected: old() })).ok, false);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('contact', { ticket: 'S1', operation: 'clear', expected: old() })).ok);
  assert.deepEqual(bg.read().assyst_contacts.S1, empty());
  assert.equal(bg.read().assyst_ticket_tags.S1, 'REDMINE');
});

test('independent contacts survive restart and JSON transfer to another computer', async () => {
  const first = background({ assyst_contacts: { S1: toggle(undefined, 2) } });
  await first.send('get'); const restarted = background(first.read());
  await restarted.send('export', { format: 'json' });
  const json = await restarted.downloads[0].blob.text();
  const second = background();
  assert.ok((await second.send('import', { backup: json, mode: 'replace' })).ok);
  assert.deepEqual(second.read().assyst_contacts.S1, first.read().assyst_contacts.S1);
  const before = second.read();
  assert.equal((await second.send('import', { backup: { formatVersion: 3, assyst_contacts: { S1: { attempts: ['2026-02-30'] } } }, mode: 'replace' })).ok, false);
  assert.deepEqual(second.read(), before);
});
