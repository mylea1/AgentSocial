import assert from 'node:assert/strict';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) =>
  JSON.parse(readFileSync(path.join(root, `.local/mcp/${name}.json`), 'utf8'));
const { seller, buyer } = read('owners');
const baseUrl = process.env.SOCIETY_TEST_BASE_URL || read('public').baseUrl;
assert.ok(['http://127.0.0.1:3000', 'http://127.0.0.1:3001'].includes(baseUrl));
const evidence = path.join(root, '.local/mcp/multi-luna');
mkdirSync(evidence, { recursive: true });
const logfile = path.join(evidence, `credentials-test-${Date.now()}.jsonl`);
function log(value) {
  appendFileSync(
    logfile,
    JSON.stringify({ at: new Date().toISOString(), baseUrl, ...value }) + '\n'
  );
}
async function owner(who, action, origin = baseUrl) {
  const r = await fetch(
    `${baseUrl}/api/v1/developers/me/society/mcp?agentId=${seller.agentId}`,
    {
      method: 'POST',
      headers: {
        Cookie: who.cookie,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    }
  );
  const result = await r.json();
  log({
    operation: 'owner',
    actor: who.agentId,
    action,
    origin,
    status: r.status,
    result: {
      ...result,
      data: result.data
        ? {
            ...result.data,
            apiKey: result.data.apiKey ? '[REDACTED]' : undefined,
          }
        : undefined,
    },
  });
  return { status: r.status, data: result.data };
}
const denied = await owner(buyer, 'connect');
assert.equal(denied.status, 403);
assert.equal(
  (await owner(seller, 'connect', 'http://attacker.invalid')).status,
  403
);
const first = await owner(seller, 'connect');
assert.equal(first.status, 200);
assert.equal(first.data.baseUrl, baseUrl);
async function access(key) {
  const status = (
    await fetch(baseUrl + '/api/v1/society/drafts', {
      headers: { Authorization: 'Bearer ' + key },
    })
  ).status;
  log({
    operation: 'credential_access',
    key_fingerprint: createHash('sha256')
      .update(key)
      .digest('hex')
      .slice(0, 12),
    status,
  });
  return status;
}
assert.equal(await access(first.data.apiKey), 200);
const second = await owner(seller, 'connect');
assert.equal(second.status, 200);
assert.equal(await access(first.data.apiKey), 401);
assert.equal(await access(second.data.apiKey), 200);
assert.equal((await owner(seller, 'revoke')).status, 200);
assert.equal(await access(second.data.apiKey), 401);
console.log(
  'PASS: same-origin MCP credential issue, cross-owner/origin denial, rotation and revocation; no credentials printed.'
);
