import { beforeEach, describe, expect, it, vi } from 'vitest';
const gateway = vi.hoisted(() => ({
  action: vi.fn(),
  task: vi.fn(),
  listTasks: vi.fn(),
}));
vi.mock('@/lib/inference/service', () => gateway);
import { BILLING_EXTENSION, dispatch } from '@/lib/inference/a2a';
import {
  DisabledX402PaymentProvider,
  testnetPaymentRequired,
} from '@/lib/inference/x402';
const p = {
  agentId: '11111111-1111-4111-8111-111111111111',
  developerId: '22222222-2222-4222-8222-222222222222',
};
describe('A2A authorized transport', () => {
  beforeEach(() => vi.clearAllMocks());
  it('lists scoped tasks without requiring a context filter and maps cancellation', async () => {
    gateway.listTasks.mockResolvedValue({
      tasks: [],
      totalSize: 0,
      pageSize: 20,
      nextPageToken: '',
    });
    expect(
      await dispatch(
        p,
        { jsonrpc: '2.0', id: 4, method: 'ListTasks' },
        '1.0',
        null
      )
    ).toMatchObject({ result: { totalSize: 0 } });
    expect(gateway.listTasks).toHaveBeenCalledWith(p, null, 0, 20, null);
    gateway.task.mockResolvedValue({
      id: p.agentId,
      session_id: p.developerId,
      state: 'CANCELED',
      cost: '0',
    });
    expect(
      await dispatch(
        p,
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'CancelTask',
          params: { id: p.agentId },
        },
        '1.0',
        null
      )
    ).toMatchObject({ result: { status: { state: 'TASK_STATE_CANCELED' } } });
  });
  it('rejects unsupported versions and methods without executing a model', async () => {
    expect(
      await dispatch(
        p,
        { jsonrpc: '2.0', id: 1, method: 'SendMessage' },
        '0.3',
        null
      )
    ).toMatchObject({ error: { code: -32009 } });
    expect(
      await dispatch(
        p,
        { jsonrpc: '2.0', id: 2, method: 'message/send', params: {} },
        '1.0',
        null
      )
    ).toMatchObject({ error: { code: -32601 } });
    expect(gateway.action).not.toHaveBeenCalled();
  });
  it('requires explicit billing extension and uses the pre-approved context', async () => {
    const value = {
      jsonrpc: '2.0',
      id: 3,
      method: 'SendMessage',
      params: {
        message: {
          role: 'ROLE_USER',
          messageId: 'message-0001',
          contextId: p.agentId,
          parts: [{ text: 'Help with Python' }],
        },
        metadata: { maxOutputTokens: 30 },
      },
    };
    expect(await dispatch(p, value, '1.0', null)).toMatchObject({
      error: { code: -32008 },
    });
    gateway.action.mockResolvedValue({ id: p.developerId });
    gateway.task.mockResolvedValue({
      id: p.developerId,
      session_id: p.agentId,
      state: 'COMPLETED',
      response: 'mock',
      cost: '30',
    });
    expect(await dispatch(p, value, '1.0', BILLING_EXTENSION)).toMatchObject({
      result: { task: { status: { state: 'TASK_STATE_COMPLETED' } } },
    });
    expect(gateway.action).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ session: p.agentId, maxOutput: 30 })
    );
  });
});
describe('x402 testnet preparation', () => {
  it('encodes v2 requirements without asserting payment success', async () => {
    const r = testnetPaymentRequired('https://example.org/resource', {
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '100',
      asset: '0x' + '1'.repeat(40),
      payTo: '0x' + '2'.repeat(40),
      maxTimeoutSeconds: 60,
    });
    expect(JSON.parse(Buffer.from(r.header, 'base64').toString())).toEqual(
      r.required
    );
    await expect(new DisabledX402PaymentProvider().capture()).rejects.toThrow(
      'NOT_CONFIGURED'
    );
  });
});
