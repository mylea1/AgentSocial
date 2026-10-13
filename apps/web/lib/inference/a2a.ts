import { object, SocietyError, text, uuid } from '@/lib/society/validation';
import type { Principal } from '@/lib/society/service';
import { action, task, listTasks } from './service';

export const BILLING_EXTENSION = 'urn:agent-society:inference-sandbox:v1';
function asTask(value: unknown) {
  const call = object(value);
  return {
    id: call.id,
    contextId: call.session_id,
    status: {
      state:
        call.state === 'COMPLETED'
          ? 'TASK_STATE_COMPLETED'
          : call.state === 'RUNNING'
            ? 'TASK_STATE_WORKING'
            : call.state === 'CANCELED'
              ? 'TASK_STATE_CANCELED'
              : 'TASK_STATE_FAILED',
    },
    ...(call.response
      ? {
          artifacts: [
            { artifactId: String(call.id), parts: [{ text: call.response }] },
          ],
        }
      : {}),
    metadata: { currency: 'TEST_USD', cost: call.cost, usage: call.usage },
  };
}
export async function dispatch(
  p: Principal,
  value: Record<string, unknown>,
  version: string | null,
  extensions: string | null
) {
  const id =
    typeof value.id === 'string' || typeof value.id === 'number'
      ? value.id
      : null;
  const error = (code: number, message: string) => ({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
  if (
    value.jsonrpc !== '2.0' ||
    id === null ||
    typeof value.method !== 'string'
  )
    return error(-32600, 'Invalid request');
  if (version && version !== '1.0')
    return error(-32009, 'Unsupported A2A version');
  try {
    const params = object(value.params ?? {});
    let result: unknown;
    if (value.method === 'SendMessage') {
      if (
        !extensions
          ?.split(',')
          .map((x) => x.trim())
          .includes(BILLING_EXTENSION)
      )
        return error(-32008, 'Sandbox billing extension required');
      const message = object(params.message);
      if (
        message.role !== 'ROLE_USER' ||
        message.taskId ||
        !Array.isArray(message.parts) ||
        message.parts.length !== 1
      )
        return error(
          -32602,
          'One text part and an approved contextId are required'
        );
      const part = object(message.parts[0]);
      if (Object.keys(part).some((k) => k !== 'text'))
        return error(-32005, 'Only text is supported');
      const metadata = object(params.metadata);
      const call = object(
        await action(p, {
          action: 'send',
          session: uuid(message.contextId),
          key: text(message.messageId, 128),
          input: text(part.text, 10000),
          maxOutput: metadata.maxOutputTokens,
        })
      );
      result = { task: asTask(await task(p, String(call.id))) };
    } else if (value.method === 'GetTask' || value.method === 'CancelTask') {
      result = asTask(
        await task(p, uuid(params.id), value.method === 'CancelTask')
      );
    } else if (value.method === 'ListTasks') {
      const pageSize =
        params.pageSize === undefined ? 20 : Number(params.pageSize);
      const offset =
        params.pageToken === undefined ? 0 : Number(params.pageToken);
      if (
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100 ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      )
        return error(-32602, 'Invalid pagination');
      const states: Record<string, string> = {
        TASK_STATE_WORKING: 'RUNNING',
        TASK_STATE_COMPLETED: 'COMPLETED',
        TASK_STATE_FAILED: 'FAILED',
        TASK_STATE_CANCELED: 'CANCELED',
      };
      if (params.status && !states[String(params.status)])
        return error(-32602, 'Unsupported task status');
      const page = await listTasks(
        p,
        params.contextId ? uuid(params.contextId) : null,
        offset,
        pageSize,
        params.status ? states[String(params.status)] : null
      );
      result = {
        ...page,
        tasks: (Array.isArray(page.tasks) ? page.tasks : []).map(asTask),
      };
    } else return error(-32601, 'Method not found');
    return { jsonrpc: '2.0', id, result };
  } catch (e) {
    if (e instanceof SocietyError) {
      if (e.code === 'NOT_FOUND') return error(-32001, 'Task not found');
      if (e.code === 'CONFLICT' && value.method === 'CancelTask')
        return error(-32002, 'Task cannot be cancelled');
      return error(-32602, e.code);
    }
    return error(-32603, 'Internal error');
  }
}
