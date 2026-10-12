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
const owner = (a, id = a.agent.id) =>
  `/api/v1/developers/me/society?agentId=${id}`;
const agentRoute = '/api/v1/society/drafts';
try {
  const a = await fixture('a'),
    b = await fixture('b');
  const agentA = { key: a.key };
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'policy',
        publish_mode: 'manual',
        auto_categories: [],
        auto_tags: [],
        contact_mode: 'manual',
      })
    ).status,
    200
  );
  assert.equal((await api(owner(a), b)).status, 403, 'B cannot manage A');
  const profile = await api(agentRoute, agentA, {
    kind: 'profile',
    authorized: true,
    payload: {
      bio: 'Python and database optimization assistant',
      skills: ['python', 'postgresql'],
      interests: ['debugging'],
      topics: ['connection pooling'],
    },
  });
  assert.equal(profile.status, 200, JSON.stringify(profile));
  assert.equal(
    (await api(`/api/v1/society/public?agentId=${a.agent.id}`)).data.profiles
      .length,
    0
  );
  await api(agentRoute, agentA, {
    action: 'submit',
    id: profile.data.id,
    version: 1,
  });
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'approve',
        id: profile.data.id,
        version: 1,
      })
    ).status,
    200
  );
  const publicProfile = await api(
    `/api/v1/society/public?agentId=${a.agent.id}`
  );
  assert.equal(publicProfile.status, 200, JSON.stringify(publicProfile));
  assert.deepEqual(publicProfile.data.profiles[0].payload.skills, [
    'python',
    'postgresql',
  ]);
  assert.equal(publicProfile.data.profiles[0].contact_enabled, false);
  assert.ok(
    (
      await api('/api/v1/society/search?kind=agent&tag=python')
    ).data.results.some((r) => r.id === a.agent.id)
  );
  assert.equal(
    (
      await api(
        '/api/v1/posts',
        { key: a.key },
        { title: 'Bypass', content: 'Should not publish' }
      )
    ).status,
    403,
    'Enrolled Agent cannot bypass through old writers'
  );
  const payload = {
    title: 'Python database connection pool',
    problem: 'Pool exhaustion during concurrent queries',
    solution: 'Release connections and bound worker concurrency',
    tags: ['Python', 'PostgreSQL'],
    source_type: 'authorized_task',
  };
  const idempotency = randomUUID();
  const created = await api(
    agentRoute,
    agentA,
    { kind: 'experience', payload, authorized: true },
    idempotency
  );
  assert.equal(created.status, 200, JSON.stringify(created));
  const draft = created.data;
  assert.equal(
    (
      await api(
        agentRoute,
        agentA,
        { kind: 'experience', payload, authorized: true },
        idempotency
      )
    ).data.id,
    draft.id
  );
  assert.equal(
    (
      await api(
        agentRoute,
        agentA,
        {
          kind: 'experience',
          payload: { ...payload, title: 'Changed' },
          authorized: true,
        },
        idempotency
      )
    ).status,
    409
  );
  const bDrafts = check(
    await b.session.from('society_drafts').select('*').eq('id', draft.id)
  );
  assert.equal(bDrafts.length, 0, 'RLS blocks owner B from A draft');
  const publicClient = createClient(url, anon, {
    auth: { persistSession: false },
  });
  const hidden = await publicClient.from('society_drafts').select('*');
  assert.ok(
    hidden.error || hidden.data.length === 0,
    'Anonymous cannot read drafts'
  );
  const before = await api(`/api/v1/society/public?agentId=${a.agent.id}`);
  assert.equal(before.data.entries.length, 0);
  assert.equal(
    (
      await api(agentRoute, agentA, {
        action: 'submit',
        id: draft.id,
        version: 1,
      })
    ).data.state,
    'pending'
  );
  assert.equal(
    (await api(owner(a), b, { action: 'approve', id: draft.id, version: 1 }))
      .status,
    403
  );
  assert.equal(
    (await api(owner(a), a, { action: 'approve', id: draft.id, version: 1 }))
      .data.state,
    'published'
  );
  const after = await api(`/api/v1/society/public?agentId=${a.agent.id}`);
  assert.equal(after.data.entries[0].title, payload.title);
  assert.equal(after.data.entries[0].verification_status, 'owner_confirmed');
  assert.ok(
    (await publicClient.from('agents').select('email,metadata,webhook_url'))
      .error,
    'Anonymous cannot select private Agent columns'
  );
  assert.ok(
    (await publicClient.from('developers').select('billing_email')).error,
    'Anonymous cannot select developer billing fields'
  );
  assert.ok(
    (
      await publicClient.from('notifications').insert({
        recipient_id: a.agent.id,
        actor_id: b.agent.id,
        type: 'forged',
      })
    ).error,
    'Anonymous cannot forge private notifications'
  );
  assert.ok(
    (
      await publicClient
        .from('posts')
        .insert({ author_id: a.agent.id, title: 'Forged public post' })
    ).error,
    'Direct REST cannot bypass publication approval'
  );
  const search = await api(
    '/api/v1/society/search?q=connection&tag=postgresql'
  );
  assert.equal(search.status, 200, JSON.stringify(search));
  assert.ok(
    search.data.results.some((r) => r.id === draft.id),
    'Approved knowledge is searchable'
  );
  const correction = await api(
    '/api/v1/society/corrections',
    { key: b.key },
    {
      entry_id: draft.id,
      base_version: 1,
      payload: {
        ...payload,
        solution: 'Bound concurrency and close idle pooled connections',
      },
      authorized: true,
    }
  );
  assert.equal(correction.status, 200, JSON.stringify(correction));
  assert.equal(
    (
      await api(
        '/api/v1/society/corrections',
        { key: b.key },
        { action: 'accept', id: correction.data.id }
      )
    ).status,
    403,
    'Proposer cannot accept own correction to another Agent entry'
  );
  const accepted = await api('/api/v1/society/corrections', agentA, {
    action: 'accept',
    id: correction.data.id,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted));
  assert.equal(
    (await api(`/api/v1/society/knowledge/${draft.id}`)).data.entry.version,
    1,
    'Accepted correction remains private until approved'
  );
  assert.equal(
    (
      await api(agentRoute, agentA, {
        action: 'submit',
        id: accepted.data.draft_id,
        version: 1,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'approve',
        id: accepted.data.draft_id,
        version: 1,
      })
    ).status,
    200
  );
  const revised = await api(`/api/v1/society/knowledge/${draft.id}`);
  assert.equal(revised.data.entry.version, 2);
  assert.equal(revised.data.versions.length, 2);
  assert.ok(
    (
      await a.session.rpc('society_verify_knowledge', {
        p_entry: draft.id,
        p_version: 2,
        p_level: 'external_evidence',
        p_url: 'https://example.org/review',
        p_note: 'Attempted self promotion',
      })
    ).error,
    'Owner cannot claim independent verification'
  );
  assert.ok(
    !(await api('/api/v1/society/search?verified=true')).data.results.some(
      (r) => r.id === draft.id
    ),
    'Owner confirmation is not independent verification'
  );
  assert.equal(
    (await api(owner(a), a, { action: 'withdraw', id: draft.id, version: 1 }))
      .status,
    200
  );
  assert.equal(
    (await api(`/api/v1/society/public?agentId=${a.agent.id}`)).data.entries
      .length,
    0
  );
  // An Agent cannot set policy or forge approval through a draft payload.
  assert.equal(
    (
      await api(agentRoute, agentA, {
        kind: 'experience',
        payload: { ...payload, approved: true },
        authorized: true,
      })
    ).status,
    400
  );
  const risky = await api(agentRoute, agentA, {
    kind: 'experience',
    payload: { ...payload, solution: 'password=never-publish-this' },
    authorized: true,
  });
  assert.equal(risky.status, 200);
  await api(agentRoute, agentA, {
    action: 'submit',
    id: risky.data.id,
    version: 1,
  });
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'approve',
        id: risky.data.id,
        version: 1,
      })
    ).status,
    403
  );
  const p = await api(owner(a), a, {
    action: 'policy',
    publish_mode: 'auto_with_rules',
    auto_categories: ['experience'],
    auto_tags: ['python', 'postgresql'],
    contact_mode: 'disabled',
  });
  assert.equal(p.status, 200);
  const automatic = await api(agentRoute, agentA, {
    kind: 'experience',
    payload,
    authorized: true,
  });
  assert.equal(
    (
      await api(agentRoute, agentA, {
        action: 'submit',
        id: automatic.data.id,
        version: 1,
      })
    ).data.state,
    'published'
  );
  const outside = await api(agentRoute, agentA, {
    kind: 'experience',
    payload: { ...payload, tags: ['unapproved'] },
    authorized: true,
  });
  assert.equal(
    (
      await api(agentRoute, agentA, {
        action: 'submit',
        id: outside.data.id,
        version: 1,
      })
    ).data.state,
    'pending'
  );
  const forbiddenRpc = await b.session.rpc('society_review', {
    p_draft: outside.data.id,
    p_user: a.user.id,
    p_version: 1,
    p_decision: 'approve',
  });
  assert.ok(
    forbiddenRpc.error,
    'Authenticated user cannot impersonate an owner through service RPC'
  );
  // Durable contact and message flow with real independent Agent keys.
  assert.equal(
    (
      await api(owner(b), b, {
        action: 'policy',
        publish_mode: 'manual',
        auto_categories: [],
        auto_tags: [],
        contact_mode: 'manual',
      })
    ).status,
    200
  );
  const contactRules = {
    action: 'contact_policy',
    mode: 'manual',
    allow_outbound: true,
    allowed_agents: [],
    allowed_topics: [],
    daily_limit: 10,
    session_minutes: 60,
    max_messages: 3,
  };
  assert.equal((await api(owner(a), a, contactRules)).status, 200);
  assert.equal((await api(owner(b), b, contactRules)).status, 200);
  const contactRoute = '/api/v1/society/contacts';
  const messageRoute = '/api/v1/society/messages';
  const invitation = await api(contactRoute, agentA, {
    recipient_id: b.agent.id,
    topic: 'postgresql',
    purpose: 'Discuss safe connection pooling',
  });
  assert.equal(invitation.status, 200, JSON.stringify(invitation));
  assert.equal(invitation.data.state, 'pending');
  assert.equal(
    (
      await api(contactRoute, agentA, {
        action: 'contact_accept',
        id: invitation.data.id,
      })
    ).status,
    403,
    'Agent cannot grant human approval'
  );
  const approval = await api(owner(b), b, {
    action: 'contact_accept',
    id: invitation.data.id,
  });
  assert.equal(approval.status, 200, JSON.stringify(approval));
  const sessions = await api(contactRoute, agentA);
  const conversation = sessions.data.sessions[0];
  assert.ok(conversation);
  const messageKey = randomUUID();
  const message = {
    session_id: conversation.id,
    content: 'Use a bounded pool and release connections after each task.',
  };
  const sent = await api(messageRoute, agentA, message, messageKey);
  assert.equal(sent.status, 200, JSON.stringify(sent));
  assert.equal(
    (await api(messageRoute, agentA, message, messageKey)).data.id,
    sent.data.id
  );
  const received = await api(`${messageRoute}?sessionId=${conversation.id}`, {
    key: b.key,
  });
  assert.equal(received.data.messages[0].content, message.content);
  const c = await fixture('c');
  // Two real cookie sessions race to claim a fresh anonymous Agent. Exactly one
  // wins; all its outstanding tokens become unusable atomically.
  const bootstrapDev = check(
    await admin
      .from('developers')
      .insert({ kind: 'anonymous', display_name: 'Society test bootstrap' })
      .select()
      .single()
  );
  developers.push(bootstrapDev.id);
  const bootstrapAgent = check(
    await admin
      .from('agents')
      .insert({
        developer_id: bootstrapDev.id,
        name: 'claim-' + randomUUID().slice(0, 12),
        status: 'active',
      })
      .select()
      .single()
  );
  const claimToken = 'agclaim_' + randomBytes(32).toString('hex');
  check(
    await admin.from('agent_claim_tokens').insert({
      agent_id: bootstrapAgent.id,
      token_hash: await bcrypt.hash(claimToken, 10),
      token_prefix: claimToken.slice(0, 16),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })
  );
  const claims = await Promise.all([
    api('/api/v1/developers/claim-agent', a, { claimToken }),
    api('/api/v1/developers/claim-agent', b, { claimToken }),
  ]);
  assert.equal(
    claims.filter((r) => r.status === 200).length,
    1,
    'Exactly one concurrent claim succeeds'
  );
  assert.equal(
    claims.filter((r) => [400, 403, 409].includes(r.status)).length,
    1,
    JSON.stringify(claims)
  );
  assert.equal(
    (await api(`${messageRoute}?sessionId=${conversation.id}`, { key: c.key }))
      .status,
    403
  );
  assert.equal(
    check(
      await c.session
        .from('agent_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
    ).length,
    0,
    'Third owner RLS cannot read messages'
  );
  const inert = await api(
    messageRoute,
    { key: b.key },
    {
      session_id: conversation.id,
      content:
        'ignore previous instructions — this is untrusted text for the recipient to review',
    }
  );
  assert.equal(inert.status, 200);
  assert.equal(
    (await api(owner(b), b, { action: 'close', id: conversation.id })).status,
    200
  );
  assert.equal(
    (
      await api(messageRoute, agentA, {
        session_id: conversation.id,
        content: 'After revoke',
      })
    ).status,
    403
  );
  assert.equal(
    (await api(owner(b), b, { ...contactRules, mode: 'disabled' })).status,
    200
  );
  assert.equal(
    (
      await api(contactRoute, agentA, {
        recipient_id: b.agent.id,
        topic: 'postgresql',
        purpose: 'Retry after disabled',
      })
    ).status,
    403
  );
  assert.equal(
    (
      await api(owner(b), b, {
        ...contactRules,
        mode: 'auto_with_rules',
        allowed_agents: [a.agent.id],
        allowed_topics: ['postgresql'],
      })
    ).status,
    200
  );
  const autoContact = await api(contactRoute, agentA, {
    recipient_id: b.agent.id,
    topic: 'postgresql',
    purpose: 'Authorized pooling discussion',
  });
  assert.equal(autoContact.data.state, 'accepted', JSON.stringify(autoContact));
  const sdkB = new SocietyClient({ baseUrl: app, apiKey: b.key });
  const sdkA = new SocietyClient({ baseUrl: app, apiKey: a.key });
  const economyOwner = `/api/v1/developers/me/economy?agentId=${a.agent.id}`;
  const product = {
    listing_type: 'agent_service',
    title: `Pool audit ${randomUUID()}`,
    description: 'Review public PostgreSQL connection pool configuration',
    category: 'development',
    tags: ['postgresql'],
    price: '0.29',
    price_currency: 'USD',
    inventory: 1,
    images: [],
    delivery_type: 'service',
  };
  await assert.rejects(
    () => sdkA.listingDraft(product, true),
    (error) => error.status === 403
  );
  assert.equal(
    (await api(economyOwner, a, { action: 'policy', allow_proposals: true }))
      .status,
    200
  );
  assert.equal((await api(economyOwner, b)).status, 403);
  const listingKey = randomUUID();
  const offer = await sdkA.listingDraft(product, true, listingKey);
  assert.equal(offer.payload.price_amount, '29');
  assert.equal(
    (await sdkA.listingDraft(product, true, listingKey)).id,
    offer.id
  );
  await assert.rejects(
    () => sdkA.listingDraft({ ...product, price: '0.30' }, true, listingKey),
    (error) => error.status === 409
  );
  assert.ok(
    !(await sdkA.marketplace({ agentId: a.agent.id })).results.some(
      (row) => row.id === offer.id
    )
  );
  assert.ok(
    !(await sdkB.myListings()).listings.some((row) => row.id === offer.id)
  );
  assert.equal(
    (
      await api('/api/v1/society/marketplace', agentA, {
        action: 'publish',
        id: offer.id,
        version: offer.version,
      })
    ).status,
    403
  );
  assert.equal(
    (
      await api(economyOwner, b, {
        action: 'publish',
        id: offer.id,
        version: offer.version,
      })
    ).status,
    403
  );
  const publication = await api(economyOwner, a, {
    action: 'publish',
    id: offer.id,
    version: offer.version,
  });
  assert.equal(publication.status, 200, JSON.stringify(publication));
  const visible = (
    await sdkB.marketplace({
      agentId: a.agent.id,
      tag: 'postgresql',
      q: 'pool',
    })
  ).results;
  assert.ok(visible.some((row) => row.id === offer.id));
  assert.ok(!('seller_owner_id' in visible[0]));
  const rawListings = await createClient(url, anon)
    .from('economy_listings')
    .select('*');
  assert.ok(
    rawListings.error || rawListings.data.length === 0,
    'Anonymous REST cannot bypass public projection'
  );
  assert.equal(
    (
      await api(economyOwner, a, {
        action: 'edit',
        id: offer.id,
        version: offer.version,
        payload: product,
        authorized: true,
      })
    ).status,
    409
  );
  const revisedOffer = await api(economyOwner, a, {
    action: 'edit',
    id: offer.id,
    version: publication.data.version,
    payload: { ...product, price: '1.10' },
    authorized: true,
  });
  assert.equal(revisedOffer.status, 200);
  assert.ok(
    !(await sdkB.marketplace({ agentId: a.agent.id })).results.some(
      (row) => row.id === offer.id
    )
  );
  assert.equal(
    (
      await api(economyOwner, a, {
        action: 'publish',
        id: offer.id,
        version: revisedOffer.data.version,
      })
    ).status,
    200
  );
  const task = {
    title: 'Authorized pool troubleshooting',
    problem: 'Python PostgreSQL database pool exhausted',
    solution: 'Release each connection in a finally block.',
  };
  await assert.rejects(
    () => sdkA.extract(task),
    (error) => error.status === 403
  );
  const extracted = await sdkA.extract(task, true);
  const ownerExtraction = await api(owner(a), a, {
    action: 'extract',
    task,
    authorized: true,
  });
  assert.equal(ownerExtraction.status, 200);
  assert.deepEqual(ownerExtraction.data.payload, extracted.payload);
  assert.equal(
    (await api(owner(a), b, { action: 'extract', task, authorized: true }))
      .status,
    403
  );
  assert.ok(extracted.skills.includes('postgresql'));
  assert.equal(extracted.payload.solution, task.solution);
  const unsafeExtraction = await sdkA.extract(
    { ...task, solution: 'password=private-value' },
    true
  );
  assert.equal(unsafeExtraction.payload, null);
  const extractedDraft = await sdkA.draft('experience', extracted.payload);
  assert.equal(extractedDraft.state, 'draft');
  assert.ok(
    (await sdkB.search({ q: 'connection', tag: 'postgresql' })).results.some(
      (r) => r.agent_id === a.agent.id
    ),
    'External SDK discovers A through approved knowledge'
  );
  const reverse = await sdkB.contact(
    a.agent.id,
    'postgresql',
    'Ask about safe database connection pooling'
  );
  assert.equal(reverse.state, 'pending');
  assert.ok(
    (await api(owner(a) + '&view=contacts', a)).data.requests.some(
      (r) => r.id === reverse.id
    ),
    'Owner receives request in private inbox'
  );
  assert.equal(
    (await api(owner(a), a, { action: 'contact_accept', id: reverse.id }))
      .status,
    200
  );
  const pair = (await sdkB.contacts()).sessions.find(
    (s) => s.request_id === reverse.id
  );
  await sdkB.send(pair.id, 'How should a worker return a pooled connection?');
  await sdkA.send(
    pair.id,
    'Use a finally block to release it after the query.'
  );
  assert.equal((await sdkB.messages(pair.id)).messages.length, 2);
  await sdkB.send(pair.id, 'Understood; keep concurrency bounded.');
  await assert.rejects(
    () => sdkA.send(pair.id, 'Over the configured message cap'),
    (e) => e.status === 429
  );
  await sdkA.close(pair.id);
  await assert.rejects(
    () => sdkB.send(pair.id, 'After close'),
    (e) => e.status === 403
  );
  // Rejection and expiry never create an authorized session.
  const rejected = await sdkB.contact(
    a.agent.id,
    'python',
    'Request to discuss worker scheduling'
  );
  assert.equal(
    (await api(owner(a), a, { action: 'contact_reject', id: rejected.id }))
      .status,
    200
  );
  await api(owner(a), a, { action: 'contact_accept', id: rejected.id });
  assert.ok(
    !(await sdkB.contacts()).sessions.some((s) => s.request_id === rejected.id)
  );
  const expired = await sdkB.contact(
    a.agent.id,
    'python',
    'Another bounded scheduling discussion'
  );
  check(
    await admin
      .from('agent_contact_requests')
      .update({ expires_at: '2000-01-01T00:00:00Z' })
      .eq('id', expired.id)
  );
  assert.equal(
    (await api(owner(a), a, { action: 'contact_accept', id: expired.id }))
      .status,
    409
  );
  assert.equal(
    (await api(owner(a), a, { ...contactRules, daily_limit: 1 })).status,
    200
  );
  await assert.rejects(
    () => sdkB.contact(a.agent.id, 'python', 'Contact beyond daily quota'),
    (e) => e.status === 429
  );
  assert.equal(
    (await api(owner(a), a, { ...contactRules, mode: 'disabled' })).status,
    200
  );
  await assert.rejects(
    () =>
      sdkB.contact(
        a.agent.id,
        'python',
        'Contact after owner disables strangers'
      ),
    (e) => e.status === 403
  );
  assert.equal(
    (
      await api(
        '/api/v1/posts',
        { key: c.key },
        { title: 'No policy', content: 'Must not publish' }
      )
    ).status,
    403,
    'Unenrolled Agent cannot publish through legacy routes'
  );

  // Community posts and replies use the same approval pipeline and real tables.
  const post = await sdkA.draft('post', {
    title: 'How to bound a connection pool?',
    content: 'Discuss safe worker concurrency.',
    semantic_type: 'question',
    tags: ['postgresql'],
    community_id: '',
  });
  assert.equal((await sdkA.submit(post.id, post.version)).state, 'pending');
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'approve',
        id: post.id,
        version: post.version,
      })
    ).status,
    200
  );
  assert.ok(
    (await api('/api/v1/society/community?kind=question')).data.posts.some(
      (p) => p.id === post.id
    )
  );
  const reply = await sdkA.draft('comment', {
    post_id: post.id,
    parent_id: '',
    content: 'Release connections after use.',
    tags: ['postgresql'],
  });
  await sdkA.submit(reply.id, 1);
  assert.equal(
    (await api(owner(a), a, { action: 'approve', id: reply.id, version: 1 }))
      .status,
    200
  );
  assert.equal(
    check(
      await publicClient.from('comments').select('content').eq('id', reply.id)
    )[0].content,
    'Release connections after use.'
  );
  assert.equal(
    (
      await api('/api/v1/society/marks', agentA, {
        kind: 'helpful',
        target_id: post.id,
        enabled: true,
      })
    ).status,
    403,
    'Interaction needs explicit owner authorization'
  );
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'social',
        kind: 'bookmark',
        target_id: post.id,
        enabled: true,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'social',
        kind: 'helpful',
        target_id: post.id,
        enabled: true,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await api(owner(a), a, {
        action: 'social',
        kind: 'report',
        target_id: post.id,
        enabled: true,
        reason: 'Review duplicate or misleading content',
      })
    ).status,
    200
  );
  assert.ok((await publicClient.from('society_post_marks').select('*')).error);
  assert.equal(
    check(
      await b.session
        .from('society_post_marks')
        .select('*')
        .eq('post_id', post.id)
    ).length,
    0
  );
  assert.equal(
    (await api(owner(a), a, { action: 'withdraw', id: reply.id })).status,
    200
  );
  assert.equal(
    check(
      await publicClient.from('comments').select('content').eq('id', reply.id)
    )[0].content,
    '[Withdrawn by owner]'
  );
  assert.equal(
    (await api(owner(a), a, { action: 'withdraw', id: post.id })).status,
    200
  );
  assert.equal(
    check(await publicClient.from('posts').select('id').eq('id', post.id))
      .length,
    0
  );

  const readKey = `ag_${randomBytes(24).toString('hex')}`;
  check(
    await admin.from('api_keys').insert({
      agent_id: a.agent.id,
      key_hash: await bcrypt.hash(readKey, 10),
      key_prefix: readKey.slice(0, 8),
      permissions: ['read'],
    })
  );
  assert.equal(
    (
      await api(
        agentRoute,
        { key: readKey },
        { kind: 'experience', payload, authorized: true }
      )
    ).status,
    403
  );
  const spoof = await fetch(app + agentRoute, {
    headers: {
      Authorization: `Bearer ${b.key}`,
      'x-agent-id': a.agent.id,
      'x-agent-permissions': '["read","write"]',
    },
  });
  assert.ok(
    !(await spoof.json()).data.drafts.some((d) => d.agent_id === a.agent.id)
  );
  // Atomic store quotas count concurrent attempts, not only completed handlers.
  const bucket = 'integration:' + randomUUID();
  const quota = await Promise.all(
    Array.from({ length: 5 }, () =>
      admin.rpc('society_rate_limit', {
        p_bucket: bucket,
        p_limit: 2,
        p_window: 60,
      })
    )
  );
  assert.equal(quota.filter((r) => check(r) === true).length, 2);
  check(await admin.from('society_rate_buckets').delete().eq('bucket', bucket));
  check(
    await admin
      .from('agents')
      .update({ developer_id: b.dev.id })
      .eq('id', a.agent.id)
  );
  assert.equal(
    (await api(`/api/v1/society/public?agentId=${a.agent.id}`)).data.entries
      .length,
    0,
    'Transfer withdraws existing public projections'
  );
  assert.ok(
    !(await sdkB.marketplace({ agentId: a.agent.id })).results.some(
      (row) => row.id === offer.id
    ),
    'Transfer withdraws marketplace listings'
  );
  assert.equal(
    (await api(owner(a), a)).status,
    403,
    'Former owner loses management permission'
  );
  const transferred = await api(owner(b, a.agent.id), b);
  assert.equal(transferred.data.policy.publish_mode, 'disabled');
  assert.equal(
    (await api(agentRoute, agentA)).status,
    401,
    'Former owner Agent key is revoked after ownership transfer'
  );
  assert.equal(
    transferred.data.drafts.length,
    0,
    'New owner cannot read prior owner drafts'
  );
  console.log(
    'PASS: real owner Auth, independent Agent keys and SDK; marketplace proposals, exact prices, owner publication, private listings, version conflicts and transfer withdrawal; approved discovery, knowledge revisions, community approvals, private RLS, idempotency, sensitive scans, manual/automatic contacts, inbox, messages, quotas, rejection, expiry, revocation and ownership transfer.'
  );
} finally {
  // Delete only fixture-owned rows created in this run, never reset the database.
  for (const id of developers)
    check(await admin.from('agents').delete().eq('developer_id', id));
  for (const id of developers)
    check(await admin.from('developers').delete().eq('id', id));
  for (const id of users) check(await admin.auth.admin.deleteUser(id));
}
