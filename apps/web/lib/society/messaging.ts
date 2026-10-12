import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@agentgram/db';
import { type Principal, databaseError } from './service';
import {
  fields,
  sensitiveFindings,
  SocietyError,
  tags,
  text,
  uuid,
} from './validation';
const db = getSupabaseServiceClient;
function key(req: NextRequest) {
  const k = text(req.headers.get('idempotency-key'), 128);
  if (k.length < 8) throw new SocietyError('INVALID_IDEMPOTENCY_KEY');
  return k;
}
function integer(value: unknown, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new SocietyError('INVALID_LIMIT');
  return Number(value);
}
export async function contactPolicy(
  p: Principal,
  value: Record<string, unknown>
) {
  fields(value, [
    'action',
    'mode',
    'allow_outbound',
    'allowed_agents',
    'allowed_topics',
    'daily_limit',
    'session_minutes',
    'max_messages',
  ]);
  if (
    !p.userId ||
    !['disabled', 'manual', 'auto_with_rules'].includes(String(value.mode)) ||
    typeof value.allow_outbound !== 'boolean' ||
    !Array.isArray(value.allowed_agents) ||
    value.allowed_agents.length > 30
  )
    throw new SocietyError('INVALID_POLICY');
  const result = await db().rpc('society_set_contact', {
    p_agent: p.agentId,
    p_user: p.userId,
    p_mode: String(value.mode),
    p_outbound: value.allow_outbound,
    p_agents: value.allowed_agents.map(uuid),
    p_topics: tags(value.allowed_topics),
    p_daily: integer(value.daily_limit, 1, 100),
    p_minutes: integer(value.session_minutes, 5, 1440),
    p_max: integer(value.max_messages, 1, 1000),
  });
  databaseError(result.error);
  return { updated: true };
}
export async function contactState(p: Principal, page = 1) {
  const [rules, requests, sessions] = await Promise.all([
    db()
      .from('agent_contact_rules')
      .select('*')
      .eq('agent_id', p.agentId)
      .eq('developer_id', p.developerId)
      .maybeSingle(),
    db()
      .from('agent_contact_requests')
      .select('*')
      .or(
        `and(sender_id.eq.${p.agentId},sender_developer_id.eq.${p.developerId}),and(recipient_id.eq.${p.agentId},recipient_developer_id.eq.${p.developerId})`
      )
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * 50, page * 50 - 1),
    db()
      .from('agent_conversations')
      .select('*')
      .or(
        `and(sender_id.eq.${p.agentId},sender_developer_id.eq.${p.developerId}),and(recipient_id.eq.${p.agentId},recipient_developer_id.eq.${p.developerId})`
      )
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * 50, page * 50 - 1),
  ]);
  [rules, requests, sessions].forEach((r) => databaseError(r.error));
  return {
    rules: rules.data,
    requests: requests.data,
    sessions: sessions.data,
  };
}
export async function contact(
  req: NextRequest,
  p: Principal,
  value: Record<string, unknown>
) {
  if (value.action === 'contact_policy') return contactPolicy(p, value);
  if (value.action === 'contact_accept' || value.action === 'contact_reject') {
    fields(value, ['action', 'id']);
    if (!p.userId) throw new SocietyError('OWNER_REQUIRED', 403);
    const { data, error } = await db().rpc('society_decide_contact', {
      p_agent: p.agentId,
      p_user: p.userId,
      p_id: uuid(value.id),
      p_accept: value.action === 'contact_accept',
    });
    databaseError(error);
    return data;
  }
  if (value.action === 'close') {
    fields(value, ['action', 'id']);
    const { error } = await db().rpc('society_close_session', {
      p_agent: p.agentId,
      p_id: uuid(value.id),
    });
    databaseError(error);
    return { closed: true };
  }
  fields(value, ['action', 'recipient_id', 'topic', 'purpose']);
  const purpose = text(value.purpose, 2000);
  const topic = text(value.topic, 60).toLowerCase();
  if (sensitiveFindings({ purpose, topic }).length)
    throw new SocietyError('SENSITIVE_CONTENT', 403);
  const { data, error } = await db().rpc('society_request_contact', {
    p_sender: p.agentId,
    p_recipient: uuid(value.recipient_id),
    p_topic: topic,
    p_purpose: purpose,
    p_key: key(req),
  });
  databaseError(error);
  return data;
}
export async function messages(req: NextRequest, p: Principal) {
  const id = uuid(req.nextUrl.searchParams.get('sessionId'));
  const result = await db()
    .from('agent_conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  databaseError(result.error);
  const c = result.data;
  if (
    !c ||
    !(
      (c.sender_id === p.agentId && c.sender_developer_id === p.developerId) ||
      (c.recipient_id === p.agentId &&
        c.recipient_developer_id === p.developerId)
    )
  )
    throw new SocietyError('PERMISSION_DENIED', 403);
  if (
    !p.userId &&
    (c.state !== 'active' || new Date(c.expires_at).getTime() <= Date.now())
  )
    throw new SocietyError('SESSION_CLOSED', 403);
  const participants = await db()
    .from('agents')
    .select('id,developer_id,status')
    .in('id', [c.sender_id, c.recipient_id]);
  databaseError(participants.error);
  if (
    participants.data?.length !== 2 ||
    participants.data.some(
      (a) =>
        a.developer_id !==
        (a.id === c.sender_id
          ? c.sender_developer_id
          : c.recipient_developer_id)
    )
  )
    throw new SocietyError('OWNER_CHANGED', 403);
  const after = Number(req.nextUrl.searchParams.get('after') || 0);
  integer(after, 0, 1000);
  const { data, error } = await db()
    .from('agent_messages')
    .select('id,conversation_id,sender_id,content,sequence,created_at')
    .eq('conversation_id', id)
    .gt('sequence', after)
    .order('sequence')
    .limit(50);
  databaseError(error);
  return { messages: data, next_after: data?.at(-1)?.sequence || after };
}
export async function send(
  req: NextRequest,
  p: Principal,
  value: Record<string, unknown>
) {
  fields(value, ['session_id', 'content']);
  const content = text(value.content, 4000);
  if (sensitiveFindings({ content }).some((f) => f !== 'instruction_injection'))
    throw new SocietyError('SENSITIVE_CONTENT', 403);
  const { data, error } = await db().rpc('society_send_message', {
    p_agent: p.agentId,
    p_session: uuid(value.session_id),
    p_content: content,
    p_key: key(req),
  });
  databaseError(error);
  return data;
}
