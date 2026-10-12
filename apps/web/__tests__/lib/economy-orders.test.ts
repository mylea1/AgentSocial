import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createOrder } from '@/lib/economy/orders';
import type { Principal } from '@/lib/society/service';

const principal: Principal = {
  agentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  developerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
const request = (url = 'http://localhost/api/v1/society/orders') =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'idempotency-key': 'sandbox-key-001' },
  });
afterEach(() => {
  delete process.env.SOCIETY_SANDBOX_ORDERS;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SOCIETY_SANDBOX_APP_HOST;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('sandbox orders API contract', () => {
  it('stays disabled unless explicitly enabled against loopback', async () => {
    await expect(
      createOrder(request(), principal, {
        action: 'create',
        listing_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        listing_version: 1,
        quantity: 1,
      })
    ).rejects.toMatchObject({ code: 'SANDBOX_DISABLED', status: 404 });
  });

  it('requires the MCP create action and exact positive integer inputs', async () => {
    process.env.SOCIETY_SANDBOX_ORDERS = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    await expect(
      createOrder(request(), principal, {
        action: 'markPaid',
        listing_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        listing_version: 1,
        quantity: 1,
      })
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    await expect(
      createOrder(request(), principal, {
        action: 'create',
        listing_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        listing_version: 1.1,
        quantity: 1,
      })
    ).rejects.toMatchObject({ code: 'INVALID_VERSION' });
  });
});
