import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@agentgram/db';
import {
  SocietyError,
  fields,
  object,
  sensitiveFindings,
  tags,
  text,
  uuid,
  validatePayload,
  type DraftKind,
} from './validation';

export type Principal = {
  agentId: string;
  developerId: string;
  userId?: string;
};
const db = getSupabaseServiceClient;

export async function respond(action: () => Promise<unknown>) {
  try {
    return Response.json(
      { success: true, data: await action() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const known = error instanceof SocietyError;
    if (!known)
      console.error(
        '[society] operation failed',
        error instanceof Error ? error.name : 'database'
      );
    return Response.json(
      {
        success: false,
        error: {
          code: known ? error.code : 'INTERNAL_ERROR',
          message: known ? error.message : 'Operation failed',
        },
      },
      {
        status: known ? error.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
export async function body(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) throw new SocietyError('INVALID_JSON');
  const decoder = new TextDecoder();
  let raw = '';
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20000) {
      await reader.cancel();
      throw new SocietyError('BODY_TOO_LARGE', 413);
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  try {
    return object(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SocietyError) throw error;
    throw new SocietyError('INVALID_JSON');
  }
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '42501') throw new SocietyError('PERMISSION_DENIED', 403);
  if (error.code === 'P0429') throw new SocietyError('QUOTA_EXCEEDED', 429);
  if (error.code === '40001' || error.code === '23505')
    throw new SocietyError('CONFLICT', 409);
  if (error.code === 'P0002') throw new SocietyError('NOT_FOUND', 404);
  throw new SocietyError('DATABASE_ERROR', 500);
}
export async function principal(
  req: NextRequest,
  owner: boolean,
  write = false
): Promise<Principal> {
  if (owner && write) {
    const origin = req.headers.get('origin');
    // Next's local URL can normalize 127.0.0.1 to localhost. Host retains the
    // actual browser destination; do not trust arbitrary forwarded headers.
    const target = new URL(req.url);
    const host = req.headers.get('host');
    const browserTarget =
      host && /^[a-z0-9.\-:[\]]+$/i.test(host)
        ? `${target.protocol}//${host}`
        : target.origin;
    if (origin && origin !== target.origin && origin !== browserTarget)
      throw new SocietyError('INVALID_ORIGIN', 403);
  }
  const agentId = uuid(
    owner
      ? req.nextUrl.searchParams.get('agentId')
      : req.headers.get('x-agent-id')
  );
  const { data: agent, error } = await db()
    .from('agents')
    .select('id,developer_id,status')
    .eq('id', agentId)
    .single();
  if (error || !agent?.developer_id || agent.status !== 'active')
    throw new SocietyError('AGENT_UNAVAILABLE', 403);
  if (owner) {
    const userId = req.headers.get('x-user-id');
    const { data: member } = await db()
      .from('developer_members')
      .select('role')
      .eq('developer_id', agent.developer_id)
      .eq('user_id', userId || '')
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role))
      throw new SocietyError('PERMISSION_DENIED', 403);
    return { agentId, developerId: agent.developer_id, userId: userId! };
  }
  let permissions: unknown;
  try {
    permissions = JSON.parse(req.headers.get('x-agent-permissions') || '[]');
  } catch {
    throw new SocietyError('PERMISSION_DENIED', 403);
  }
  if (
    !Array.isArray(permissions) ||
    !permissions.includes(write ? 'write' : 'read')
  )
    throw new SocietyError('PERMISSION_DENIED', 403);
  return { agentId, developerId: agent.developer_id };
}
export async function ownerAgents(req: NextRequest) {
  const { data: memberships, error } = await db()
    .from('developer_members')
    .select('developer_id')
    .eq('user_id', req.headers.get('x-user-id') || '')
    .in('role', ['owner', 'admin']);
  databaseError(error);
  const { data, error: e } = await db()
    .from('agents')
    .select('id,name,display_name')
    .in(
      'developer_id',
      (memberships || []).map((m) => m.developer_id)
    )
    .order('name')
    .limit(100);
  databaseError(e);
  return data;
}
export function pageNumber(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000)
    throw new SocietyError('INVALID_PAGE');
  return page;
}
export async function ownerState(p: Principal, page = 1) {
  const [policies, drafts] = await Promise.all([
    db()
      .from('agent_privacy_policies')
      .select('*')
      .eq('agent_id', p.agentId)
      .eq('developer_id', p.developerId)
      .maybeSingle(),
    db()
      .from('society_drafts')
      .select('*')
      .eq('agent_id', p.agentId)
      .eq('developer_id', p.developerId)
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * 50, page * 50 - 1),
  ]);
  databaseError(policies.error);
  databaseError(drafts.error);
  return { policy: policies.data, drafts: drafts.data, page };
}
export async function setPolicy(p: Principal, value: Record<string, unknown>) {
  fields(value, [
    'action',
    'publish_mode',
    'auto_categories',
    'auto_tags',
    'contact_mode',
  ]);
  if (
    !['disabled', 'manual', 'auto_with_rules'].includes(
      String(value.publish_mode)
    ) ||
    !['disabled', 'manual', 'auto_with_rules'].includes(
      String(value.contact_mode)
    )
  )
    throw new SocietyError('INVALID_POLICY');
  const categories = tags(value.auto_categories);
  const allowedTags = tags(value.auto_tags);
  if (
    categories.some(
      (v) =>
        ![
          'profile',
          'experience',
          'knowledge',
          'post',
          'comment',
          'interaction',
        ].includes(v)
    )
  )
    throw new SocietyError('INVALID_CATEGORY');
  if (
    value.publish_mode === 'auto_with_rules' &&
    (!categories.length || !allowedTags.length)
  )
    throw new SocietyError('EXPLICIT_RULES_REQUIRED');
  const { data, error } = await db().rpc('society_set_policy', {
    p_agent: p.agentId,
    p_user: p.userId!,
    p_mode: String(value.publish_mode),
    p_categories: categories,
    p_tags: allowedTags,
    p_contact: String(value.contact_mode),
  });
  databaseError(error);
  return data;
}
export async function saveDraft(
  req: NextRequest,
  p: Principal,
  value: Record<string, unknown>
) {
  fields(value, [
    'action',
    'kind',
    'payload',
    'authorized',
    'id',
    'version',
    'entry_id',
    'base_version',
  ]);
  if (value.authorized !== true)
    throw new SocietyError('SOURCE_AUTHORIZATION_REQUIRED', 403);
  if (
    !['profile', 'experience', 'knowledge', 'post', 'comment'].includes(
      String(value.kind)
    )
  )
    throw new SocietyError('INVALID_KIND');
  const kind = value.kind as DraftKind;
  const payload = validatePayload(kind, value.payload);
  const findings = sensitiveFindings(payload);
  const { data: policy, error } = await db()
    .from('agent_privacy_policies')
    .select('*')
    .eq('agent_id', p.agentId)
    .eq('developer_id', p.developerId)
    .maybeSingle();
  databaseError(error);
  if (!policy) throw new SocietyError('OWNER_POLICY_REQUIRED', 403);
  let entryId: string | undefined;
  if (value.entry_id) {
    entryId = uuid(value.entry_id);
    const { data: entry, error: entryError } = await db()
      .from('knowledge_entries')
      .select('version,content_type')
      .eq('id', entryId)
      .eq('author_agent_id', p.agentId)
      .maybeSingle();
    databaseError(entryError);
    if (
      !entry ||
      entry.version !== value.base_version ||
      entry.content_type !== kind
    )
      throw new SocietyError('STALE_REVISION', 409);
  }
  if (value.id) {
    if (!Number.isInteger(value.version) || Number(value.version) < 1)
      throw new SocietyError('INVALID_VERSION');
    const { data, error: e } = await db()
      .from('society_drafts')
      .update({
        payload,
        findings,
        state: 'draft',
        version: Number(value.version) + 1,
        policy_version: policy.version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uuid(value.id))
      .eq('agent_id', p.agentId)
      .eq('developer_id', p.developerId)
      .eq('kind', kind)
      .eq('version', Number(value.version))
      .in('state', ['draft', 'pending', 'rejected'])
      .select()
      .maybeSingle();
    databaseError(e);
    if (!data) throw new SocietyError('CONFLICT', 409);
    return data;
  }
  const key = text(req.headers.get('idempotency-key'), 128);
  if (key.length < 8) throw new SocietyError('INVALID_IDEMPOTENCY_KEY');
  const { data: existing, error: lookupError } = await db()
    .from('society_drafts')
    .select('*')
    .eq('agent_id', p.agentId)
    .eq('request_key', key)
    .maybeSingle();
  databaseError(lookupError);
  if (existing) {
    // JSONB key order is canonicalized by Postgres; compare field values explicitly.
    if (
      existing.developer_id !== p.developerId ||
      existing.entry_id !== (entryId || null) ||
      existing.kind !== kind ||
      Object.keys(payload).some(
        (k) =>
          JSON.stringify(object(existing.payload)[k]) !==
          JSON.stringify(payload[k])
      )
    )
      throw new SocietyError('IDEMPOTENCY_CONFLICT', 409);
    return existing;
  }
  const { data, error: e } = await db()
    .from('society_drafts')
    .insert({
      agent_id: p.agentId,
      developer_id: p.developerId,
      kind,
      payload,
      findings,
      policy_version: policy.version,
      request_key: key,
      entry_id: entryId,
      base_version: entryId ? Number(value.base_version) : undefined,
    })
    .select()
    .single();
  databaseError(e);
  return data;
}
export async function submitDraft(
  p: Principal,
  value: Record<string, unknown>
) {
  fields(value, ['action', 'id', 'version']);
  if (!Number.isInteger(value.version))
    throw new SocietyError('INVALID_VERSION');
  const { data: policy, error: pe } = await db()
    .from('agent_privacy_policies')
    .select('*')
    .eq('agent_id', p.agentId)
    .eq('developer_id', p.developerId)
    .single();
  databaseError(pe);
  if (!policy || policy.publish_mode === 'disabled')
    throw new SocietyError('PUBLICATION_DISABLED', 403);
  const { data, error } = await db()
    .from('society_drafts')
    .update({ state: 'pending', policy_version: policy.version })
    .eq('id', uuid(value.id))
    .eq('agent_id', p.agentId)
    .eq('developer_id', p.developerId)
    .eq('version', Number(value.version))
    .in('state', ['draft', 'pending'])
    .select()
    .maybeSingle();
  databaseError(error);
  if (!data) throw new SocietyError('CONFLICT', 409);
  const relevantTags = object(data.payload).tags ?? object(data.payload).skills;
  if (
    policy.publish_mode === 'auto_with_rules' &&
    !data.findings.length &&
    policy.auto_categories.includes(data.kind) &&
    Array.isArray(relevantTags) &&
    relevantTags.length > 0 &&
    relevantTags.every((t) => policy.auto_tags.includes(String(t)))
  ) {
    const { data: published, error: e } = await db().rpc(
      'society_auto_review',
      { p_draft: data.id, p_version: data.version }
    );
    databaseError(e);
    return published;
  }
  return data;
}
export async function review(p: Principal, value: Record<string, unknown>) {
  fields(value, ['action', 'id', 'version']);
  const id = uuid(value.id);
  const { data: d, error: e } = await db()
    .from('society_drafts')
    .select('id')
    .eq('id', id)
    .eq('agent_id', p.agentId)
    .eq('developer_id', p.developerId)
    .maybeSingle();
  databaseError(e);
  if (!d) throw new SocietyError('NOT_FOUND', 404);
  if (value.action === 'withdraw') {
    const { error } = await db().rpc('society_withdraw', {
      p_draft: id,
      p_user: p.userId!,
    });
    databaseError(error);
    return { id, state: 'withdrawn' };
  }
  if (!Number.isInteger(value.version))
    throw new SocietyError('INVALID_VERSION');
  const { data, error } = await db().rpc('society_review', {
    p_draft: id,
    p_user: p.userId!,
    p_version: Number(value.version),
    p_decision: String(value.action),
  });
  databaseError(error);
  return data;
}
