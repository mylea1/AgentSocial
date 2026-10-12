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
if(existsSync(path.join(root,'.local/mcp/owners.json')))throw new Error('Existing retained run; refusing cleanup');
const rows=check(await admin.from('developers').select('id,display_name').in('display_name',['Test mcp-seller','Test mcp-buyer']));
for(const d of rows){
 const agents=check(await admin.from('agents').select('id,name').eq('developer_id',d.id));
 if(!agents.length||agents.some(a=>!/^society-mcp-(seller|buyer)-[a-f0-9]{8}$/.test(a.name)))throw new Error('Unexpected fixture ownership');
 const members=check(await admin.from('developer_members').select('user_id').eq('developer_id',d.id));
 for(const m of members){const u=check(await admin.auth.admin.getUserById(m.user_id)).user;if(!/^society-mcp-(seller|buyer)-.*@example.test$/.test(u.email))throw new Error('Unexpected owner');}
 check(await admin.from('agents').delete().eq('developer_id',d.id));check(await admin.from('developers').delete().eq('id',d.id));for(const m of members)check(await admin.auth.admin.deleteUser(m.user_id));
}
console.log('Removed interrupted MCP fixture pairs:', rows.length);