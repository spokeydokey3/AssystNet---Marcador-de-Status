const test = require('node:test');
const assert = require('node:assert/strict');
const { dataAPI, background, clone } = require('./harness.cjs');
const data = dataAPI();

test('auto-refresh defaults are off, one minute, foreground only; malformed saved preferences fail closed', () => {
  const defaults = { enabled: false, intervalSeconds: 60, background: false };
  assert.deepEqual(clone(data.refreshSettings()), defaults);
  for (const value of [null, [], { enabled: 'true', intervalSeconds: 30, background: false }]) {
    assert.deepEqual(clone(data.refreshSettings(value)), defaults);
  }
});

test('all supported intervals persist across restart without changing ticket data or backup format', async () => {
  let bg = background({ assyst_ticket_tags: { R1: 'REDMINE' } });
  for (const intervalSeconds of [30, 60, 120, 300]) {
    const settings = { enabled: true, intervalSeconds, background: true };
    assert.ok((await bg.send('setRefreshSettings', { settings })).ok);
    bg = background(bg.read());
    const result = await bg.send('get');
    assert.deepEqual(clone(result.state.assyst_refresh_settings), settings);
    assert.equal(bg.read().assyst_ticket_tags.R1, 'REDMINE');
  }
  await bg.send('export', { format: 'json' });
  const backup = JSON.parse(await bg.downloads.at(-1).blob.text());
  assert.equal(backup.formatVersion, 3);
  assert.equal(backup.assyst_refresh_settings, undefined);
});

test('invalid preference writes fail without poisoning the queue or losing marks', async () => {
  const bg = background({ assyst_ticket_tags: { R1: 'REDMINE' } }); await bg.send('get');
  const before = bg.read();
  for (const intervalSeconds of [-1, 0, 59, '60']) {
    assert.equal((await bg.send('setRefreshSettings', { settings: { enabled: true, intervalSeconds, background: false } })).ok, false);
    assert.deepEqual(bg.read(), before);
  }
  bg.failWrite();
  assert.equal((await bg.send('setRefreshSettings', { settings: { enabled: true, intervalSeconds: 30, background: false } })).ok, false);
  assert.deepEqual(bg.read(), before);
  assert.ok((await bg.send('assign', { ticket: 'S2', id: 'REDMINE' })).ok);
});

test('Chrome callback bridge accepts the same settings and returns their saved state', async () => {
  const bg = background({}, { chrome: true });
  const settings = { enabled: true, intervalSeconds: 120, background: false };
  const result = await bg.send('setRefreshSettings', { settings });
  assert.ok(result.ok); assert.deepEqual(clone(result.state.assyst_refresh_settings), settings);
});
