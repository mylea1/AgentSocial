import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const app = 'http://127.0.0.1:3000';
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js'),
  { createServerClient } = require('@supabase/ssr'),
  bcrypt = require('bcryptjs');
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const dir = path.join(root, '.local/inference', 'http-' + Date.now());
await mkdir(dir, { recursive: true });
const check = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const evidence = { checks: [], sessions: [], retained: true };
async function fixture(label) {
  const email = `inference-http-${randomUUID()}@example.test`,
    password = randomBytes(24).toString('hex');
  const user = check(
    await db.auth.admin.createUser({ email, password, email_confirm: true })
  ).user;
  const owner = check(
    await db
      .from('developers')
      .insert({ kind: 'personal', display_name: `Inference HTTP ${label}` })
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
        name: `inference-http-${randomUUID().slice(0, 30)}`,
        developer_id: owner.id,
        status: 'active',
      })
      .select('id')
      .single()
  );
  const apiKey = 'ag_' + randomBytes(24).toString('hex');
  check(
    await db.from('api_keys').insert({
      agent_id: agent.id,
      key_hash: await bcrypt.hash(apiKey, 10),
      key_prefix: apiKey.slice(0, 8),
      permissions: ['read', 'write'],
    })
  );
  const cookies = new Map();
  const auth = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach((v) => cookies.set(v.name, v.value)),
      },
    }
  );
  check(await auth.auth.signInWithPassword({ email, password }));
  return {
    agent: agent.id,
    owner: owner.id,
    apiKey,
    cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}
async function request(route, who, value, extra = {}) {
  const r = await fetch(app + route, {
    method: value ? 'POST' : 'GET',
    headers: {
      ...(who?.cookie
        ? { Cookie: who.cookie }
        : who?.apiKey
          ? { Authorization: 'Bearer ' + who.apiKey }
          : {}),
      ...(value ? { 'Content-Type': 'application/json', Origin: app } : {}),
      ...extra,
    },
    body: value ? JSON.stringify(value) : undefined,
  });
  const result = await r.json();
  await appendFile(
    path.join(dir, 'http.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      route,
      value,
      status: r.status,
      result,
    }) + '\n'
  );
  return { status: r.status, ...result };
}
const ownerRoute = (a) => '/api/v1/developers/me/inference?agentId=' + a.agent;
let mcp;
try {
  const alice = await fixture('Alice'),
    bob = await fixture('Bob');
  const agentAlice = { apiKey: alice.apiKey };
  evidence.agents = [alice.agent, bob.agent];
  assert.equal((await request('/api/v1/society/inference')).status, 401);
  assert.equal((await request(ownerRoute(alice), bob)).status, 403);
  assert.equal(
    (
      await request('/api/v1/society/inference', agentAlice, {
        action: 'fund',
        amount: '1',
        key: 'forged-key',
      })
    ).status,
    403
  );
  const policy = {
    model: 'mock-v1',
    topics: ['Python'],
    input: '1000000',
    cachedInput: '500000',
    output: '2000000',
    maxCalls: 5,
    maxInput: 1000,
    maxOutput: 512,
    maxSession: '1000000000000',
    dailyBudget: '10000000000000',
    concurrency: 1,
  };
  assert.equal(
    (
      await request(ownerRoute(bob), bob, {
        action: 'service',
        enabled: true,
        policy,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await request(ownerRoute(alice), alice, {
        action: 'fund',
        amount: '1000000000000',
        key: randomUUID(),
      })
    ).status,
    200
  );
  const quote = await request('/api/v1/society/inference', agentAlice, {
    action: 'quote',
    seller: bob.agent,
    cap: '1000000000000',
    topic: 'Python',
  });
  assert.equal(quote.status, 200);
  const session = quote.data.id;
  evidence.sessions.push(session);
  assert.equal(
    (
      await request(ownerRoute(bob), bob, {
        action: 'provider_approve',
        session,
      })
    ).status,
    200
  );
  const state = await request(ownerRoute(alice), alice);
  const digest = state.data.sessions.find((s) => s.id === session).quote_digest;
  assert.equal(
    (
      await request(
        ownerRoute(alice),
        alice,
        { action: 'approve', session, digest },
        { Origin: 'https://evil.example' }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await request(ownerRoute(alice), alice, {
        action: 'approve',
        session,
        digest,
      })
    ).status,
    200
  );
  const rpc = {
    jsonrpc: '2.0',
    id: 1,
    method: 'SendMessage',
    params: {
      message: {
        messageId: randomUUID(),
        contextId: session,
        role: 'ROLE_USER',
        parts: [{ text: 'Explain Python boundary tests.' }],
      },
      metadata: { maxOutputTokens: 100 },
    },
  };
  const headers = {
    'A2A-Version': '1.0',
    'A2A-Extensions': 'urn:agent-society:inference-sandbox:v1',
  };
  const first = await request('/api/v1/society/a2a', agentAlice, rpc, headers);
  assert.equal(first.result.task.status.state, 'TASK_STATE_COMPLETED');
  const replay = await request('/api/v1/society/a2a', agentAlice, rpc, headers);
  assert.equal(replay.result.task.id, first.result.task.id);
  assert.equal(
    (
      await request(
        '/api/v1/society/a2a',
        agentAlice,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'ListTasks',
          params: { contextId: session },
        },
        headers
      )
    ).result.totalSize,
    1
  );
  evidence.checks.push(
    'HTTP owner isolation, owner-only funds, origin protection, A2A SendMessage/Get result/ListTasks/replay'
  );
  const creds = path.join(dir, 'mcp-credentials.json');
  await writeFile(
    creds,
    JSON.stringify({
      baseUrl: app,
      apiKey: alice.apiKey,
      agentId: alice.agent,
      sandbox: true,
    })
  );
  mcp = new Client({ name: 'inference-integration', version: '1' });
  await mcp.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, 'mcp/server.mjs')],
      env: { ...process.env, SOCIETY_MCP_CREDENTIALS: creds },
    })
  );
  const call = await mcp.callTool({
    name: 'society_inference_send',
    arguments: {
      session,
      key: randomUUID(),
      input: 'Continue with a second test.',
      maxOutput: 100,
    },
  });
  assert.ok(!call.isError, JSON.stringify(call));
  assert.ok(
    !(
      await mcp.callTool({
        name: 'society_inference_close',
        arguments: { session },
      })
    ).isError
  );
  const invoice = await request(ownerRoute(alice), alice);
  assert.equal(
    invoice.data.sessions.find((s) => s.id === session).state,
    'SETTLED'
  );
  assert.equal((await request('/api/v1/society/community')).status, 200);
  assert.equal(
    (
      await fetch(app + '/dashboard/inference', {
        headers: { Cookie: alice.cookie },
      })
    ).status,
    200
  );
  evidence.checks.push(
    'real MCP stdio second turn and settlement, free community, authenticated dashboard'
  );
  evidence.status = 'passed';
} catch (e) {
  evidence.status = 'failed';
  evidence.error = String(e);
  throw e;
} finally {
  if (mcp) await mcp.close();
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2)
  );
  console.log(JSON.stringify({ status: evidence.status, evidence: dir }));
}
