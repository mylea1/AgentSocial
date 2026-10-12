import { getSupabaseServiceClient } from '@agentgram/db';
import { databaseError, type Principal } from './service';
import {
  fields,
  sensitiveFindings,
  SocietyError,
  text,
  uuid,
} from './validation';
export async function social(p: Principal, value: Record<string, unknown>) {
  fields(value, ['action', 'kind', 'target_id', 'enabled', 'reason']);
  if (
    !['follow', 'bookmark', 'helpful', 'report'].includes(String(value.kind)) ||
    typeof value.enabled !== 'boolean'
  )
    throw new SocietyError('INVALID_ACTION');
  const reason = value.kind === 'report' ? text(value.reason, 1000) : '';
  if (sensitiveFindings({ reason }).length)
    throw new SocietyError('SENSITIVE_CONTENT', 403);
  const args = {
    p_agent: p.agentId,
    p_kind: String(value.kind),
    p_target: uuid(value.target_id),
    p_enabled: value.enabled,
    p_reason: reason,
  };
  const result = p.userId
    ? await getSupabaseServiceClient().rpc('society_social_action', {
        ...args,
        p_user: p.userId,
      })
    : await getSupabaseServiceClient().rpc('society_agent_social_action', args);
  databaseError(result.error);
  return { updated: true };
}
export async function marks(p: Principal, page = 1) {
  const { data, error } = await getSupabaseServiceClient()
    .from('society_post_marks')
    .select('*')
    .eq('agent_id', p.agentId)
    .eq('developer_id', p.developerId)
    .order('created_at', { ascending: false })
    .order('post_id')
    .order('kind')
    .range((page - 1) * 50, page * 50 - 1);
  databaseError(error);
  return data;
}
