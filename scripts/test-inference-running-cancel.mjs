import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const bcrypt = require('bcryptjs');
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const dir = path.join(
  root,
  '.local/functional-tests',
  `inference-running-cancel-${new Date().toISOString().replaceAll(':', '-')}`
);
await mkdir(dir, { recursive: true });
const evidence = {
  startedAt: new Date().toISOString(),
  retained: true,
  mode: 'backend-created durable RUNNING call; no real model invocation or slow response',
  checks: [],
  sessions: [],
};
const ok = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
function check(name, details = {}) {
  evidence.checks.push({ name, passed: true, ...details });
  console.log(`PASS ${name}`);
}
async function fixture(label) {
  const email = `inference-running-${randomUUID()}@example.test`,
    password = randomBytes(24).toString('hex');
  const user = ok(
    await db.auth.admin.createUser({ email, password, email_confirm: true })
  ).user;
  const owner = ok(
    await db
      .from('developers')
      .insert({ kind: 'personal', display_name: `Inference Running ${label}` })
      .select('id')
      .single()
  );
  ok(
    await db
      .from('developer_members')
      .insert({ developer_id: owner.id, user_id: user.id, role: 'owner' })
  );
  const a = ok(
    await db
      .from('agents')
      .insert({
        name: `inference-run-${randomUUID().slice(0, 30)}`,
        developer_id: owner.id,
        status: 'active',
      })
      .select('id')
      .single()
  );
  const apiKey = 'ag_' + randomBytes(24).toString('hex');
  ok(
    await db
      .from('api_keys')
      .insert({
        agent_id: a.id,
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
  ok(await auth.auth.signInWithPassword({ email, password }));
  return {
    agent: a.id,
    owner: owner.id,
    apiKey,
    cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}
async function request(route, who, value, headers = {}) {
  const r = await fetch(app + route, {
    method: value ? 'POST' : 'GET',
    headers: {
      ...(who?.cookie
        ? { Cookie: who.cookie }
        : who?.apiKey
          ? { Authorization: `Bearer ${who.apiKey}` }
          : {}),
      ...(value ? { 'Content-Type': 'application/json', Origin: app } : {}),
      ...headers,
    },
    body: value ? JSON.stringify(value) : undefined,
  });
  let result;
  try {
    result = await r.json();
  } catch {
    result = { raw: await r.text() };
  }
  await appendFile(
    path.join(dir, 'requests.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      route,
      actor: who?.agent ?? 'anonymous',
      request: value ?? null,
      status: r.status,
      result,
    }) + '\n'
  );
  return { status: r.status, ...result };
}
const ownerRoute = (a) => `/api/v1/developers/me/inference?agentId=${a.agent}`;
const a2aHeaders = (who) => ({
  'A2A-Version': '1.0',
  'A2A-Extensions': 'urn:agent-society:inference-sandbox:v1',
  'X-Agent-Id': who.agent,
  'X-Agent-Permissions': '["read","write"]',
});
async function a2a(who, method, params) {
  return request(
    '/api/v1/society/a2a',
    who,
    { jsonrpc: '2.0', id: randomUUID(), method, params },
    a2aHeaders(who)
  );
}
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
try {
  assert.equal(
    (await fetch(app + '/api/v1/society/inference/services')).status,
    200
  );
  const [buyer, seller, unrelated] = await Promise.all([
    fixture('Buyer'),
    fixture('Seller'),
    fixture('Unrelated'),
  ]);
  const buyerAgent = { agent: buyer.agent, apiKey: buyer.apiKey };
  const unrelatedAgent = { agent: unrelated.agent, apiKey: unrelated.apiKey };
  evidence.agents = {
    buyer: buyer.agent,
    seller: seller.agent,
    unrelated: unrelated.agent,
  };
  assert.equal(
    (
      await request(ownerRoute(seller), seller, {
        action: 'service',
        enabled: true,
        policy,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await request(ownerRoute(buyer), buyer, {
        action: 'fund',
        amount: '10000000000000',
        key: randomUUID(),
      })
    ).status,
    200
  );
  const q = await request('/api/v1/society/inference', buyerAgent, {
    action: 'quote',
    seller: seller.agent,
    cap: '1000000000000',
    topic: 'Python',
  });
  assert.equal(q.status, 200);
  const session = q.data.id;
  evidence.sessions.push(session);
  assert.equal(
    (
      await request(ownerRoute(seller), seller, {
        action: 'provider_approve',
        session,
      })
    ).status,
    200
  );
  const state = await request(ownerRoute(buyer), buyer);
  const digest = state.data.sessions.find((x) => x.id === session).quote_digest;
  assert.equal(
    (
      await request(ownerRoute(buyer), buyer, {
        action: 'approve',
        session,
        digest,
      })
    ).status,
    200
  );
  const before = await request(ownerRoute(buyer), buyer);
  const balanceBefore = before.data.balance;
  const input = 'Simulate an in-flight gateway request for cancellation.';
  const maxOutput = 80;
  const key = randomUUID();
  const requestDigest = createHash('sha256')
    .update(JSON.stringify([input, maxOutput]))
    .digest('hex');
  const begin = await db.rpc('inference_command', {
    p_agent: buyer.agent,
    p_owner: buyer.owner,
    p_user: null,
    p_action: 'begin',
    p_value: {
      session,
      key,
      digest: requestDigest,
      input: Buffer.byteLength(input, 'utf8'),
      output: maxOutput,
    },
  });
  if (begin.error) throw new Error(`begin RPC failed: ${begin.error.message}`);
  const taskId = begin.data.id;
  evidence.backendFixture = {
    taskId,
    session,
    createdAs: 'RUNNING',
    requestKey: key,
    requestDigest,
    inputBytes: Buffer.byteLength(input, 'utf8'),
    outputBound: maxOutput,
  };
  await appendFile(
    path.join(dir, 'backend-rpc.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      rpc: 'inference_command',
      action: 'begin',
      session,
      taskId,
      data: begin.data,
    }) + '\n'
  );
  assert.equal(begin.data.state, 'RUNNING');
  const getBefore = await a2a(buyerAgent, 'GetTask', { id: taskId });
  assert.equal(getBefore.status, 200);
  assert.equal(getBefore.result.status.state, 'TASK_STATE_WORKING');
  check('A2A GetTask exposes backend-created RUNNING as WORKING', {
    taskId,
    taskState: getBefore.result.status.state,
  });
  const unrelatedGet = await a2a(unrelatedAgent, 'GetTask', { id: taskId });
  assert.equal(unrelatedGet.error?.message, 'Task not found');
  const unrelatedCancel = await a2a(unrelatedAgent, 'CancelTask', {
    id: taskId,
  });
  assert.equal(unrelatedCancel.error?.message, 'Task not found');
  check('unrelated Agent cannot GetTask or CancelTask', {
    getError: unrelatedGet.error.message,
    cancelError: unrelatedCancel.error.message,
  });
  const canceled = await a2a(buyerAgent, 'CancelTask', { id: taskId });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.result.status.state, 'TASK_STATE_CANCELED');
  check('A2A CancelTask transitions WORKING to CANCELED', {
    taskState: canceled.result.status.state,
  });
  const getCanceled = await a2a(buyerAgent, 'GetTask', { id: taskId });
  assert.equal(getCanceled.result.status.state, 'TASK_STATE_CANCELED');
  const completion = await db.rpc('inference_complete', {
    p_call: taskId,
    p_request: 'simulated-late-provider-response',
    p_output: 'x'.repeat(10),
    p_input: Buffer.byteLength(input, 'utf8'),
    p_output_tokens: 10,
  });
  assert.ok(completion.error, 'Canceled task must reject late completion');
  await appendFile(
    path.join(dir, 'backend-rpc.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      rpc: 'inference_complete',
      taskId,
      rejected: Boolean(completion.error),
      error: completion.error && {
        code: completion.error.code,
        message: completion.error.message,
      },
    }) + '\n'
  );
  assert.equal(completion.error.code, '40001');
  check('late inference_complete is rejected after cancellation', {
    errorCode: completion.error.code,
  });
  const invoice = await request('/api/v1/society/inference', buyerAgent, {
    action: 'invoice',
    session,
  });
  assert.equal(invoice.status, 200);
  const call = invoice.data.calls.find((x) => x.id === taskId);
  assert.equal(call.state, 'CANCELED');
  assert.equal(call.cost, '0');
  assert.equal(invoice.data.charge, '0');
  check('canceled call remains uncharged', {
    callState: call.state,
    callCost: call.cost,
    sessionCharge: invoice.data.charge,
  });
  const beforeClose = await request(ownerRoute(buyer), buyer);
  const heldSession = beforeClose.data.sessions.find((x) => x.id === session);
  assert.equal(heldSession.state, 'PAUSED');
  assert.equal(
    (await request(ownerRoute(buyer), buyer, { action: 'close', session }))
      .status,
    200
  );
  const afterClose = await request(ownerRoute(buyer), buyer);
  const settled = afterClose.data.sessions.find((x) => x.id === session);
  assert.equal(settled.state, 'SETTLED');
  assert.equal(settled.spent, '0');
  assert.equal(
    BigInt(afterClose.data.balance),
    BigInt(balanceBefore) + 1000000000000n
  );
  check('closing canceled session releases all reserved balance', {
    finalState: settled.state,
    finalSpent: settled.spent,
    balanceBefore,
    balanceAfter: afterClose.data.balance,
    releasedCap: '1000000000000',
  });

  const q2 = await request('/api/v1/society/inference', buyerAgent, {
    action: 'quote',
    seller: seller.agent,
    cap: '1000000000000',
    topic: 'Python',
  });
  assert.equal(q2.status, 200);
  const session2 = q2.data.id;
  evidence.sessions.push(session2);
  assert.equal(
    (
      await request(ownerRoute(seller), seller, {
        action: 'provider_approve',
        session: session2,
      })
    ).status,
    200
  );
  const state2 = await request(ownerRoute(buyer), buyer);
  const digest2 = state2.data.sessions.find(
    (x) => x.id === session2
  ).quote_digest;
  assert.equal(
    (
      await request(ownerRoute(buyer), buyer, {
        action: 'approve',
        session: session2,
        digest: digest2,
      })
    ).status,
    200
  );
  const beforeForged = await request('/api/v1/society/inference', buyerAgent, {
    action: 'invoice',
    session: session2,
  });
  const forgedUsage = await request('/api/v1/society/inference', buyerAgent, {
    action: 'send',
    session: session2,
    key: randomUUID(),
    input: 'Caller must not set billable usage.',
    maxOutput: 50,
    inputTokens: 9000,
    outputTokens: 9000,
    usage: { inputTokens: 9000, outputTokens: 9000 },
    cost: '999999999999',
  });
  assert.equal(forgedUsage.status, 400);
  assert.equal(forgedUsage.error.code, 'UNKNOWN_FIELD');
  const afterForged = await request('/api/v1/society/inference', buyerAgent, {
    action: 'invoice',
    session: session2,
  });
  assert.equal(beforeForged.data.charge, afterForged.data.charge);
  assert.equal(afterForged.data.calls.length, 0);
  check(
    'client supplied usage/cost fields are rejected with no call or charge',
    {
      httpStatus: forgedUsage.status,
      error: forgedUsage.error.code,
      callsAfterReject: afterForged.data.calls.length,
      chargeAfterReject: afterForged.data.charge,
    }
  );
  const normal = await request('/api/v1/society/inference', buyerAgent, {
    action: 'send',
    session: session2,
    key: randomUUID(),
    input: 'Server measured test usage.',
    maxOutput: 50,
  });
  assert.equal(normal.status, 200);
  const afterNormal = await request('/api/v1/society/inference', buyerAgent, {
    action: 'invoice',
    session: session2,
  });
  assert.equal(afterNormal.data.calls.length, 1);
  assert.ok(BigInt(afterNormal.data.charge) > 0n);
  assert.equal(
    (
      await request(ownerRoute(buyer), buyer, {
        action: 'close',
        session: session2,
      })
    ).status,
    200
  );
  check(
    'valid send after rejected forged usage is charged using server metering',
    {
      callsAfterSend: afterNormal.data.calls.length,
      serverCharge: afterNormal.data.charge,
    }
  );
} catch (error) {
  evidence.fatal = String(error);
  console.error(evidence.fatal);
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.status = evidence.fatal ? 'failed' : 'passed';
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2)
  );
  console.log(
    JSON.stringify({
      status: evidence.status,
      evidence: dir,
      passed: evidence.checks.length,
    })
  );
  if (evidence.status !== 'passed') process.exitCode = 1;
}
