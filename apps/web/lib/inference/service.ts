import { createHash } from 'node:crypto';
import { getSupabaseServiceClient, type Json } from '@agentgram/db';
import { databaseError, type Principal } from '@/lib/society/service';
import {
  fields,
  object,
  SocietyError,
  text,
  uuid,
} from '@/lib/society/validation';
import { integer } from './metering';
import { MockModelProvider } from './model';

export function enabled() {
  if (process.env.SOCIETY_INFERENCE_SANDBOX !== 'true')
    throw new SocietyError('INFERENCE_DISABLED', 404);
  let host = '';
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname;
  } catch {
    /* fail closed */
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
    throw new SocietyError('LOCAL_SANDBOX_ONLY', 403);
}

// RPC result is intentionally JSON; database functions perform the financial transitions.
async function command(
  p: Principal,
  action: string,
  value: Record<string, Json> = {}
) {
  const swept = await getSupabaseServiceClient().rpc('inference_reconcile', {});
  databaseError(swept.error);
  const { data, error } = await getSupabaseServiceClient().rpc(
    'inference_command',
    {
      p_agent: p.agentId,
      p_owner: p.developerId,
      p_user: p.userId ?? null,
      p_action: action,
      p_value: value,
    }
  );
  if (error?.code === '22023')
    throw new SocietyError('INVALID_INFERENCE_INPUT');
  databaseError(error);
  return data;
}
export async function state(p: Principal) {
  enabled();
  const result = object(await command(p, 'state'));
  const { data, error } = await getSupabaseServiceClient().rpc(
    'inference_budget',
    {
      p_agent: p.agentId,
      p_owner: p.developerId,
      p_user: p.userId ?? null,
      p_value: null,
    }
  );
  databaseError(error);
  return { ...result, budget: data };
}
export async function discover() {
  enabled();
  const { data, error } = await getSupabaseServiceClient().rpc(
    'inference_discover',
    {}
  );
  databaseError(error);
  return data;
}
export async function listTasks(
  p: Principal,
  context: string | null,
  offset: number,
  limit: number,
  status: string | null
) {
  enabled();
  const { data, error } = await getSupabaseServiceClient().rpc(
    'inference_tasks',
    {
      p_agent: p.agentId,
      p_owner: p.developerId,
      p_context: context,
      p_offset: offset,
      p_limit: limit,
      p_state: status,
    }
  );
  databaseError(error);
  return object(data);
}
export async function task(p: Principal, id: string, cancel = false) {
  enabled();
  if (cancel) {
    const { data, error } = await getSupabaseServiceClient().rpc(
      'inference_cancel_task',
      { p_agent: p.agentId, p_owner: p.developerId, p_id: uuid(id) }
    );
    databaseError(error);
    return data;
  }
  return command(p, 'task', { id: uuid(id) });
}
function amount(value: unknown) {
  if (typeof value !== 'string')
    throw new SocietyError('AMOUNT_MUST_BE_STRING');
  try {
    integer(value);
  } catch {
    throw new SocietyError('INVALID_AMOUNT');
  }
  return value;
}
export async function action(p: Principal, value: Record<string, unknown>) {
  enabled();
  const name = text(value.action, 30);
  if (name === 'invoice') {
    fields(value, ['action', 'session']);
    const { data, error } = await getSupabaseServiceClient().rpc(
      'inference_invoice',
      {
        p_agent: p.agentId,
        p_owner: p.developerId,
        p_session: uuid(value.session),
      }
    );
    databaseError(error);
    return data;
  }
  if (name === 'budget') {
    if (!p.userId) throw new SocietyError('OWNER_REQUIRED', 403);
    fields(value, ['action', 'ownerDaily', 'agentDaily', 'sessionCap']);
    const { data, error } = await getSupabaseServiceClient().rpc(
      'inference_budget',
      {
        p_agent: p.agentId,
        p_owner: p.developerId,
        p_user: p.userId,
        p_value: {
          ownerDaily: amount(value.ownerDaily),
          agentDaily: amount(value.agentDaily),
          sessionCap: amount(value.sessionCap),
        },
      }
    );
    if (error?.code === '22023') throw new SocietyError('INVALID_BUDGET');
    databaseError(error);
    return data;
  }
  const ownerActions = [
    'service',
    'fund',
    'provider_approve',
    'approve',
    'resume',
    'refund',
  ];
  if (ownerActions.includes(name) && !p.userId)
    throw new SocietyError('OWNER_REQUIRED', 403);
  if (name === 'service') {
    fields(value, ['action', 'enabled', 'policy']);
    const policy = object(value.policy);
    fields(policy, [
      'model',
      'topics',
      'input',
      'cachedInput',
      'output',
      'maxCalls',
      'maxInput',
      'maxOutput',
      'maxSession',
      'dailyBudget',
      'concurrency',
    ]);
    if (
      typeof value.enabled !== 'boolean' ||
      policy.model !== 'mock-v1' ||
      !Array.isArray(policy.topics) ||
      policy.topics.length < 1 ||
      policy.topics.length > 20
    )
      throw new SocietyError('INVALID_POLICY');
    for (const k of ['maxCalls', 'maxInput', 'maxOutput', 'concurrency'])
      if (!Number.isSafeInteger(policy[k]) || Number(policy[k]) < 1)
        throw new SocietyError('INVALID_POLICY');
    for (const k of [
      'input',
      'cachedInput',
      'output',
      'maxSession',
      'dailyBudget',
    ])
      amount(policy[k]);
    return command(p, name, {
      enabled: value.enabled,
      policy: {
        ...policy,
        topics: policy.topics.map((t) => text(t, 60)),
      } as Json,
    });
  }
  if (name === 'fund') {
    fields(value, ['action', 'amount', 'key']);
    return command(p, name, {
      amount: amount(value.amount),
      key: text(value.key, 128),
    });
  }
  if (name === 'quote') {
    fields(value, ['action', 'seller', 'cap', 'topic']);
    return command(p, name, {
      seller: uuid(value.seller),
      cap: amount(value.cap),
      topic: text(value.topic, 60),
    });
  }
  if (name === 'send') {
    fields(value, ['action', 'session', 'key', 'input', 'maxOutput']);
    const session = uuid(value.session),
      key = text(value.key, 128),
      input = text(value.input, 10000);
    const maxOutput = value.maxOutput;
    if (
      !Number.isSafeInteger(maxOutput) ||
      Number(maxOutput) < 1 ||
      Number(maxOutput) > 4096
    )
      throw new SocietyError('INVALID_OUTPUT_LIMIT');
    const digest = createHash('sha256')
      .update(JSON.stringify([input, maxOutput]))
      .digest('hex');
    const started = object(
      await command(p, 'begin', {
        session,
        key,
        digest,
        input: new TextEncoder().encode(input).length,
        output: Number(maxOutput),
      })
    );
    if (started.replay) return started;
    const result = await new MockModelProvider().execute(
      input,
      Number(maxOutput)
    );
    const { data, error } = await getSupabaseServiceClient().rpc(
      'inference_complete',
      {
        p_call: String(started.id),
        p_request: result.providerRequestId,
        p_output: result.text,
        p_input: result.usage.inputTokens,
        p_output_tokens: result.usage.outputTokens,
      }
    );
    databaseError(error);
    return data;
  }
  if (
    [
      'provider_approve',
      'approve',
      'pause',
      'resume',
      'close',
      'calls',
      'refund',
    ].includes(name)
  ) {
    fields(value, [
      'action',
      'session',
      ...(name === 'approve' ? ['digest'] : []),
      ...(name === 'refund' ? ['amount', 'key'] : []),
    ]);
    const payload: Record<string, Json> = { session: uuid(value.session) };
    if (name === 'approve') payload.digest = text(value.digest, 64);
    if (name === 'refund') {
      payload.amount = amount(value.amount);
      payload.key = text(value.key, 128);
    }
    return command(p, name, payload);
  }
  throw new SocietyError('INVALID_ACTION');
}
