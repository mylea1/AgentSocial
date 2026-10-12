import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@agentgram/db';
import { type Principal, databaseError } from './service';
import {
  fields,
  object,
  sensitiveFindings,
  SocietyError,
  text,
  uuid,
  validatePayload,
} from './validation';

export async function corrections(p: Principal, page = 1) {
  const db = getSupabaseServiceClient();
  const entries = await db
    .from('knowledge_entries')
    .select('id')
    .eq('author_agent_id', p.agentId);
  databaseError(entries.error);
  const { data, error } = await db
    .from('knowledge_corrections')
    .select('*')
    .or(
      `proposer_agent_id.eq.${p.agentId},entry_id.in.(${(entries.data || []).map((e) => e.id).join(',') || '00000000-0000-0000-0000-000000000000'})`
    )
    .order('created_at', { ascending: false })
    .order('id')
    .range((page - 1) * 50, page * 50 - 1);
  databaseError(error);
  return (data || []).filter(
    (c) =>
      c.proposer_agent_id !== p.agentId ||
      c.proposer_developer_id === p.developerId
  );
}
export async function correct(
  req: NextRequest,
  p: Principal,
  value: Record<string, unknown>
) {
  const db = getSupabaseServiceClient();
  if (['accept', 'reject'].includes(String(value.action))) {
    fields(value, ['action', 'id']);
    const { data, error } = await db.rpc('society_decide_correction', {
      p_agent: p.agentId,
      p_id: uuid(value.id),
      p_accept: value.action === 'accept',
    });
    databaseError(error);
    return { draft_id: data };
  }
  fields(value, [
    'action',
    'entry_id',
    'base_version',
    'payload',
    'authorized',
  ]);
  if (value.authorized !== true)
    throw new SocietyError('SOURCE_AUTHORIZATION_REQUIRED', 403);
  const id = uuid(value.entry_id);
  const { data: entry, error } = await db
    .from('knowledge_entries')
    .select('version,content_type')
    .eq('id', id)
    .maybeSingle();
  databaseError(error);
  if (!entry || entry.version !== value.base_version)
    throw new SocietyError('STALE_REVISION', 409);
  const payload = validatePayload('knowledge', value.payload);
  const key = text(req.headers.get('idempotency-key'), 128);
  if (key.length < 8) throw new SocietyError('INVALID_IDEMPOTENCY_KEY');
  const existing = await db
    .from('knowledge_corrections')
    .select('*')
    .eq('proposer_agent_id', p.agentId)
    .eq('request_key', key)
    .maybeSingle();
  databaseError(existing.error);
  if (existing.data) {
    if (
      existing.data.entry_id !== id ||
      existing.data.proposer_developer_id !== p.developerId ||
      Object.keys(payload).some(
        (k) =>
          JSON.stringify(payload[k]) !==
          JSON.stringify(object(existing.data!.payload)[k])
      )
    )
      throw new SocietyError('IDEMPOTENCY_CONFLICT', 409);
    return existing.data;
  }
  const result = await db
    .from('knowledge_corrections')
    .insert({
      entry_id: id,
      base_version: entry.version,
      proposer_agent_id: p.agentId,
      proposer_developer_id: p.developerId,
      payload,
      findings: sensitiveFindings(payload),
      request_key: key,
    })
    .select()
    .single();
  databaseError(result.error);
  return result.data;
}
