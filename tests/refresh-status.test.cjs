const test = require('node:test');
const assert = require('node:assert/strict');
const { background } = require('./harness.cjs');

test('refresh status reads only the supported active tab and works through Chrome callbacks', async () => {
  for (const origin of ['http://cati.tj.ce.gov.br', 'https://cati.tjce.jus.br']) {
    for (const chrome of [false, true]) {
      let requests = 0;
      const bg = background({}, { chrome, tab: { id: 7, url: origin + '/assystnet/#homepage' },
        refreshStatus: (id, message) => {
          requests++;
          assert.equal(id, 7); assert.equal(message.type, 'assyst-refresh');
          return { reason: 'waiting', message: 'Ativa: aguardando o intervalo de 60 segundos.' };
        } });
      const result = await bg.send('refreshStatus');
      assert.ok(result.ok); assert.equal(result.status.reason, 'waiting');
      assert.equal(requests, 1);
      assert.deepEqual(bg.read(), {}, 'status does not initialize or rewrite storage');
    }
  }
});

test('transfer window status uses its original source tab rather than the active window', async () => {
  let source;
  const bg = background({}, { tab: { id: 1, url: 'moz-extension://test/popup.html?transfer=1' },
    sourceTab: { id: 8, url: 'https://cati.tjce.jus.br/assystnet/#eventMonitor/4' },
    refreshStatus: id => { source = id; return { reason: 'editing', message: 'Pausada: campo em edição.' }; } });
  const result = await bg.send('refreshStatus', { sourceTabId: 8 });
  assert.ok(result.ok); assert.equal(source, 8); assert.equal(result.status.reason, 'editing');
});

test('wrong hosts, closed tabs and missing listeners get a useful status without attempting clicks or modifying marks', async () => {
  for (const options of [{ tab: { id: 7, url: 'https://example.com/' } },
    { sourceTabId: 99 }, { sourceTabId: -1 }, { sourceTabId: '7' },
    { refreshStatus: () => { throw new Error('No receiving end'); } }, { refreshStatus: {} }]) {
    const initial = { assyst_ticket_tags: { S1: 'A' } };
    const bg = background(initial, options);
    const result = await bg.send('refreshStatus', options.sourceTabId !== undefined ? { sourceTabId: options.sourceTabId } : {});
    assert.ok(result.ok); assert.equal(result.status.reason, 'unavailable');
    assert.match(result.status.message, /recarregue/);
    assert.deepEqual(bg.read(), initial);
    assert.equal(bg.downloads.length, 0);
  }
});
