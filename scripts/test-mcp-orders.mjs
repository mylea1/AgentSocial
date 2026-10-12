import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
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
const anon = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
function check(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const devs = [],
  agents = [],
  listings = [];
const runDir = path.join(
  root,
  '.local/mcp/order-tests',
  `${Date.now()}-${crypto.randomUUID()}`
);
mkdirSync(runDir, { recursive: true });
const rpc = db.rpc.bind(db);
db.rpc = async (name, args) => {
  const at = new Date().toISOString();
  const result = await rpc(name, args);
  appendFileSync(
    path.join(runDir, 'rpc.jsonl'),
    JSON.stringify({ at, name, args, result }) + '\n'
  );
  return result;
};
try {
  for (let i = 0; i < 3; i++) {
    const dev = check(
      await db
        .from('developers')
        .insert({ kind: 'personal', display_name: 'Isolated MCP order test' })
        .select('id')
        .single()
    );
    devs.push(dev.id);
    const agent = check(
      await db
        .from('agents')
        .insert({
          name: 'mcp-order-test-' + crypto.randomUUID().slice(0, 24),
          developer_id: dev.id,
          status: 'active',
        })
        .select('id')
        .single()
    );
    agents.push(agent.id);
  }
  const payload = {
    listing_type: 'agent_service',
    title: 'Isolated sandbox inventory test',
    description: 'No real payment',
    category: 'test',
    tags: ['mcp-test'],
    price_amount: '9999999999999',
    price_currency: 'USD',
    inventory: 1,
    images: [],
    delivery_type: 'service',
  };
  const listing = check(
    await db
      .from('economy_listings')
      .insert({
        seller_agent_id: agents[1],
        seller_owner_id: devs[1],
        payload,
        state: 'published',
        visibility: 'public',
      })
      .select('*')
      .single()
  );
  listings.push(listing.id);
  const args = {
    p_buyer_agent: agents[0],
    p_buyer_owner: devs[0],
    p_user: null,
    p_key: 'isolated-order-request-1',
    p_listing: listing.id,
    p_version: 1,
    p_quantity: 1,
  };
  assert.equal(
    (await db.rpc('economy_sandbox_order_create', args)).error?.code,
    '42501'
  );
  check(
    await db
      .from('economy_sandbox_allowlist')
      .insert({
        agent_id: agents[0],
        developer_id: devs[0],
        purpose: 'sandbox_order_buyer',
      })
  );
  assert.equal(
    (await db.rpc('economy_sandbox_order_create', args)).error?.code,
    '42501'
  );
  check(
    await db
      .from('economy_sandbox_listings')
      .insert({
        listing_id: listing.id,
        seller_owner_id: devs[1],
        purpose: 'mcp_sandbox_fixture',
      })
  );
  check(
    await db.rpc('economy_sandbox_wallet_recharge', {
      p_agent: agents[0],
      p_owner: devs[0],
      p_amount_minor: '9999999999999',
      p_idempotency_key: 'isolated-stock-funding-1',
    })
  );
  const results = await Promise.all([
    db.rpc('economy_sandbox_order_create', args),
    db.rpc('economy_sandbox_order_create', {
      ...args,
      p_key: 'isolated-order-request-2',
    }),
  ]);
  assert.equal(
    results.filter((r) => !r.error).length,
    1,
    'Only one transaction can consume stock'
  );
  assert.equal(results.find((r) => r.error).error.code, '40001');
  const index = results.findIndex((r) => !r.error);
  const order = results[index].data;
  const used = {
    ...args,
    p_key: index === 0 ? args.p_key : 'isolated-order-request-2',
  };
  assert.equal(order.unit_price_minor, '9999999999999');
  assert.equal(order.total_price_minor, '9999999999999');
  assert.equal(
    check(await db.rpc('economy_sandbox_order_create', used)).id,
    order.id
  );
  assert.equal(
    (await db.rpc('economy_sandbox_order_create', { ...used, p_quantity: 2 }))
      .error?.code,
    '40001'
  );
  const outsider = check(
    await db.rpc('economy_sandbox_orders_for_agent', {
      p_agent: agents[2],
      p_owner: devs[2],
      p_limit: 20,
      p_offset: 0,
    })
  );
  assert.deepEqual(outsider, []);
  assert.equal(
    (
      await db.rpc('economy_sandbox_orders_for_agent', {
        p_agent: agents[0],
        p_owner: devs[2],
        p_limit: 20,
        p_offset: 0,
      })
    ).error?.code,
    '42501'
  );
  const raw = await anon.from('economy_sandbox_orders').select('*');
  assert.ok(raw.error || raw.data.length === 0);
  const direct = await anon.rpc('economy_sandbox_order_create', used);
  assert.ok(direct.error);
  assert.equal(
    check(
      await db
        .from('economy_listings')
        .select('payload')
        .eq('id', listing.id)
        .single()
    ).payload.inventory,
    0
  );
  console.log(
    'PASS: sandbox buyer/listing allowlists, concurrent stock consumption, exact money, idempotency, cross-owner and anonymous/RPC isolation.'
  );
} finally {
  writeFileSync(
    path.join(runDir, 'fixtures.json'),
    JSON.stringify({ retained: true, devs, agents, listings }, null, 2)
  );
  console.log('All fixtures and RPC evidence retained at ' + runDir);
}
