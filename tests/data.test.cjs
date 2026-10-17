const test = require('node:test');
const assert = require('node:assert/strict');
const { dataAPI, clone } = require('./harness.cjs');
const data = dataAPI();
const tag = { id: 'VIP', label: 'Ação urgente', bg: '#2563EB' };

test('JSON roundtrip transfers all assignments, including alphanumeric ticket references', () => {
  const state = data.normalize({ assyst_tags: [tag], assyst_ticket_tags: { '00123': 'VIP', S2471375: 'VIP', R2478223: 'VIP' } });
  const restored = data.parseBackup('\uFEFF' + data.backup(state));
  assert.deepEqual(clone(restored), clone(state));
});

test('version 3 unversioned backups and version 2 custom tags migrate', () => {
  const current = data.parseBackup({ assyst_tags: [tag], assyst_ticket_tags: { '123': 'VIP' } });
  assert.equal(current.assyst_tags[0].label, 'Ação urgente');
  const legacy = data.parseBackup({ assyst_custom_tags: [{ key: 'VIP', label: 'VIP antigo', bg: '#abc', color: '#fff' }],
    assyst_ticket_tags: { R12: 'VIP', '13': 'ATENDIMENTO' } });
  assert.equal(legacy.assyst_tags.length, 5);
  assert.equal(legacy.assyst_tags.find(item => item.id === 'VIP').bg, '#AABBCC');
  assert.equal(legacy.assyst_ticket_tags.R12, 'VIP');
});

test('an intentionally empty tag list stays empty; unknown assigned tags are recovered', () => {
  assert.equal(data.normalize({ assyst_tags: [] }).assyst_tags.length, 0);
  const state = data.parseBackup({ assyst_tags: [], assyst_ticket_tags: { S12: 'OLD', '13': 'NONE' } });
  assert.equal(state.assyst_tags[0].id, 'OLD');
  assert.equal(state.assyst_ticket_tags['13'], undefined);
});

test('malformed backups, invalid colors and duplicate or reserved IDs are rejected', () => {
  for (const value of [null, [], {}, { unrelated: true }, { formatVersion: 9, assyst_tags: [] },
    { assyst_tags: 'bad' }, { assyst_tags: [tag, tag] }, { assyst_ticket_tags: [] },
    { assyst_tags: [{ ...tag, bg: 'url(https://example.com)' }] },
    { assyst_tags: [{ ...tag, id: '__proto__' }] }, { assyst_ticket_tags: { '1': { id: 'VIP' } } }]) {
    assert.throws(() => data.parseBackup(value));
  }
  assert.throws(() => data.parseBackup('{broken json'));
});

test('merge preserves local data and incoming values win conflicts', () => {
  const local = data.normalize({ assyst_tags: [tag], assyst_ticket_tags: { '1': 'VIP', '2': 'VIP' } });
  const incoming = data.normalize({ assyst_tags: [{ ...tag, label: 'Novo nome' }, { id: 'B', label: 'B', bg: '#fff' }],
    assyst_ticket_tags: { '2': 'B', '3': 'VIP' } });
  const merged = data.merge(local, incoming);
  assert.deepEqual(clone(merged.assyst_ticket_tags), { '1': 'VIP', '2': 'B', '3': 'VIP' });
  assert.equal(merged.assyst_tags.find(item => item.id === 'VIP').label, 'Novo nome');
});

test('CSV uses BOM, semicolon, quoted cells and CRLF; formulas are neutralized', () => {
  const state = data.normalize({ assyst_tags: [{ ...tag, label: '=HYPERLINK("x");ação' }],
    assyst_ticket_tags: { S12: 'VIP', '=1+1': 'VIP' } });
  const csv = data.csv(state);
  assert.ok(csv.startsWith('\uFEFF"Chamado";"Tag";"Tentativas";'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""x"");ação"'));
  assert.ok(csv.includes('"S12";'));
});

test('contrast and HEX normalization work for dark, light and shorthand colors', () => {
  assert.equal(data.hex('abc'), '#AABBCC');
  assert.equal(data.textColor('#000000'), '#FFFFFF');
  assert.equal(data.textColor('#FFFFFF'), '#111827');
});

test('names created by the unlimited version 3.0 inline modal survive migration and JSON transfer', () => {
  const label = 'Nome criado na versão anterior '.repeat(6).trim();
  const state = data.normalize({ assyst_tags: [{ ...tag, label }], assyst_ticket_tags: { S12: 'VIP' } });
  assert.equal(state.assyst_tags[0].label, label);
  assert.equal(data.parseBackup(data.backup(state)).assyst_tags[0].label, label);
  assert.equal(state.assyst_ticket_tags.S12, 'VIP');
  assert.throws(() => data.tag({ ...tag, label }));
});

test('queue CSV omits old assignments, includes untagged tickets, deduplicates and orders by tag then number', () => {
  const state = data.normalize({ assyst_tags: [tag, { id: 'B', label: 'Bloqueado', bg: '#fff' }],
    assyst_ticket_tags: { OLD: 'VIP', S10: 'VIP', S2: 'VIP', R1: 'B' } });
  const csv = data.csv(state, ['R1', 'S10', 'S2', 'N1', 'S2']);
  assert.equal(csv.includes('OLD'), false);
  assert.ok(csv.includes('"N1";"Sem tag"'));
  assert.ok(csv.indexOf('"S2"') < csv.indexOf('"S10"'));
  assert.ok(csv.indexOf('"S10"') < csv.indexOf('"R1"'));
  assert.equal(csv.split('\r\n').length, 6);
  assert.equal(data.csv(state, []).split('\r\n').length, 2);
  assert.ok(data.csv(state, []).includes('"Contato 4"'));
});
