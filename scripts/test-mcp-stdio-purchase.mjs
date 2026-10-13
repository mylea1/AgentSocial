import assert from 'node:assert/strict';
import { readFile, mkdir, appendFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
const bcrypt = require('bcryptjs');
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const stamp = new Date().toISOString().replaceAll(':', '-');
const dir = path.join(
  root,
  '.local/functional-tests',
  `ledger-mcp-stdio-${stamp}`
);
await mkdir(dir, { recursive: true });
const evidence = {
  created_at: new Date().toISOString(),
  retained: true,
  scope: 'localhost MCP stdio, virtual TEST funds only',
  fixtures: {
    owner: null,
    agent: null,
    seller_owner: null,
    seller_agent: null,
    listing: null,
    order: null,
    api_key_prefix: null,
    credentials_file: 'buyer-credentials.private.json',
  },
  calls: [],
  status: 'running',
};
const check = (r) => {
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.data;
};
async function recordTool(name, args, result) {
  await appendFile(
    path.join(dir, 'mcp-calls.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), name, args, result }) + '\n'
  );
}
async function invoke(name, args) {
  const result = await client.callTool({ name, arguments: args });
  await recordTool(name, args, result);
  if (result.isError)
    throw new Error(
      `${name} failed: ${result.content?.[0]?.text ?? 'tool error'}`
    );
  const raw = result.content?.find((x) => x.type === 'text')?.text;
  return raw ? JSON.parse(raw) : null;
}
let client, transport;
try {
  const email = `mcp-stdio-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const user = check(
    await db.auth.admin.createUser({ email, password, email_confirm: true })
  ).user;
  const owner = check(
    await db
      .from('developers')
      .insert({
        kind: 'personal',
        display_name: `MCP buyer ${stamp.slice(-8)}`,
      })
      .select('id')
      .single()
  );
  check(
    await db
      .from('developer_members')
      .insert({ developer_id: owner.id, user_id: user.id, role: 'owner' })
  );
  const agent = check(
    await db
      .from('agents')
      .insert({
        name: `mcp-buyer-${randomUUID().slice(0, 8)}`,
        developer_id: owner.id,
        status: 'active',
      })
      .select('id')
      .single()
  );
  const sellerOwner = check(
    await db
      .from('developers')
      .insert({
        kind: 'personal',
        display_name: `MCP seller ${stamp.slice(-8)}`,
      })
      .select('id')
      .single()
  );
  const seller = check(
    await db
      .from('agents')
      .insert({
        name: `mcp-seller-${randomUUID().slice(0, 8)}`,
        developer_id: sellerOwner.id,
        status: 'active',
      })
      .select('id')
      .single()
  );
  const apiKey = `ag_${randomBytes(24).toString('hex')}`;
  check(
    await db
      .from('api_keys')
      .insert({
        agent_id: agent.id,
        key_hash: await bcrypt.hash(apiKey, 10),
        key_prefix: apiKey.slice(0, 8),
        permissions: ['read', 'write'],
      })
  );
  const payload = {
    listing_type: 'agent_service',
    title: `MCP stdio purchase ${randomUUID().slice(0, 8)}`,
    description: 'Local retained fixture; virtual funds only.',
    category: 'test',
    tags: ['mcp-stdio-fixture'],
    price_amount: '125',
    price_currency: 'USD',
    inventory: 2,
    images: [],
    delivery_type: 'service',
  };
  const listing = check(
    await db
      .from('economy_listings')
      .insert({
        seller_agent_id: seller.id,
        seller_owner_id: sellerOwner.id,
        payload,
        state: 'published',
        visibility: 'public',
      })
      .select('*')
      .single()
  );
  check(
    await db
      .from('economy_sandbox_allowlist')
      .insert({
        agent_id: agent.id,
        developer_id: owner.id,
        purpose: 'sandbox_order_buyer',
      })
  );
  check(
    await db
      .from('economy_sandbox_listings')
      .insert({
        listing_id: listing.id,
        seller_owner_id: sellerOwner.id,
        purpose: 'mcp_sandbox_fixture',
      })
  );
  check(
    await db.rpc('economy_sandbox_wallet_recharge', {
      p_agent: agent.id,
      p_owner: owner.id,
      p_amount_minor: '1000',
      p_idempotency_key: `stdio-${randomUUID()}`,
    })
  );
  Object.assign(evidence.fixtures, {
    owner: owner.id,
    agent: agent.id,
    seller_owner: sellerOwner.id,
    seller_agent: seller.id,
    listing: listing.id,
    api_key_prefix: apiKey.slice(0, 8),
  });
  const credentialsPath = path.join(dir, 'buyer-credentials.private.json');
  await writeFile(
    credentialsPath,
    JSON.stringify(
      {
        baseUrl: process.env.SOCIETY_TEST_URL || 'http://127.0.0.1:3002',
        apiKey,
        agentId: agent.id,
        label: 'stdio purchase fixture buyer',
        sandbox: true,
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  );
  await writeFile(
    path.join(dir, 'fixture.json'),
    JSON.stringify(
      {
        evidence,
        listing_title: payload.title,
        price_minor: '125',
        initial_balance_minor: '1000',
        credentials_file: 'buyer-credentials.private.json',
      },
      null,
      2
    ) + '\n'
  );
  client = new Client({ name: 'functional-mcp-stdio', version: '1.0.0' });
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, 'mcp/server.mjs')],
    env: { ...process.env, SOCIETY_MCP_CREDENTIALS: credentialsPath },
  });
  await client.connect(transport);
  const identity = await invoke('society_identity', {});
  assert.equal(identity.agent_id, agent.id);
  assert.equal(identity.sandbox, true);
  const initialWallet = await invoke('society_wallet', {});
  assert.equal(initialWallet.balance_minor, '1000');
  const market = await invoke('society_marketplace', {
    q: payload.title,
    tag: '',
    page: 1,
  });
  const found =
    market.results?.find((x) => x.id === listing.id) ||
    market.items?.find((x) => x.id === listing.id) ||
    market.listings?.find((x) => x.id === listing.id) ||
    market.data?.find((x) => x.id === listing.id);
  assert.ok(
    found,
    'fixture listing is discoverable through society_marketplace'
  );
  const idem = `stdio-purchase-${randomUUID()}`;
  const purchaseArgs = {
    listing_id: listing.id,
    listing_version: 1,
    quantity: 1,
    idempotency_key: idem,
  };
  const purchased = await invoke('society_sandbox_purchase', purchaseArgs);
  evidence.fixtures.order = purchased.id;
  const replay = await invoke('society_sandbox_purchase', purchaseArgs);
  assert.equal(
    replay.id,
    purchased.id,
    'same idempotency key returns same order'
  );
  const wallet = await invoke('society_wallet', {});
  assert.equal(wallet.balance_minor, '875');
  const orders = await invoke('society_orders', { page: 1 });
  const buyerOrders = orders.items ?? orders.orders ?? orders.data ?? orders;
  assert.ok(Array.isArray(buyerOrders));
  assert.ok(
    buyerOrders.some((x) => x.id === purchased.id),
    'society_orders exposes the purchase'
  );
  evidence.calls = [
    'society_identity',
    'society_marketplace',
    'society_wallet',
    'society_sandbox_purchase',
    'same-key purchase replay',
    'society_orders',
  ];
  evidence.status = 'passed';
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
} catch (e) {
  evidence.status = 'failed';
  evidence.error = String(e?.stack ?? e);
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  throw e;
} finally {
  if (client) await client.close().catch(() => {});
}
console.log(
  JSON.stringify({
    status: evidence.status,
    checks: evidence.calls,
    evidence: dir,
  })
);
