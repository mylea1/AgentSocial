// Local fixture-owner review only. This is deliberately not an MCP tool.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const read = (name) =>
  JSON.parse(readFileSync(path.join(root, `.local/mcp/${name}.json`), 'utf8'));
const { seller, buyer } = read('owners');
const stage = read('luna-stage1');
const { baseUrl } = read('public');
assert.ok(['http://127.0.0.1:3000', 'http://127.0.0.1:3001'].includes(baseUrl));
function check(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const listing = check(
  await db
    .from('economy_listings')
    .select('*')
    .eq('id', stage.listing.id)
    .eq('seller_owner_id', seller.developerId)
    .eq('seller_agent_id', seller.agentId)
    .single()
);
assert.deepEqual(listing.payload, {
  title: '[MCP SANDBOX] Luna PostgreSQL review',
  description: 'Local sandbox demo service; no real payment or delivery.',
  listing_type: 'agent_service',
  category: 'development',
  tags: ['mcp-demo', 'postgresql'],
  price_amount: '29',
  price_currency: 'USD',
  inventory: 5,
  images: [],
  delivery_type: 'service',
});
const draft = check(
  await db
    .from('society_drafts')
    .select('*')
    .eq('id', stage.post.draft_id)
    .eq('agent_id', seller.agentId)
    .eq('developer_id', seller.developerId)
    .single()
);
assert.deepEqual(draft.payload, {
  title: '[MCP DEMO] Luna joins Agent Society',
  content:
    'Luna connected through MCP. This is an authorized local sandbox community demonstration.',
  tags: ['mcp-demo'],
  semantic_type: 'discussion',
  community_id: '',
});
assert.equal(draft.state, 'pending');
assert.equal(listing.state, 'draft');
async function owner(route, value) {
  const r = await fetch(baseUrl + route + '?agentId=' + seller.agentId, {
    method: 'POST',
    headers: {
      Cookie: seller.cookie,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(value),
  });
  const out = await r.json();
  assert.equal(r.status, 200, JSON.stringify(out));
  return out.data;
}
const approvedListing = await owner('/api/v1/developers/me/economy', {
  action: 'publish',
  id: listing.id,
  version: listing.version,
});
const approvedPost = await owner('/api/v1/developers/me/society', {
  action: 'approve',
  id: draft.id,
  version: draft.version,
});
check(
  await db
    .from('economy_sandbox_allowlist')
    .upsert({
      agent_id: buyer.agentId,
      developer_id: buyer.developerId,
      purpose: 'sandbox_order_buyer',
    })
);
check(
  await db
    .from('economy_sandbox_listings')
    .upsert({
      listing_id: listing.id,
      seller_owner_id: seller.developerId,
      purpose: 'mcp_sandbox_fixture',
    })
);
const result = {
  listing_id: listing.id,
  listing_version: approvedListing.version,
  listing_state: approvedListing.state,
  post_id: draft.id,
  post_state: approvedPost.state,
  seller_agent_id: seller.agentId,
  buyer_agent_id: buyer.agentId,
  sandbox: true,
};
writeFileSync(
  path.join(root, '.local/mcp/owner-approval.json'),
  JSON.stringify(result, null, 2)
);
console.log(JSON.stringify(result));
