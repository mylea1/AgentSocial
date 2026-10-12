import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { SocietyClient } from '../examples/society/client.mjs';
import { parseEnv } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(root, 'apps/web/.env.local')))
  Object.assign(
    process.env,
    parseEnv(
      readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8').replace(
        /^\uFEFF/,
        ''
      )
    )
  );
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const bcrypt = require('bcryptjs');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const app = process.env.SOCIETY_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(
  ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'].includes(app),
  'Test application must be local'
);
assert.equal(
  url,
  'http://127.0.0.1:54321',
  'Test is restricted to the disposable local Supabase'
);
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [],
  developers = [];
function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function fixture(label) {
  const password = randomBytes(24).toString('hex');
  const email = `society-${label}-${randomUUID()}@example.test`;
  const user = check(
    await admin.auth.admin.createUser({ email, password, email_confirm: true })
  ).user;
  users.push(user.id);
  const dev = check(
    await admin
      .from('developers')
      .insert({ kind: 'personal', display_name: `Test ${label}` })
      .select()
      .single()
  );
  developers.push(dev.id);
  check(
    await admin
      .from('developer_members')
      .insert({ developer_id: dev.id, user_id: user.id, role: 'owner' })
  );
  const agent = check(
    await admin
      .from('agents')
      .insert({
        name: `society-${label}-${randomUUID().slice(0, 8)}`,
        developer_id: dev.id,
        status: 'active',
      })
      .select()
      .single()
  );
  const key = `ag_${randomBytes(24).toString('hex')}`;
  check(
    await admin.from('api_keys').insert({
      agent_id: agent.id,
      key_hash: await bcrypt.hash(key, 10),
      key_prefix: key.slice(0, 8),
      permissions: ['read', 'write'],
    })
  );
  const cookies = new Map();
  const session = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach((v) => cookies.set(v.name, v.value)),
    },
  });
  check(await session.auth.signInWithPassword({ email, password }));
  const cookie = () =>
    [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return { agent, user, dev, key, cookie, session };
}
async function api(route, who, value, key = randomUUID()) {
  const headers = {
    ...(who?.cookie
      ? { Cookie: who.cookie() }
      : who?.key
        ? { Authorization: `Bearer ${who.key}` }
        : {}),
  };
  if (value) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = key;
  }
  const response = await fetch(app + route, {
    method: value ? 'POST' : 'GET',
    headers,
    body: value ? JSON.stringify(value) : undefined,
  });
  const result = await response.json();
  return { status: response.status, ...result };
}
const { mkdirSync, writeFileSync } = await import('node:fs');
const dir = path.join(root, '.local/mcp');
mkdirSync(dir, { recursive: true });
if (existsSync(path.join(dir, 'owners.json')))
  throw new Error('Fixtures already exist; refusing to duplicate');
const seller = await fixture('mcp-seller'),
  buyer = await fixture('mcp-buyer');
const owners = {};
for (const [role, who, peer] of [
  ['seller', seller, buyer],
  ['buyer', buyer, seller],
]) {
  owners[role] = {
    agentId: who.agent.id,
    developerId: who.dev.id,
    userId: who.user.id,
    cookie: who.cookie(),
  };
  const route = `/api/v1/developers/me/society?agentId=${who.agent.id}`;
  const policy = await api(route, who, {
    action: 'policy',
    publish_mode: 'manual',
    auto_categories: [],
    auto_tags: [],
    contact_mode: 'auto_with_rules',
  });
  assert.equal(policy.status, 200);
  const contacts = await api(route, who, {
    action: 'contact_policy',
    mode: 'auto_with_rules',
    allow_outbound: true,
    allowed_agents: [peer.agent.id],
    allowed_topics: ['mcp-demo'],
    daily_limit: 20,
    session_minutes: 120,
    max_messages: 30,
  });
  assert.equal(contacts.status, 200, JSON.stringify(contacts));
  const economy = await api(
    `/api/v1/developers/me/economy?agentId=${who.agent.id}`,
    who,
    { action: 'policy', allow_proposals: role === 'seller' }
  );
  assert.equal(economy.status, 200);
  writeFileSync(
    path.join(dir, `${role}.json`),
    JSON.stringify(
      {
        baseUrl: app,
        apiKey: who.key,
        agentId: who.agent.id,
        label: `MCP sandbox ${role}`,
        sandbox: true,
      },
      null,
      2
    )
  );
}
writeFileSync(path.join(dir, 'owners.json'), JSON.stringify(owners, null, 2));
writeFileSync(
  path.join(dir, 'public.json'),
  JSON.stringify(
    {
      baseUrl: app,
      seller: { id: seller.agent.id, name: seller.agent.name },
      buyer: { id: buyer.agent.id, name: buyer.agent.name },
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({
    created: true,
    publicManifest: path.join(dir, 'public.json'),
  })
);
