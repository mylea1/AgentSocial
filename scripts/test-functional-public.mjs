import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.local/functional-tests', 'public-' + Date.now());
await mkdir(dir, { recursive: true });
const checks = [];
async function test(name, route, options, verify) {
  try {
    const response = await fetch('http://127.0.0.1:3000' + route, {
      redirect: 'manual',
      ...options,
    });
    const raw = await response.text();
    const record = {
      name,
      route,
      status: response.status,
      location: response.headers.get('location'),
      bodyHash: createHash('sha256').update(raw).digest('hex'),
      bodyPreview: raw.slice(0, 1500),
    };
    await appendFile(
      path.join(dir, 'requests.jsonl'),
      JSON.stringify(record) + '\n'
    );
    await verify(response, raw);
    checks.push({ name, status: 'passed' });
  } catch (error) {
    checks.push({ name, status: 'failed', error: String(error) });
  }
}
for (const route of ['/society', '/inference', '/marketplace'])
  await test('public page ' + route, route, {}, (r) =>
    assert.equal(r.status, 200)
  );
for (const route of [
  '/api/v1/society/community',
  '/api/v1/society/search?q=python',
  '/api/v1/society/marketplace',
])
  await test('free discovery ' + route, route, {}, (r) =>
    assert.equal(r.status, 200)
  );
await test(
  'public service projection',
  '/api/v1/society/inference/services',
  {},
  (r, raw) => {
    assert.equal(r.status, 200);
    const result = JSON.parse(raw);
    assert.ok(result.success);
    assert.ok(Array.isArray(result.data));
    const allowed = [
      'agent_id',
      'name',
      'display_name',
      'version',
      'policy',
      'updated_at',
    ];
    for (const row of result.data)
      for (const key of Object.keys(row))
        assert.ok(allowed.includes(key), 'unexpected public field ' + key);
  }
);
await test(
  'A2A advertised capabilities',
  '/.well-known/agent-card.json',
  {},
  (r, raw) => {
    assert.equal(r.status, 200);
    const card = JSON.parse(raw);
    assert.equal(card.supportedInterfaces[0].protocolVersion, '1.0');
    assert.equal(card.capabilities.streaming, false);
    assert.equal(card.capabilities.pushNotifications, false);
  }
);
await test(
  'owner dashboard login redirect',
  '/dashboard/inference',
  {},
  (r) => {
    assert.ok([303, 307, 308].includes(r.status));
    assert.match(r.headers.get('location'), /auth\/login/);
  }
);
for (const route of [
  '/api/v1/society/inference',
  '/api/v1/developers/me/inference',
])
  await test('anonymous denied ' + route, route, {}, (r) =>
    assert.equal(r.status, 401)
  );
await test(
  'forged principal headers denied',
  '/api/v1/society/inference',
  {
    headers: {
      'x-agent-id': '11111111-1111-4111-8111-111111111111',
      'x-user-id': '22222222-2222-4222-8222-222222222222',
      'x-agent-permissions': '["read","write"]',
    },
  },
  (r) => assert.equal(r.status, 401)
);
await test(
  'unknown bearer denied',
  '/api/v1/society/inference',
  { headers: { Authorization: 'Bearer ag_not_a_real_key' } },
  (r) => assert.equal(r.status, 401)
);
await test(
  'anonymous A2A mutation denied',
  '/api/v1/society/a2a',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'SendMessage',
      params: {},
    }),
  },
  (r) => assert.equal(r.status, 401)
);
const result = {
  status: checks.every((x) => x.status === 'passed') ? 'passed' : 'failed',
  checks,
  retained: true,
};
await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, evidence: dir }));
if (result.status !== 'passed') process.exitCode = 1;
