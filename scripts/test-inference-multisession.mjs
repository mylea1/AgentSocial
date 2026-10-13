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
  `inference-multisession-${new Date().toISOString().replaceAll(':', '-')}`
);
await mkdir(dir, { recursive: true });
const evidence = {
  startedAt: new Date().toISOString(),
  checks: [],
  sessions: [],
  retained: true,
};
let mcp = null;
const ok = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
function record(name, passed, details = {}) {
  evidence.checks.push({ name, passed, ...details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}
async function fixture(label) {
  const email = `inference-ms-${randomUUID()}@example.test`,
    password = randomBytes(24).toString('hex');
  const user = ok(
    await db.auth.admin.createUser({ email, password, email_confirm: true })
  ).user;
  const owner = ok(
    await db
      .from('developers')
      .insert({ kind: 'personal', display_name: `Inference MS ${label}` })
      .select('id')
      .single()
  );
  ok(
    await db
      .from('developer_members')
      .insert({ developer_id: owner.id, user_id: user.id, role: 'owner' })
  );
  const agent = ok(
    await db
      .from('agents')
      .insert({
        name: `inference-ms-${randomUUID().slice(0, 30)}`,
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
  ok(await auth.auth.signInWithPassword({ email, password }));
  return {
    agent: agent.id,
    owner: owner.id,
    apiKey,
    cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}
async function request(route, who, value, extra = {}, method) {
  const r = await fetch(app + route, {
    method: method ?? (value ? 'POST' : 'GET'),
    headers: {
      ...(who?.cookie
        ? { Cookie: who.cookie }
        : who?.apiKey
          ? { Authorization: `Bearer ${who.apiKey}` }
          : {}),
      ...(value ? { 'Content-Type': 'application/json', Origin: app } : {}),
      ...extra,
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
      method: method ?? (value ? 'POST' : 'GET'),
      actor: who?.agent ?? 'anonymous',
      request: value ?? null,
      status: r.status,
      result,
    }) + '\n'
  );
  return { status: r.status, ...result };
}
const ownerRoute = (a) => `/api/v1/developers/me/inference?agentId=${a.agent}`;
const agent = (a) => ({ apiKey: a.apiKey, agent: a.agent });
const headers = {
  'A2A-Version': '1.0',
  'A2A-Extensions': 'urn:agent-society:inference-sandbox:v1',
};
async function a2a(who, method, params, id = randomUUID()) {
  return request(
    '/api/v1/society/a2a',
    who,
    { jsonrpc: '2.0', id, method, params },
    {
      ...headers,
      'X-Agent-Id': who.agent,
      'X-Agent-Permissions': '["read","write"]',
    }
  );
}
async function attempt(name, fn) {
  try {
    const details = await fn();
    record(name, true, details ?? {});
  } catch (error) {
    record(name, false, { error: String(error) });
    evidence.defects ??= [];
    evidence.defects.push({ name, error: String(error) });
  }
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
let buyer, seller, b, s;
async function makeSession(label) {
  const q = await request('/api/v1/society/inference', b, {
    action: 'quote',
    seller: seller.agent,
    cap: '1000000000000',
    topic: 'Python',
  });
  assert.equal(q.status, 200, JSON.stringify(q));
  const id = q.data.id;
  evidence.sessions.push({ label, id });
  assert.equal(
    (
      await request(ownerRoute(seller), seller, {
        action: 'provider_approve',
        session: id,
      })
    ).status,
    200
  );
  const state = await request(ownerRoute(buyer), buyer);
  const digest = state.data.sessions.find((x) => x.id === id).quote_digest;
  assert.equal(
    (
      await request(ownerRoute(buyer), buyer, {
        action: 'approve',
        session: id,
        digest,
      })
    ).status,
    200
  );
  return id;
}
try {
  // Verify the existing local service without changing its process or settings.
  const health = await fetch(app + '/api/v1/society/inference/services');
  assert.equal(health.status, 200);
  const alice = await fixture('Buyer');
  buyer = alice;
  b = agent(alice);
  const bob = await fixture('Seller');
  seller = bob;
  s = agent(bob);
  evidence.agents = [alice.agent, bob.agent];
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
  await attempt('拒绝未审批会话及无效会话 ID', async () => {
    const quote = await request('/api/v1/society/inference', b, {
      action: 'quote',
      seller: seller.agent,
      cap: '1000000000000',
      topic: 'Python',
    });
    assert.equal(quote.status, 200);
    evidence.sessions.push({ label: 'unapproved', id: quote.data.id });
    const sid = quote.data.id;
    assert.equal(
      (
        await request('/api/v1/society/inference', b, {
          action: 'send',
          session: sid,
          key: randomUUID(),
          input: 'not approved',
          maxOutput: 50,
        })
      ).status,
      403
    );
    const fake = await request('/api/v1/society/inference', b, {
      action: 'send',
      session: randomUUID(),
      key: randomUUID(),
      input: 'forged',
      maxOutput: 50,
    });
    assert.equal(fake.status, 403);
    assert.equal(
      (
        await request(
          '/api/v1/society/inference',
          { apiKey: randomBytes(24).toString('hex') },
          undefined
        )
      ).status,
      401
    );
    return { unapprovedStatus: 403, forgedSessionStatus: fake.status };
  });
  await attempt('A2A、MCP 多轮调用结算及重复请求冲突', async () => {
    const sid = await makeSession('normal-multiturn');
    const messageId = randomUUID();
    const params = {
      message: {
        messageId,
        contextId: sid,
        role: 'ROLE_USER',
        parts: [{ text: 'First test turn.' }],
      },
      metadata: { maxOutputTokens: 80 },
    };
    const first = await a2a(b, 'SendMessage', params);
    assert.equal(first.status, 200);
    assert.equal(first.result.task.status.state, 'TASK_STATE_COMPLETED');
    const replay = await a2a(b, 'SendMessage', params);
    assert.equal(replay.result.task.id, first.result.task.id);
    const conflict = await a2a(b, 'SendMessage', {
      ...params,
      message: { ...params.message, parts: [{ text: 'changed replay' }] },
    });
    assert.equal(conflict.error?.message, 'CONFLICT');
    const creds = path.join(dir, 'mcp-credentials.json');
    await writeFile(
      creds,
      JSON.stringify({
        baseUrl: app,
        apiKey: buyer.apiKey,
        agentId: buyer.agent,
        sandbox: true,
      })
    );
    mcp = new Client({ name: 'inference-multisession', version: '1' });
    await mcp.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.join(root, 'mcp/server.mjs')],
        env: { ...process.env, SOCIETY_MCP_CREDENTIALS: creds },
      })
    );
    const second = await mcp.callTool({
      name: 'society_inference_send',
      arguments: {
        session: sid,
        key: randomUUID(),
        input: 'Second test turn by MCP.',
        maxOutput: 80,
      },
    });
    assert.ok(!second.isError, JSON.stringify(second));
    const close = await mcp.callTool({
      name: 'society_inference_close',
      arguments: { session: sid },
    });
    assert.ok(!close.isError);
    const state = (await request(ownerRoute(buyer), buyer)).data.sessions.find(
      (x) => x.id === sid
    );
    assert.equal(state.state, 'SETTLED');
    return {
      session: sid,
      a2aTask: first.result.task.id,
      mcpSecondTurn: 'completed',
      sessionState: state.state,
    };
  });
  await attempt('暂停后拒绝调用并可恢复', async () => {
    const sid = await makeSession('pause-resume');
    assert.equal(
      (
        await request(ownerRoute(buyer), buyer, {
          action: 'pause',
          session: sid,
        })
      ).status,
      200
    );
    const blocked = await request('/api/v1/society/inference', b, {
      action: 'send',
      session: sid,
      key: randomUUID(),
      input: 'paused',
      maxOutput: 30,
    });
    assert.equal(blocked.status, 403);
    assert.equal(
      (
        await request(ownerRoute(buyer), buyer, {
          action: 'resume',
          session: sid,
        })
      ).status,
      200
    );
    const sent = await request('/api/v1/society/inference', b, {
      action: 'send',
      session: sid,
      key: randomUUID(),
      input: 'resumed',
      maxOutput: 30,
    });
    assert.equal(sent.status, 200);
    assert.equal(
      (
        await request(ownerRoute(buyer), buyer, {
          action: 'close',
          session: sid,
        })
      ).status,
      200
    );
    return { blockedStatus: blocked.status, resumedSendStatus: sent.status };
  });
  await attempt(
    'A2A GetTask/ListTasks 分页和已完成任务 CancelTask 终态错误',
    async () => {
      const sid = await makeSession('a2a-pagination');
      const taskIds = [];
      for (let i = 0; i < 3; i++) {
        const r = await a2a(b, 'SendMessage', {
          message: {
            messageId: randomUUID(),
            contextId: sid,
            role: 'ROLE_USER',
            parts: [{ text: `Pagination turn ${i}` }],
          },
          metadata: { maxOutputTokens: 30 },
        });
        assert.equal(r.result.task.status.state, 'TASK_STATE_COMPLETED');
        taskIds.push(r.result.task.id);
      }
      const get = await a2a(b, 'GetTask', { id: taskIds[0] });
      assert.equal(get.result.id, taskIds[0]);
      const p1 = await a2a(b, 'ListTasks', { contextId: sid, pageSize: 2 });
      assert.equal(p1.result.tasks.length, 2);
      assert.equal(p1.result.totalSize, 3);
      assert.equal(p1.result.nextPageToken, '2');
      const p2 = await a2a(b, 'ListTasks', {
        contextId: sid,
        pageSize: 2,
        pageToken: p1.result.nextPageToken,
      });
      assert.equal(p2.result.tasks.length, 1);
      const cancel = await a2a(b, 'CancelTask', { id: taskIds[0] });
      assert.equal(cancel.error?.message, 'Task cannot be cancelled');
      await request(ownerRoute(buyer), buyer, {
        action: 'close',
        session: sid,
      });
      return {
        taskCount: 3,
        pages: [p1.result.tasks.length, p2.result.tasks.length],
        terminalCancelError: cancel.error.message,
      };
    }
  );
  evidence.checks.push({
    name: 'RUNNING Task 取消状态转换',
    passed: null,
    skipped: true,
    reason:
      '同步 Mock 的 SendMessage 无可观察 RUNNING 窗口；由独立后端控制任务脚本覆盖。',
  });
  await attempt('双方发票、部分退款及退款发票', async () => {
    const sid = evidence.sessions.find(
      (x) => x.label === 'normal-multiturn'
    ).id;
    const bi = await request('/api/v1/society/inference', b, {
      action: 'invoice',
      session: sid,
    });
    const si = await request('/api/v1/society/inference', s, {
      action: 'invoice',
      session: sid,
    });
    assert.equal(bi.status, 200);
    assert.equal(si.status, 200);
    const spent = BigInt(
      (await request(ownerRoute(buyer), buyer)).data.sessions.find(
        (x) => x.id === sid
      ).spent
    );
    const amount = (spent / 2n).toString();
    assert.ok(BigInt(amount) > 0n);
    assert.equal(
      (
        await request(ownerRoute(seller), seller, {
          action: 'refund',
          session: sid,
          amount,
          key: randomUUID(),
        })
      ).status,
      200
    );
    const bi2 = await request('/api/v1/society/inference', b, {
      action: 'invoice',
      session: sid,
    });
    const si2 = await request('/api/v1/society/inference', s, {
      action: 'invoice',
      session: sid,
    });
    assert.equal(bi2.status, 200);
    assert.equal(si2.status, 200);
    return {
      buyerInvoice: bi.status,
      sellerInvoice: si.status,
      refundAmount: amount,
      postRefundBuyerInvoice: bi2.status,
      postRefundSellerInvoice: si2.status,
    };
  });
  await attempt('服务关闭后阻止新会话调用', async () => {
    assert.equal(
      (
        await request(ownerRoute(seller), seller, {
          action: 'service',
          enabled: false,
          policy,
        })
      ).status,
      200
    );
    const q = await request('/api/v1/society/inference', b, {
      action: 'quote',
      seller: seller.agent,
      cap: '1000000000000',
      topic: 'Python',
    });
    assert.equal(q.status, 403);
    const pub = await request(
      '/api/v1/society/inference/services',
      null,
      undefined
    );
    assert.equal(pub.status, 200);
    assert.ok(!pub.data.some((x) => x.agent_id === seller.agent));
    return { quoteWhileDisabled: q.status, listedWhileDisabled: false };
  });
} catch (error) {
  evidence.fatal = String(error);
} finally {
  if (mcp) await mcp.close().catch(() => {});
  evidence.finishedAt = new Date().toISOString();
  evidence.status =
    evidence.fatal || evidence.defects?.length
      ? 'completed-with-failures'
      : 'passed';
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2)
  );
  console.log(
    JSON.stringify({
      status: evidence.status,
      evidence: dir,
      passed: evidence.checks.filter((x) => x.passed).length,
      failed: evidence.checks.filter((x) => x.passed === false).length,
      skipped: evidence.checks.filter((x) => x.skipped).length,
    })
  );
  if (evidence.status !== 'passed') process.exitCode = 1;
}
