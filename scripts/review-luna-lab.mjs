// Local fixture-owner review. Not exposed to MCP or ordinary Agents.
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.local/mcp/multi-luna');
mkdirSync(dir, { recursive: true });
const env = parseEnv(
  readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8').replace(
    /^\uFEFF/,
    ''
  )
);
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const owners = JSON.parse(
  readFileSync(path.join(root, '.local/mcp/owners.json'), 'utf8')
);
const { baseUrl } = JSON.parse(
  readFileSync(path.join(root, '.local/mcp/public.json'), 'utf8')
);
assert.equal(baseUrl, 'http://127.0.0.1:3000');
function check(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
function record(value) {
  appendFileSync(
    path.join(dir, 'owner-actions.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n'
  );
}
const mode = process.argv[2] || 'snapshot';
if (mode === 'snapshot') {
  const records = [];
  for (const role of ['seller', 'buyer']) {
    const who = owners[role];
    for (const [table, agentColumn, ownerColumn] of [
      ['society_drafts', 'agent_id', 'developer_id'],
      ['economy_listings', 'seller_agent_id', 'seller_owner_id'],
    ]) {
      const rows = check(
        await db
          .from(table)
          .select('*')
          .eq(agentColumn, who.agentId)
          .eq(ownerColumn, who.developerId)
      );
      for (const row of rows)
        if (
          row.payload?.title?.startsWith('[LUNA LAB]') ||
          row.id === 'a43056c3-74e9-489a-a39e-d582e085d964'
        )
          records.push({ role, table, row });
    }
  }
  const file = path.join(dir, `review-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(records, null, 2));
  console.log(file);
  console.log(JSON.stringify(records, null, 2));
} else if (mode === 'approve') {
  const file = path.resolve(process.argv[3]);
  assert.equal(path.dirname(file), dir);
  const records = JSON.parse(readFileSync(file, 'utf8'));
  for (const { role, table, row } of records) {
    assert.ok(['seller', 'buyer'].includes(role));
    assert.ok(['society_drafts', 'economy_listings'].includes(table));
    const who = owners[role];
    const listing = table === 'economy_listings';
    assert.equal(row[listing ? 'seller_agent_id' : 'agent_id'], who.agentId);
    assert.equal(
      row[listing ? 'seller_owner_id' : 'developer_id'],
      who.developerId
    );
    assert.ok(
      row.payload.title.startsWith('[LUNA LAB]') ||
        row.id === 'a43056c3-74e9-489a-a39e-d582e085d964'
    );
    const current = check(
      await db.from(table).select('*').eq('id', row.id).single()
    );
    assert.deepEqual(current, row, 'Reviewed version changed');
    if (current.state === 'published') continue;
    assert.equal(row.state, listing ? 'draft' : 'pending');
    if (listing) {
      assert.equal(role, 'seller');
      assert.equal(row.payload.price_amount, '500');
      assert.equal(row.payload.inventory, 3);
    }
    const route = '/api/v1/developers/me/' + (listing ? 'economy' : 'society');
    const value = {
      action: listing ? 'publish' : 'approve',
      id: row.id,
      version: row.version,
    };
    record({
      phase: 'request',
      role,
      route,
      value,
      review_file: path.basename(file),
      payload: row.payload,
    });
    const response = await fetch(baseUrl + route + '?agentId=' + who.agentId, {
      method: 'POST',
      headers: {
        Cookie: who.cookie,
        Origin: baseUrl,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(value),
    });
    const result = await response.json();
    record({ phase: 'response', role, status: response.status, result });
    assert.equal(response.status, 200, JSON.stringify(result));
    if (listing) {
      check(
        await db.from('economy_sandbox_listings').upsert({
          listing_id: row.id,
          seller_owner_id: who.developerId,
          purpose: 'mcp_sandbox_fixture',
        })
      );
      record({ phase: 'sandbox_listing_authorized', listing_id: row.id });
    }
  }
  console.log('Reviewed exact versions approved; full evidence retained.');
} else if (mode === 'fund') {
  const who = owners.buyer;
  const args = {
    p_agent: who.agentId,
    p_owner: who.developerId,
    p_amount_minor: '1000',
    p_idempotency_key: 'multi-luna-lab-initial-funds-20261012',
  };
  record({ phase: 'virtual_funding_request', args });
  const response = await db.rpc('economy_sandbox_wallet_recharge', args);
  record({ phase: 'virtual_funding_response', response });
  console.log(JSON.stringify(check(response)));
} else throw new Error('Unknown mode');
