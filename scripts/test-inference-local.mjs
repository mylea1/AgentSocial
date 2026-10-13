import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, appendFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
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
const dir = path.join(
  root,
  '.local/inference',
  new Date().toISOString().replaceAll(':', '-')
);
await mkdir(dir, { recursive: true });
const evidence = {
  retained: true,
  kind: 'TEST_USD only',
  agents: [],
  checks: [],
};
function check(r) {
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.data;
}
async function invoke(who, action, value = {}, owner = false) {
  const args = {
    p_agent: who.agent,
    p_owner: who.owner,
    p_user: owner ? who.user : null,
    p_action: action,
    p_value: value,
  };
  const result = await db.rpc('inference_command', args);
  await appendFile(
    path.join(dir, 'rpc.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), args, result }) + '\n'
  );
  return result;
}
try {
  for (const label of ['Alice', 'Bob', 'Mallory']) {
    const user = check(
      await db.auth.admin.createUser({
        email: `inference-${crypto.randomUUID()}@example.test`,
        email_confirm: true,
      })
    ).user;
    const owner = check(
      await db
        .from('developers')
        .insert({ kind: 'personal', display_name: `Inference test ${label}` })
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
          name: `inference-${crypto.randomUUID()}`,
          developer_id: owner.id,
          status: 'active',
        })
        .select('id')
        .single()
    );
    evidence.agents.push({
      label,
      user: user.id,
      owner: owner.id,
      agent: agent.id,
    });
  }
  const [alice, bob, mallory] = evidence.agents;
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
  assert.equal(
    (await invoke(bob, 'service', { enabled: true, policy })).error.code,
    '42501'
  );
  check(await invoke(bob, 'service', { enabled: true, policy }, true));
  check(
    await invoke(
      alice,
      'fund',
      { amount: '1000000000000', key: 'fund-first' },
      true
    )
  );
  check(
    await invoke(
      alice,
      'fund',
      { amount: '1000000000000', key: 'fund-first' },
      true
    )
  );
  assert.equal(
    (await invoke(alice, 'fund', { amount: '1', key: 'fund-first' }, true))
      .error.code,
    '40001'
  );
  evidence.checks.push('owner-only enable/fund and funding replay');
  const quote = check(
    await invoke(alice, 'quote', {
      seller: bob.agent,
      cap: '1000000000000',
      topic: 'Python',
    })
  );
  const session = quote.id;
  assert.equal(
    (
      await invoke(alice, 'begin', {
        session,
        key: 'call-first',
        digest: 'first',
        input: 10,
        output: 20,
      })
    ).error.code,
    '42501'
  );
  assert.equal(
    (await invoke(mallory, 'calls', { session })).error.code,
    '42501'
  );
  check(await invoke(bob, 'provider_approve', { session }, true));
  const state = check(await invoke(alice, 'state'));
  const digest = state.sessions.find((s) => s.id === session).quote_digest;
  assert.equal(
    (await invoke(alice, 'approve', { session, digest })).error.code,
    '42501'
  );
  check(
    await db.rpc('inference_budget', {
      p_agent: alice.agent,
      p_owner: alice.owner,
      p_user: alice.user,
      p_value: {
        ownerDaily: '1000000000000000',
        agentDaily: '100000000000000',
        sessionCap: '500000000000',
      },
    })
  );
  assert.equal(
    (await invoke(alice, 'approve', { session, digest }, true)).error.code,
    'P0429'
  );
  assert.equal(check(await invoke(alice, 'state')).balance, '1000000000000');
  check(
    await db.rpc('inference_budget', {
      p_agent: alice.agent,
      p_owner: alice.owner,
      p_user: alice.user,
      p_value: {
        ownerDaily: '1000000000000000',
        agentDaily: '100000000000000',
        sessionCap: '1000000000000',
      },
    })
  );
  evidence.checks.push(
    'configured budget failure rolls back the entire reservation voucher'
  );
  const reservations = await Promise.all([
    invoke(alice, 'approve', { session, digest }, true),
    invoke(alice, 'approve', { session, digest }, true),
  ]);
  assert.equal(reservations.filter((x) => !x.error).length, 1);
  assert.equal(check(await invoke(alice, 'state')).balance, '0');
  evidence.checks.push(
    'both-owner authorization, private sessions, atomic duplicate reservation'
  );
  const calls = await Promise.all([
    invoke(alice, 'begin', {
      session,
      key: 'call-first',
      digest: 'first',
      input: 10,
      output: 20,
    }),
    invoke(alice, 'begin', {
      session,
      key: 'call-first',
      digest: 'first',
      input: 10,
      output: 20,
    }),
  ]);
  assert.equal(calls.filter((x) => x.data?.replay === true).length, 1);
  const call = check(calls[0]);
  assert.equal(
    (
      await invoke(alice, 'begin', {
        session,
        key: 'call-first',
        digest: 'different',
        input: 10,
        output: 20,
      })
    ).error.code,
    '40001'
  );
  check(
    await db.rpc('inference_complete', {
      p_call: call.id,
      p_request: crypto.randomUUID(),
      p_output: 'mock answer',
      p_input: 10,
      p_output_tokens: 11,
    })
  );
  assert.equal(
    (
      await db.rpc('inference_complete', {
        p_call: call.id,
        p_request: crypto.randomUUID(),
        p_output: 'mock answer',
        p_input: 10,
        p_output_tokens: 11,
      })
    ).error.code,
    '40001'
  );
  assert.equal(
    check(await invoke(alice, 'state')).sessions.find((s) => s.id === session)
      .spent,
    '32000000'
  );
  check(await invoke(alice, 'close', { session }));
  check(await invoke(alice, 'close', { session }));
  assert.equal(check(await invoke(bob, 'state')).balance, '28800000');
  assert.equal(check(await invoke(alice, 'state')).balance, '999968000000');
  check(
    await invoke(
      bob,
      'refund',
      { session, amount: '10000000', key: 'refund-first' },
      true
    )
  );
  check(
    await invoke(
      bob,
      'refund',
      { session, amount: '22000000', key: 'refund-second' },
      true
    )
  );
  assert.equal(check(await invoke(alice, 'state')).balance, '1000000000000');
  assert.equal(check(await invoke(bob, 'state')).balance, '0');
  evidence.checks.push(
    'call replay, actual usage, 90/10 split, unused release, partial/full refund'
  );
  assert.ok((await anon.from('inference_sessions').select('*')).error);
  assert.ok(
    (
      await db.from('inference_entries').insert({
        voucher_id: crypto.randomUUID(),
        account: 'forged',
        amount: 1,
      })
    ).error
  );
  const entries = check(
    await db.from('inference_entries').select('voucher_id,amount')
  );
  const totals = new Map();
  for (const e of entries)
    totals.set(
      e.voucher_id,
      (totals.get(e.voucher_id) || 0n) + BigInt(e.amount)
    );
  for (const sum of totals.values()) assert.equal(sum, 0n);
  evidence.checks.push(
    'RLS, denied direct ledger writes, every voucher balanced'
  );
  const refundMismatch = await invoke(
    bob,
    'refund',
    { session, amount: '1', key: 'refund-first' },
    true
  );
  assert.equal(refundMismatch.error.code, '40001');
  const quote2 = check(
    await invoke(alice, 'quote', {
      seller: bob.agent,
      cap: '1000000000000',
      topic: 'Python',
    })
  );
  check(await invoke(bob, 'provider_approve', { session: quote2.id }, true));
  const digest2 = check(await invoke(alice, 'state')).sessions.find(
    (s) => s.id === quote2.id
  ).quote_digest;
  check(
    await invoke(
      alice,
      'approve',
      { session: quote2.id, digest: digest2 },
      true
    )
  );
  const abandoned = check(
    await invoke(alice, 'begin', {
      session: quote2.id,
      key: 'abandoned-call',
      digest: 'abandoned',
      input: 10,
      output: 20,
    })
  );
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
      `update public.inference_calls set created_at=now()-interval '6 minutes' where id='${abandoned.id}'`,
    ],
    { stdio: 'pipe' }
  );
  check(await db.rpc('inference_reconcile', {}));
  assert.equal(check(await invoke(alice, 'state')).balance, '1000000000000');
  assert.equal(
    check(await invoke(alice, 'calls', { session: quote2.id }))[0].state,
    'FAILED'
  );
  const quote3 = check(
    await invoke(alice, 'quote', {
      seller: bob.agent,
      cap: '1000000000000',
      topic: 'Python',
    })
  );
  check(await invoke(bob, 'provider_approve', { session: quote3.id }, true));
  const digest3 = check(await invoke(alice, 'state')).sessions.find(
    (s) => s.id === quote3.id
  ).quote_digest;
  check(
    await invoke(
      alice,
      'approve',
      { session: quote3.id, digest: digest3 },
      true
    )
  );
  check(
    await db
      .from('agents')
      .update({ developer_id: mallory.owner })
      .eq('id', bob.agent)
  );
  assert.equal(
    (
      await invoke(alice, 'begin', {
        session: quote3.id,
        key: 'transfer-call',
        digest: 'transfer',
        input: 10,
        output: 20,
      })
    ).error.code,
    '42501'
  );
  check(await db.rpc('inference_reconcile', {}));
  assert.equal(check(await invoke(alice, 'state')).balance, '1000000000000');
  evidence.checks.push(
    'refund mismatch rejected, abandoned usage uncharged, owner transfer revokes execution and releases hold'
  );
  const invoice = check(
    await db.rpc('inference_invoice', {
      p_agent: alice.agent,
      p_owner: alice.owner,
      p_session: session,
    })
  );
  assert.equal(invoice.charge, '32000000');
  assert.equal(invoice.refunded, '32000000');
  assert.equal(invoice.commission, '0');
  assert.equal(invoice.providerEarnings, '0');
  assert.ok(invoice.ledger.length > 0);
  assert.equal(
    (
      await db.rpc('inference_invoice', {
        p_agent: mallory.agent,
        p_owner: mallory.owner,
        p_session: session,
      })
    ).error.code,
    '42501'
  );
  evidence.checks.push('invoice matches ledger and denies unrelated owners');
  evidence.session = session;
  evidence.status = 'passed';
} catch (e) {
  evidence.status = 'failed';
  evidence.error = String(e);
  throw e;
} finally {
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(evidence, null, 2)
  );
  console.log(
    JSON.stringify({
      status: evidence.status,
      checks: evidence.checks,
      evidence: dir,
    })
  );
}
