const test = require('node:test');
const assert = require('node:assert/strict');
const { dataAPI, background, clone } = require('./harness.cjs');
const data = dataAPI();
const empty = () => ({ attempts: [], respondedOn: null });
const complete = () => ({ attempts: ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'], respondedOn: null });

test('contacts follow days 1, 3, 5, 7; closure review starts on day 8 only', () => {
  let value = empty();
  for (const date of complete().attempts) value = data.changeContact(value, 'add', date);
  assert.deepEqual(clone(value), complete());
  assert.equal(data.contactInfo(value, '2026-10-07').ready, false);
  const info = data.contactInfo(value, '2026-10-08');
  assert.equal(info.ready, true);
  assert.equal(info.readyOn, '2026-10-08');
  assert.equal(info.canAdd, false);
});

test('four same-day attempts are allowed, a fifth is rejected and closure still waits seven days', () => {
  let value = empty();
  for (let i = 0; i < 4; i++) value = data.changeContact(value, 'add', '2026-10-01');
  assert.deepEqual(clone(value.attempts), Array(4).fill('2026-10-01'));
  assert.throws(() => data.changeContact(value, 'add', '2026-10-01'));
  assert.equal(data.contactInfo(value, '2026-10-07').ready, false);
  assert.equal(data.contactInfo(value, '2026-10-08').ready, true);
  assert.equal(data.contactInfo(value, '2026-10-08').readyOn, '2026-10-08');
  assert.equal(data.contactInfo(value, '2026-10-08').canAdd, false);
});

test('consecutive days are allowed, but the clock cannot create out-of-order history', () => {
  const first = data.changeContact(empty(), 'add', '2026-10-01');
  const second = data.changeContact(first, 'add', '2026-10-02');
  assert.equal(data.contactInfo(second, '2026-10-02').canAdd, true);
  assert.throws(() => data.changeContact(second, 'add', '2026-10-01'));
  assert.equal(data.contactInfo(second, '2026-10-01').canAdd, false);
  assert.deepEqual(clone(first.attempts), ['2026-10-01']);
});

test('closure cannot be reviewed on the fourth contact day, including late contacts', () => {
  const late = { attempts: ['2026-10-01', '2026-10-04', '2026-10-06', '2026-10-10'], respondedOn: null };
  assert.equal(data.contactInfo(late, '2026-10-10').ready, false);
  assert.equal(data.contactInfo(late, '2026-10-11').ready, true);
  assert.equal(data.contactInfo({ ...late, attempts: late.attempts.slice(0, 2) }, '2026-10-04').canAdd, true);
  assert.equal(data.contactInfo({ ...late, attempts: late.attempts.slice(0, 2) }, '2026-10-20').ready, false);
});

test('response stops contact counting and closure review without erasing history', () => {
  const value = data.changeContact(complete(), 'respond', '2026-10-08');
  assert.equal(data.contactInfo(value, '2026-10-20').ready, false);
  assert.equal(data.contactInfo(value, '2026-10-20').status, 'Usuário respondeu');
  assert.throws(() => data.changeContact(value, 'add', '2026-10-20'));
  assert.throws(() => data.changeContact(value, 'undo', '2026-10-20'));
  assert.equal(data.contactInfo(data.changeContact(value, 'resume', '2026-10-20'), '2026-10-20').ready, true);
  assert.equal(value.attempts.length, 4);
});

test('date math respects calendar dates across month, year and leap-day boundaries', () => {
  assert.equal(data.addDays('2026-12-31', 2), '2027-01-02');
  assert.equal(data.addDays('2028-02-28', 2), '2028-03-01');
  assert.equal(data.today(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'invalid']) assert.throws(() => data.day(date));
});

test('malformed contact backups are rejected without silently discarding dates', () => {
  for (const value of [null, [], { attempts: 'bad' }, { attempts: ['2026-02-30'] },
    { attempts: ['2026-10-03', '2026-10-01'] }, { attempts: [...complete().attempts, '2026-10-09'] },
    { attempts: ['2026-10-01'], respondedOn: '2026-09-30' }, { attempts: [], respondedOn: '2026-10-01' }]) {
    assert.throws(() => data.parseBackup({ formatVersion: 2, assyst_contacts: { S1: value } }));
  }
});

test('new backups roundtrip contact-only tickets; old backups merge without erasing existing contacts', () => {
  const current = data.normalize({ assyst_ticket_tags: { S1: 'REDMINE' }, assyst_contacts: { S2: complete() } });
  const json = data.backup(current);
  assert.equal(JSON.parse(json).formatVersion, 2);
  assert.deepEqual(clone(data.parseBackup(json)), clone(current));
  const old = data.parseBackup({ formatVersion: 1, assyst_ticket_tags: { S3: 'ATENDIMENTO' } });
  assert.deepEqual(clone(data.merge(current, old).assyst_contacts), { S2: complete() });
  const cleared = data.parseBackup({ formatVersion: 2, assyst_contacts: { S2: empty() } });
  assert.deepEqual(clone(data.merge(current, cleared).assyst_contacts.S2), empty());
});

test('CSV includes contact-only queue tickets and dates, omits historical contacts, and keeps one row per ticket', () => {
  const state = data.normalize({ assyst_contacts: { S1: complete(), OLD: complete() } });
  const csv = data.csv(state, ['S1', 'S1', 'S2']);
  assert.equal(csv.includes('OLD'), false);
  assert.ok(csv.includes('"S1";"Sem tag";"4/4";"01/10/2026";"03/10/2026";"05/10/2026";"07/10/2026"'));
  assert.ok(csv.includes('"S2";"Sem tag";"0/4"'));
  assert.equal(csv.split('\r\n').length, 4);
});

test('3.2.0 migration preserves existing marks and its original backup across restarts', async () => {
  const previous = { assyst_schema_version: 1, assyst_tags: [{ id: 'A', label: 'A', bg: '#abc' }],
    assyst_ticket_tags: { S1: 'A' }, assyst_revision: 5, assyst_has_upgrade_backup: true,
    assyst_upgrade_backup: { formatVersion: 1, assyst_ticket_tags: { OLD: 'REDMINE' } } };
  let bg = background(previous);
  assert.ok((await bg.send('get')).ok);
  assert.equal(bg.read().assyst_schema_version, 2);
  assert.deepEqual(bg.read().assyst_ticket_tags, previous.assyst_ticket_tags);
  assert.deepEqual(bg.read().assyst_upgrade_backup, previous.assyst_upgrade_backup);
  for (let i = 0; i < 3; i++) { bg = background(bg.read()); assert.ok((await bg.send('get')).ok); }
  assert.deepEqual(bg.read().assyst_upgrade_backup, previous.assyst_upgrade_backup);
});

test('background dates contacts itself, serializes duplicate clicks and rejects stale updates', async () => {
  const options = { now: '2026-10-01T12:00:00Z' };
  const bg = background({}, options);
  const results = await Promise.all([1, 2].map(() => bg.send('contact', { ticket: 'S1', operation: 'add', expected: empty(), date: '2020-01-01' })));
  assert.equal(results.filter(value => value.ok).length, 1);
  assert.deepEqual(bg.read().assyst_contacts.S1.attempts, ['2026-10-01']);
  assert.ok((await bg.send('contact', { ticket: 'S1', operation: 'add', expected: bg.read().assyst_contacts.S1 })).ok);
  assert.deepEqual(bg.read().assyst_contacts.S1.attempts, ['2026-10-01', '2026-10-01']);
  const before = bg.read();
  assert.equal((await bg.send('contact', { ticket: 'S1', operation: 'clear', expected: empty() })).ok, false);
  assert.deepEqual(bg.read(), before);
});

test('contact undo, response and clearing preserve tags; storage failures roll back completely', async () => {
  const options = { now: '2026-10-10T12:00:00Z' };
  const bg = background({ assyst_ticket_tags: { S1: 'REDMINE' }, assyst_contacts: { S1: complete() } }, options);
  await bg.send('get');
  const before = bg.read(); bg.failWrite();
  assert.equal((await bg.send('contact', { ticket: 'S1', operation: 'respond', expected: complete() })).ok, false);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('contact', { ticket: 'S1', operation: 'undo', expected: complete() })).ok);
  assert.equal(bg.read().assyst_contacts.S1.attempts.length, 3);
  assert.ok((await bg.send('contact', { ticket: 'S1', operation: 'respond', expected: bg.read().assyst_contacts.S1 })).ok);
  assert.equal(bg.read().assyst_contacts.S1.respondedOn, '2026-10-10');
  assert.ok((await bg.send('contact', { ticket: 'S1', operation: 'clear', expected: bg.read().assyst_contacts.S1 })).ok);
  assert.deepEqual(bg.read().assyst_contacts.S1, empty());
  assert.equal(bg.read().assyst_ticket_tags.S1, 'REDMINE');
});

test('contacts survive browser restart and JSON transfer to a second computer', async () => {
  const first = background({ assyst_contacts: { S1: complete() } });
  await first.send('get');
  const restarted = background(first.read());
  await restarted.send('export', { format: 'json' });
  const json = await restarted.downloads[0].blob.text();
  const second = background();
  assert.ok((await second.send('import', { backup: json, mode: 'replace' })).ok);
  assert.deepEqual(second.read().assyst_contacts.S1, complete());
  const before = second.read();
  assert.equal((await second.send('import', { backup: { formatVersion: 2, assyst_contacts: { S1: { attempts: ['2026-02-30'] } } }, mode: 'replace' })).ok, false);
  assert.deepEqual(second.read(), before);
});

test('same-day history survives restart, merge, JSON transfer and queue CSV without losing older marks', async () => {
  const options = { now: '2026-10-01T12:00:00Z' };
  const previous = { assyst_schema_version: 2, assyst_ticket_tags: { S1: 'REDMINE', OLD: 'ATENDIMENTO' },
    assyst_contacts: { OLD: complete() } };
  const first = background(previous, options);
  for (let i = 0; i < 4; i++) {
    const expected = first.read().assyst_contacts?.S1 || empty();
    assert.ok((await first.send('contact', { ticket: 'S1', operation: 'add', expected })).ok);
  }
  const restarted = background(first.read(), options);
  await restarted.send('get');
  assert.deepEqual(restarted.read().assyst_ticket_tags, previous.assyst_ticket_tags);
  assert.deepEqual(restarted.read().assyst_contacts.OLD, previous.assyst_contacts.OLD);
  assert.deepEqual(restarted.read().assyst_contacts.S1.attempts, Array(4).fill('2026-10-01'));
  await restarted.send('export', { format: 'json' });
  const json = await restarted.downloads[0].blob.text();
  const second = background({ assyst_ticket_tags: { LOCAL: 'REDMINE' } }, options);
  assert.ok((await second.send('import', { backup: json, mode: 'merge' })).ok);
  assert.deepEqual(second.read().assyst_contacts.S1, restarted.read().assyst_contacts.S1);
  assert.equal(second.read().assyst_ticket_tags.LOCAL, 'REDMINE');
  const csv = data.csv(data.normalize(second.read()), ['S1']);
  assert.ok(csv.includes('"4/4";"01/10/2026";"01/10/2026";"01/10/2026";"01/10/2026"'));
  assert.equal(csv.includes('"OLD"'), false);
  assert.equal(csv.includes('"LOCAL"'), false);
});

test('report from transfer window uses its captured AssystNet tab and rejects a closed or wrong source', async () => {
  const options = { tab: { id: 9, url: 'moz-extension://test/popup.html' },
    sourceTab: { id: 7, url: 'https://cati.tjce.jus.br/assystnet/#eventMonitor/4' },
    capture: { ok: true, complete: true, total: 1, tickets: ['S1'] } };
  const bg = background({ assyst_contacts: { S1: complete() } }, options);
  assert.ok((await bg.send('export', { format: 'csv', sourceTabId: 7 })).ok);
  assert.ok((await bg.downloads[0].blob.text()).includes('"S1";"Sem tag";"4/4"'));
  for (const id of [8, 9, -1, '7']) assert.equal((await bg.send('export', { format: 'csv', sourceTabId: id })).ok, false);
  assert.equal(bg.downloads.length, 1);
});
