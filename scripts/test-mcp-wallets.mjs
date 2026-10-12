import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = parseEnv(
  (await readFile(path.join(root, 'apps/web/.env.local'), 'utf8')).replace(
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
const fixture = {
  created_at: new Date().toISOString(),
  scope: 'local virtual funds only',
  retained: true,
  developers: [],
  agents: [],
  listings: [],
  orders: [],
  checks: {},
};
const rpcLog = path.join(
  root,
  '.local/mcp/multi-luna',
  `wallet-test-rpc-${Date.now()}.jsonl`
);
await mkdir(path.dirname(rpcLog), { recursive: true });
for (const [role, client] of [
  ['service', db],
  ['anonymous', anon],
]) {
  const invoke = client.rpc.bind(client);
  client.rpc = async (name, args) => {
    const at = new Date().toISOString();
    const result = await invoke(name, args);
    await appendFile(
      rpcLog,
      JSON.stringify({ at, role, name, args, result }) + '\n'
    );
    return result;
  };
}
try {
  for (const [name, owner] of [
    ['wallet buyer', true],
    ['wallet seller', true],
    ['transferred owner', true],
  ]) {
    const d = check(
      await db
        .from('developers')
        .insert({
          kind: 'personal',
          display_name: `MCP sandbox wallet ${name}`,
        })
        .select('id')
        .single()
    );
    fixture.developers.push(d.id);
    const a = check(
      await db
        .from('agents')
        .insert({
          name: `mcp-wallet-${crypto.randomUUID()}`,
          developer_id: d.id,
          status: 'active',
        })
        .select('id')
        .single()
    );
    fixture.agents.push(a.id);
  }
  const [buyer, seller, unused] = fixture.agents;
  const [buyerOwner, sellerOwner, newOwner] = fixture.developers;
  const saveEvidence = async () => {
    const evidenceDir = path.join(root, '.local/mcp');
    await mkdir(evidenceDir, { recursive: true });
    const evidencePath = path.join(
      evidenceDir,
      `sandbox-wallets-test-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID().slice(0, 8)}.json`
    );
    await writeFile(evidencePath, JSON.stringify(fixture, null, 2) + '\n');
  };
  const amount = '700';
  const rechargeArgs = {
    p_agent: buyer,
    p_owner: buyerOwner,
    p_amount_minor: '1000',
    p_idempotency_key: 'wallet-fixture-fund-1',
  };
  const funded = check(
    await db.rpc('economy_sandbox_wallet_recharge', rechargeArgs)
  );
  const replay = check(
    await db.rpc('economy_sandbox_wallet_recharge', rechargeArgs)
  );
  assert.equal(funded.balance_minor, '1000');
  assert.equal(replay.balance_minor, '1000');
  assert.equal(
    (
      await db.rpc('economy_sandbox_wallet_recharge', {
        ...rechargeArgs,
        p_amount_minor: '1001',
      })
    ).error?.code,
    '40001'
  );
  check(
    await db.rpc('economy_sandbox_wallet_recharge', {
      p_agent: seller,
      p_owner: sellerOwner,
      p_amount_minor: '1000',
      p_idempotency_key: 'wallet-fixture-seller-1',
    })
  );
  const payload = {
    listing_type: 'agent_service',
    title: 'Retained local wallet fixture',
    description: 'Virtual funds only',
    category: 'test',
    tags: ['wallet-fixture'],
    price_amount: amount,
    price_currency: 'USD',
    inventory: 2,
    images: [],
    delivery_type: 'service',
  };
  const listing = check(
    await db
      .from('economy_listings')
      .insert({
        seller_agent_id: seller,
        seller_owner_id: sellerOwner,
        payload,
        state: 'published',
        visibility: 'public',
      })
      .select('*')
      .single()
  );
  fixture.listings.push(listing.id);
  check(
    await db
      .from('economy_sandbox_allowlist')
      .insert({
        agent_id: buyer,
        developer_id: buyerOwner,
        purpose: 'sandbox_order_buyer',
      })
  );
  check(
    await db
      .from('economy_sandbox_listings')
      .insert({
        listing_id: listing.id,
        seller_owner_id: sellerOwner,
        purpose: 'mcp_sandbox_fixture',
      })
  );
  const args = {
    p_buyer_agent: buyer,
    p_buyer_owner: buyerOwner,
    p_user: null,
    p_key: 'wallet-order-fixture-1',
    p_listing: listing.id,
    p_version: 1,
    p_quantity: 1,
  };
  const order = check(await db.rpc('economy_sandbox_order_create', args));
  fixture.orders.push(order.id);
  assert.equal(order.total_price_minor, amount);
  const buyerAfter = check(
    await db.rpc('economy_sandbox_wallet_get', {
      p_agent: buyer,
      p_owner: buyerOwner,
    })
  );
  const sellerAfter = check(
    await db.rpc('economy_sandbox_wallet_get', {
      p_agent: seller,
      p_owner: sellerOwner,
    })
  );
  assert.equal(buyerAfter.balance_minor, '300');
  assert.equal(sellerAfter.balance_minor, '1700');
  const stockAfter = check(
    await db
      .from('economy_listings')
      .select('payload')
      .eq('id', listing.id)
      .single()
  ).payload.inventory;
  const insufficient = await db.rpc('economy_sandbox_order_create', {
    ...args,
    p_key: 'wallet-order-fixture-2',
    p_version: 2,
  });
  assert.equal(insufficient.error?.code, 'P0001');
  assert.equal(insufficient.error?.message, 'Insufficient virtual funds');
  assert.equal(
    check(
      await db
        .from('economy_listings')
        .select('payload')
        .eq('id', listing.id)
        .single()
    ).payload.inventory,
    stockAfter,
    'insufficient virtual funds must roll back inventory'
  );
  assert.equal(
    check(
      await db
        .from('economy_sandbox_wallet_ledger')
        .select('id')
        .eq('order_id', order.id)
    ).length,
    2
  );
  const sellerListing = check(
    await db
      .from('economy_listings')
      .insert({
        seller_agent_id: seller,
        seller_owner_id: sellerOwner,
        payload: {
          ...payload,
          title: 'Reciprocal seller listing',
          price_amount: '20',
          inventory: 1,
        },
        state: 'published',
        visibility: 'public',
      })
      .select('*')
      .single()
  );
  fixture.listings.push(sellerListing.id);
  const buyerListing = check(
    await db
      .from('economy_listings')
      .insert({
        seller_agent_id: buyer,
        seller_owner_id: buyerOwner,
        payload: {
          ...payload,
          title: 'Reciprocal buyer listing',
          price_amount: '30',
          inventory: 1,
        },
        state: 'published',
        visibility: 'public',
      })
      .select('*')
      .single()
  );
  fixture.listings.push(buyerListing.id);
  check(
    await db
      .from('economy_sandbox_allowlist')
      .insert({
        agent_id: seller,
        developer_id: sellerOwner,
        purpose: 'sandbox_order_buyer',
      })
  );
  check(
    await db
      .from('economy_sandbox_listings')
      .insert({
        listing_id: sellerListing.id,
        seller_owner_id: sellerOwner,
        purpose: 'mcp_sandbox_fixture',
      })
  );
  check(
    await db
      .from('economy_sandbox_listings')
      .insert({
        listing_id: buyerListing.id,
        seller_owner_id: buyerOwner,
        purpose: 'mcp_sandbox_fixture',
      })
  );
  const reciprocal = [
    db.rpc('economy_sandbox_order_create', {
      p_buyer_agent: buyer,
      p_buyer_owner: buyerOwner,
      p_user: null,
      p_key: 'wallet-reciprocal-buyer-1',
      p_listing: sellerListing.id,
      p_version: 1,
      p_quantity: 1,
    }),
    db.rpc('economy_sandbox_order_create', {
      p_buyer_agent: seller,
      p_buyer_owner: sellerOwner,
      p_user: null,
      p_key: 'wallet-reciprocal-seller-1',
      p_listing: buyerListing.id,
      p_version: 1,
      p_quantity: 1,
    }),
  ];
  const reciprocalResults = await Promise.all(reciprocal);
  assert.ok(
    reciprocalResults.every((r) => !r.error),
    JSON.stringify(reciprocalResults.map((r) => r.error?.message))
  );
  fixture.orders.push(...reciprocalResults.map((r) => r.data.id));
  const anonymousRead = await anon.rpc('economy_sandbox_wallet_get', {
    p_agent: buyer,
    p_owner: buyerOwner,
  });
  assert.ok(anonymousRead.error);
  const anonymousRecharge = await anon.rpc(
    'economy_sandbox_wallet_recharge',
    rechargeArgs
  );
  assert.ok(anonymousRecharge.error);
  const directWrite = await db
    .from('economy_sandbox_wallets')
    .update({ balance_minor: 9999 })
    .eq('agent_id', buyer);
  assert.ok(directWrite.error, 'Service must not rewrite balances directly');
  await appendFile(
    rpcLog,
    JSON.stringify({
      at: new Date().toISOString(),
      role: 'service',
      operation: 'direct_wallet_update_rejected',
      error: directWrite.error,
    }) + '\n'
  );
  check(
    await db.from('agents').update({ developer_id: newOwner }).eq('id', buyer)
  );
  const transferred = check(
    await db.rpc('economy_sandbox_wallet_get', {
      p_agent: buyer,
      p_owner: newOwner,
    })
  );
  assert.equal(transferred.balance_minor, '0');
  assert.equal(
    (
      await db.rpc('economy_sandbox_wallet_get', {
        p_agent: buyer,
        p_owner: buyerOwner,
      })
    ).error?.code,
    '42501'
  );
  fixture.checks = {
    recharge_idempotent: true,
    recharge_key_amount_conflict: true,
    order_debit_credit_atomic: true,
    insufficient_funds_preserves_inventory: true,
    order_has_two_ledger_entries: true,
    reciprocal_concurrent_settlement_succeeded: true,
    anonymous_access_denied: true,
    transfer_starts_zero: true,
    former_owner_denied: true,
    unused_agent: unused,
  };
  await saveEvidence();
  console.log(
    'PASS: virtual recharge, order settlement, insufficient-funds stock rollback, RLS/RPC isolation, owner-transfer zero balance. Fixture and JSON evidence retained in .local/mcp.'
  );
} catch (e) {
  fixture.error = String(e?.message ?? e);
  const evidenceDir = path.join(root, '.local/mcp');
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = path.join(
    evidenceDir,
    `sandbox-wallets-test-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID().slice(0, 8)}.json`
  );
  await writeFile(evidencePath, JSON.stringify(fixture, null, 2) + '\n');
  throw e;
}
