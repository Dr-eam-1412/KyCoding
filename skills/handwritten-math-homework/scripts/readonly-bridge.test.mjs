import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadOnlyBridge, connectorOrigin } from './readonly-bridge.mjs';

test('public key yields the snapshot extension identity', async () => {
  assert.equal(await connectorOrigin(), 'chrome-extension://dccpmjhibofgeilhjfmmhpgkfebkpkpb');
});

test('read-only protocol checks Origin/token, correlates result, and rejects writes', async t => {
  const bridge = await createReadOnlyBridge({ port: 0, timeoutMs: 2000 });
  t.after(() => bridge.close());
  const base = 'http://127.0.0.1:' + bridge.port;
  const origin = { Origin: bridge.origin };
  assert.equal((await fetch(base + '/session', { method: 'POST' })).status, 403);
  assert.equal((await fetch(base + '/session', { method: 'POST', headers: { Origin: 'https://example.invalid' } })).status, 403);
  const session = await fetch(base + '/session', { method: 'POST', headers: origin });
  assert.equal(session.status, 200);
  const { token } = await session.json();
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal((await fetch(base + '/command', { headers: origin })).status, 403);
  const headers = { ...origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  for (const command of ['upload_files', 'submit_assignment', 'confirm_submission', 'confirm_pending_submission']) {
    await assert.rejects(bridge.execute(command), /Read-only/);
  }
  const pending = bridge.execute('catalog', { course: 'fixture course' });
  await assert.rejects(bridge.execute('capture_question'), /busy/);
  const command = await (await fetch(base + '/command', { headers })).json();
  assert.equal(command.command, 'catalog');
  assert.deepEqual(command.args, { course: 'fixture course' });
  const wrong = await fetch(base + '/result', {
    method: 'POST', headers, body: JSON.stringify({ id: 'wrong-id', result: [] })
  });
  assert.equal(wrong.status, 409);
  const value = [{ id: 'fixture course::fixture task' }];
  const accepted = await fetch(base + '/result', {
    method: 'POST', headers, body: JSON.stringify({ id: command.id, result: value })
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await pending, value);
  assert.deepEqual(await (await fetch(base + '/command', { headers })).json(), {});
});

test('timeout clears pending command and permits another read', async t => {
  const bridge = await createReadOnlyBridge({ port: 0, timeoutMs: 30 });
  t.after(() => bridge.close());
  await assert.rejects(bridge.execute('catalog', {}), /timeout/);
  await assert.rejects(bridge.execute('inspect_upload', {}), /timeout/);
});

test('closing rejects a pending read', async () => {
  const bridge = await createReadOnlyBridge({ port: 0 });
  const pending = bridge.execute('catalog');
  const rejected = assert.rejects(pending, /closed/);
  await bridge.close();
  await rejected;
});

