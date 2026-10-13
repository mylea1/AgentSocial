import assert from 'node:assert/strict';
import { readFile, mkdir, appendFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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
const stamp = new Date().toISOString().replaceAll(':', '-');
const dir = path.join(root, '.local/functional-tests', `ledger-${stamp}`);
await mkdir(dir, { recursive: true });
const evidence = {
  retained: true,
  scope: 'local TEST_USD only',
  created_at: new Date().toISOString(),
  fixtures: { users: [], owners: [], agents: [], sessions: [], calls: [] },
  checks: [],
  status: 'running',
};
const check = (r) => {
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.data;
};
async function log(kind, args, result) {
  await appendFile(
    path.join(dir, 'requests.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), kind, args, result }) + '\n'
  );
}
async function rpc(client, kind, name, args) {
  const r = await client.rpc(name, args);
  await log(kind, { name, args }, r);
  return r;
}
async function command(who, action, value = {}, owner = false) {
  return rpc(db, 'service', 'inference_command', {
    p_agent: who.agent,
    p_owner: who.owner,
    p_user: owner ? who.user : null,
    p_action: action,
    p_value: value,
  });
}
async function make(label) {
  const u = check(
    await db.auth.admin.createUser({
      email: `ledger-${crypto.randomUUID()}@example.test`,
      email_confirm: true,
    })
  ).user;
  const o = check(
    await db
      .from('developers')
      .insert({ kind: 'personal', display_name: `Ledger ${label}` })
      .select('id')
      .single()
  );
  check(
    await db
      .from('developer_members')
      .insert({ developer_id: o.id, user_id: u.id, role: 'owner' })
  );
  const a = check(
    await db
      .from('agents')
      .insert({
        name: `ledger-${crypto.randomUUID()}`,
        developer_id: o.id,
        status: 'active',
      })
      .select('id')
      .single()
  );
  const w = { user: u.id, owner: o.id, agent: a.id };
  evidence.fixtures.users.push(u.id);
  evidence.fixtures.owners.push(o.id);
  evidence.fixtures.agents.push(a.id);
  return w;
}
const buyer = await make('shared-buyer');
const seller = await make('seller');
const buyer2 = await make('concurrency-buyer');
const seller2 = await make('seller-two');
const policy = {
  model: 'mock-v1',
  topics: ['Python'],
  input: '1000000',
  cachedInput: '500000',
  output: '2000000',
  maxCalls: 5,
  maxInput: 1000,
  maxOutput: 100,
  maxSession: '1000000000000',
  dailyBudget: '10000000000000',
  concurrency: 1,
};
const prep = async (b, s, cap = '400000000000') => {
  const q = check(
    await command(b, 'quote', { seller: s.agent, cap, topic: 'Python' })
  );
  evidence.fixtures.sessions.push(q.id);
  check(await command(s, 'provider_approve', { session: q.id }, true));
  const state = check(await command(b, 'state'));
  return {
    session: q.id,
    digest: state.sessions.find((x) => x.id === q.id).quote_digest,
    b,
  };
};
try {
  for (const s of [seller, seller2])
    check(await command(s, 'service', { enabled: true, policy }, true));
  const twinId = check(
    await db
      .from('agents')
      .insert({
        name: `ledger-twin-${crypto.randomUUID()}`,
        developer_id: buyer.owner,
        status: 'active',
      })
      .select('id')
      .single()
  ).id;
  evidence.fixtures.agents.push(twinId);
  check(
    await command(
      buyer,
      'fund',
      { amount: '2000000000000', key: `fund-${crypto.randomUUID()}` },
      true
    )
  );
  check(
    await rpc(db, 'service', 'inference_budget', {
      p_agent: buyer.agent,
      p_owner: buyer.owner,
      p_user: buyer.user,
      p_value: {
        ownerDaily: '1000000000000',
        agentDaily: '1000000000000',
        sessionCap: '600000000000',
      },
    })
  );
  const pair = await Promise.all([
    prep(buyer, seller, '600000000000'),
    prep({ ...buyer, agent: twinId }, seller2, '600000000000'),
  ]);
  const approves = await Promise.all(
    pair.map((x) =>
      command(x.b, 'approve', { session: x.session, digest: x.digest }, true)
    )
  );
  assert.equal(approves.filter((x) => !x.error).length, 1);
  assert.equal(approves.find((x) => x.error)?.error.code, 'P0429');
  assert.match(
    approves.find((x) => x.error)?.error.message,
    /owner or agent budget exceeded/
  );
  evidence.checks.push({
    name: 'shared owner daily budget across distinct agents; single legal reservation succeeds',
    pass: true,
    successes: 1,
    error: approves.find((x) => x.error).error.code,
  });
  const balanceOwner = await make('balance-race');
  const balanceTwinId = check(
    await db
      .from('agents')
      .insert({
        name: 'bal-' + crypto.randomUUID(),
        developer_id: balanceOwner.owner,
        status: 'active',
      })
      .select('id')
      .single()
  ).id;
  evidence.fixtures.agents.push(balanceTwinId);
  check(
    await command(
      balanceOwner,
      'fund',
      { amount: '1000000000000', key: 'balance-' + crypto.randomUUID() },
      true
    )
  );
  for (const ag of [balanceOwner.agent, balanceTwinId])
    check(
      await rpc(db, 'service', 'inference_budget', {
        p_agent: ag,
        p_owner: balanceOwner.owner,
        p_user: balanceOwner.user,
        p_value: {
          ownerDaily: '1000000000000000',
          agentDaily: '1000000000000000',
          sessionCap: '600000000000',
        },
      })
    );
  const balancePair = await Promise.all([
    prep(balanceOwner, seller, '600000000000'),
    prep({ ...balanceOwner, agent: balanceTwinId }, seller2, '600000000000'),
  ]);
  const balanceApprovals = await Promise.all(
    balancePair.map((x) =>
      command(x.b, 'approve', { session: x.session, digest: x.digest }, true)
    )
  );
  assert.equal(balanceApprovals.filter((x) => !x.error).length, 1);
  assert.equal(
    balanceApprovals.find((x) => x.error)?.error.message,
    'insufficient mock funds'
  );
  assert.equal(
    check(await command(balanceOwner, 'state')).balance,
    '400000000000'
  );
  evidence.checks.push({
    name: 'parallel distinct sessions cannot reserve beyond shared available balance',
    pass: true,
    successes: 1,
    rejectedFor: balanceApprovals.find((x) => x.error).error.message,
  });
  check(
    await command(
      buyer2,
      'fund',
      { amount: '1000000000000', key: `fund-${crypto.randomUUID()}` },
      true
    )
  );
  check(
    await rpc(db, 'service', 'inference_budget', {
      p_agent: buyer2.agent,
      p_owner: buyer2.owner,
      p_user: buyer2.user,
      p_value: {
        ownerDaily: '1000000000000000',
        agentDaily: '1000000000000000',
        sessionCap: '500000000000',
      },
    })
  );
  const cs = await Promise.all([prep(buyer2, seller), prep(buyer2, seller)]);
  check(
    await rpc(db, 'service', 'inference_budget', {
      p_agent: buyer2.agent,
      p_owner: buyer2.owner,
      p_user: buyer2.user,
      p_value: {
        ownerDaily: '1000000000000000',
        agentDaily: '1000000000000000',
        sessionCap: '500000000000',
      },
    })
  );
  const approves2 = await Promise.all(
    cs.map((x) =>
      command(x.b, 'approve', { session: x.session, digest: x.digest }, true)
    )
  );
  assert.equal(approves2.filter((x) => !x.error).length, 2);
  const begins = await Promise.all(
    cs.map((x, i) =>
      command(x.b, 'begin', {
        session: x.session,
        key: `parallel-call-${i}-12345678`,
        digest: `parallel-${i}`,
        input: 1,
        output: 10,
      })
    )
  );
  assert.equal(begins.filter((x) => !x.error).length, 1);
  assert.equal(begins.find((x) => x.error)?.error.code, 'P0429');
  evidence.checks.push({
    name: 'same provider concurrency cap allows exactly one simultaneous successful begin',
    pass: true,
  });
  const ix = begins.findIndex((x) => !x.error);
  const running = check(begins[ix]);
  evidence.fixtures.calls.push(running.id);
  check(
    await rpc(db, 'service', 'inference_complete', {
      p_call: running.id,
      p_request: crypto.randomUUID(),
      p_output: '1234567890',
      p_input: 1,
      p_output_tokens: 10,
    })
  );
  check(await command(buyer2, 'close', { session: cs[ix].session }));
  const next = check(
    await command(buyer2, 'begin', {
      session: cs[1 - ix].session,
      key: 'next-call-12345678',
      digest: 'next',
      input: 1,
      output: 10,
    })
  );
  evidence.fixtures.calls.push(next.id);
  check(
    await rpc(db, 'service', 'inference_complete', {
      p_call: next.id,
      p_request: crypto.randomUUID(),
      p_output: 'abcdefghij',
      p_input: 1,
      p_output_tokens: 10,
    })
  );
  check(await command(buyer2, 'close', { session: cs[1 - ix].session }));
  evidence.checks.push({
    name: 'concurrency capacity becomes available after prior call completes',
    pass: true,
  });
  const poor = await make('low-balance');
  check(
    await rpc(db, 'service', 'inference_budget', {
      p_agent: poor.agent,
      p_owner: poor.owner,
      p_user: poor.user,
      p_value: {
        ownerDaily: '1000000000000000',
        agentDaily: '1000000000000000',
        sessionCap: '1000000000000000',
      },
    })
  );
  check(
    await command(
      poor,
      'fund',
      { amount: '1', key: `poor-${crypto.randomUUID()}` },
      true
    )
  );
  const low = await prep(poor, seller, '2');
  const lowResult = await command(
    poor,
    'approve',
    { session: low.session, digest: low.digest },
    true
  );
  assert.equal(lowResult.error?.code, 'P0429');
  assert.equal(check(await command(poor, 'state')).balance, '1');
  evidence.checks.push({
    name: 'low balance rejected and funds unchanged',
    pass: true,
  });
  const rf = {
    session: cs[ix].session,
    amount: '1000000',
    key: 'refund-once-12345678',
  };
  check(await command(seller, 'refund', rf, true));
  const replay = check(await command(seller, 'refund', rf, true));
  assert.equal(replay.replay, true);
  evidence.checks.push({
    name: 'duplicate refund replay does not credit twice',
    pass: true,
  });
  const privateRead = await anon.from('inference_sessions').select('*');
  await log(
    'anonymous',
    { table: 'inference_sessions', operation: 'select' },
    privateRead
  );
  assert.ok(privateRead.error);
  const direct = await db
    .from('inference_entries')
    .insert({ voucher_id: crypto.randomUUID(), account: 'forged', amount: 1 });
  await log(
    'service',
    { table: 'inference_entries', operation: 'insert' },
    direct
  );
  assert.ok(direct.error);
  const directSession = await db
    .from('inference_sessions')
    .update({ state: 'SETTLED' })
    .eq('id', cs[1 - ix].session);
  await log(
    'service',
    {
      table: 'inference_sessions',
      operation: 'update',
      id: cs[1 - ix].session,
    },
    directSession
  );
  assert.ok(directSession.error);
  evidence.checks.push({ name: 'RLS and direct writes denied', pass: true });
  const crash = await prep(buyer2, seller2);
  check(
    await command(
      buyer2,
      'approve',
      { session: crash.session, digest: crash.digest },
      true
    )
  );
  const cc = check(
    await command(buyer2, 'begin', {
      session: crash.session,
      key: 'crash-call-12345678',
      digest: 'crash',
      input: 1,
      output: 10,
    })
  );
  evidence.fixtures.calls.push(cc.id);
  execFileSync(
    'D:/agent-society-tools/Docker/resources/bin/docker.exe',
    [
      'exec',
      'supabase_db_agentgram',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `update public.inference_calls set created_at=now()-interval '6 minutes' where id='${cc.id}'`,
    ],
    { stdio: 'pipe' }
  );
  check(await rpc(db, 'service', 'inference_reconcile', {}));
  assert.equal(
    check(await command(buyer2, 'state')).sessions.find(
      (x) => x.id === crash.session
    ).state,
    'SETTLED'
  );
  assert.equal(
    check(await command(buyer2, 'calls', { session: crash.session }))[0].state,
    'FAILED'
  );
  evidence.checks.push({
    name: 'crash recovery fails stale call and settles hold without charging unknown usage',
    pass: true,
  });
  evidence.status = 'passed';
} catch (e) {
  evidence.status = 'failed';
  evidence.error = String(e?.stack ?? e);
  throw e;
} finally {
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  console.log(
    JSON.stringify({
      status: evidence.status,
      checks: evidence.checks,
      evidence: dir,
    })
  );
}
