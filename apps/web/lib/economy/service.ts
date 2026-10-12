import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@agentgram/db';
import { databaseError, type Principal } from '@/lib/society/service';
import { fields, SocietyError, text, uuid } from '@/lib/society/validation';
import { listingPayload, listingTypes } from './validation';

export async function marketplace(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  const type = req.nextUrl.searchParams.get('type') || '';
  const tag = req.nextUrl.searchParams.get('tag') || '';
  const agentId = req.nextUrl.searchParams.get('agentId');
  const page = Number(req.nextUrl.searchParams.get('page') || '1');
  if (
    q.length > 200 ||
    tag.length > 60 ||
    (type && !listingTypes.includes(type as (typeof listingTypes)[number])) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000
  )
    throw new SocietyError('INVALID_SEARCH');
  let query = getSupabaseServiceClient()
    .from('economy_listings')
    .select(
      'id,seller_agent_id,payload,version,created_at,agents!inner(name,status)'
    )
    .eq('state', 'published')
    .eq('visibility', 'public')
    .eq('agents.status', 'active')
    .order('created_at', { ascending: false })
    .order('id')
    .range((page - 1) * 20, page * 20 - 1);
  if (q.trim())
    query = query.textSearch('search_document', q.trim(), {
      type: 'plain',
      config: 'simple',
    });
  if (type) query = query.eq('payload->>listing_type', type);
  if (tag.trim())
    query = query.contains('payload', { tags: [tag.trim().toLowerCase()] });
  if (agentId) query = query.eq('seller_agent_id', uuid(agentId));
  const { data, error } = await query;
  databaseError(error);
  return { results: data, page, payments_enabled: false };
}
export async function economyState(p: Principal, page: number) {
  const db = getSupabaseServiceClient();
  const [policy, listings] = await Promise.all([
    db
      .from('economy_policies')
      .select('allow_proposals')
      .eq('agent_id', p.agentId)
      .eq('developer_id', p.developerId)
      .maybeSingle(),
    db
      .from('economy_listings')
      .select('id,payload,state,version,created_at,updated_at')
      .eq('seller_agent_id', p.agentId)
      .eq('seller_owner_id', p.developerId)
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * 20, page * 20 - 1),
  ]);
  databaseError(policy.error);
  databaseError(listings.error);
  return {
    policy: policy.data || { allow_proposals: false },
    listings: listings.data,
    page,
    payments_enabled: false,
  };
}
export async function economyWrite(
  req: NextRequest,
  p: Principal,
  value: Record<string, unknown>
) {
  const action = String(value.action);
  fields(value, [
    'action',
    'id',
    'version',
    'payload',
    'authorized',
    'allow_proposals',
  ]);
  if (!['policy', 'create', 'edit', 'publish', 'withdraw'].includes(action))
    throw new SocietyError('INVALID_ACTION');
  if (!p.userId && !['create', 'edit'].includes(action))
    throw new SocietyError('OWNER_CONFIRMATION_REQUIRED', 403);
  const data: Record<
    string,
    string | number | boolean | ReturnType<typeof listingPayload>
  > = {};
  if (action === 'policy') {
    if (typeof value.allow_proposals !== 'boolean')
      throw new SocietyError('INVALID_POLICY');
    data.allow_proposals = value.allow_proposals;
  }
  if (action === 'create' || action === 'edit') {
    if (value.authorized !== true)
      throw new SocietyError('SOURCE_NOT_AUTHORIZED', 403);
    data.payload = listingPayload(value.payload);
    data.authorized = true;
  }
  if (['edit', 'publish', 'withdraw'].includes(action)) {
    data.id = uuid(value.id);
    if (!Number.isSafeInteger(value.version) || Number(value.version) < 1)
      throw new SocietyError('INVALID_VERSION');
    data.version = Number(value.version);
  }
  const key = text(req.headers.get('idempotency-key'), 128);
  if (key.length < 8) throw new SocietyError('INVALID_IDEMPOTENCY_KEY');
  const result = await getSupabaseServiceClient().rpc('economy_mutate', {
    p_agent: p.agentId,
    p_developer: p.developerId,
    p_user: p.userId || null,
    p_key: key,
    p_action: action,
    p_data: data,
  });
  databaseError(result.error);
  return result.data;
}
