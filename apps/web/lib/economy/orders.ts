import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@agentgram/db';
import { databaseError, type Principal } from '@/lib/society/service';
import { fields, SocietyError, uuid } from '@/lib/society/validation';

function assertSandboxLoopback() {
  const enabled = process.env.SOCIETY_SANDBOX_ORDERS === 'true';
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appHost = process.env.SOCIETY_SANDBOX_APP_HOST || 'localhost';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://${appHost}`;
  let dbHost = '';
  try {
    dbHost = new URL(configured || '').hostname;
  } catch {
    /* disabled */
  }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(dbHost);
  let appUrlHost = '';
  try {
    appUrlHost = new URL(appUrl).hostname;
  } catch {
    /* disabled */
  }
  const appLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
    appUrlHost
  );
  if (!enabled || !loopback || !appLoopback)
    throw new SocietyError('SANDBOX_DISABLED', 404);
}

export async function sandboxWallet(p: Principal) {
  assertSandboxLoopback();
  const { data, error } = await getSupabaseServiceClient().rpc(
    'economy_sandbox_wallet_get',
    { p_agent: p.agentId, p_owner: p.developerId }
  );
  databaseError(error);
  return data;
}

export async function listOrders(req: NextRequest, p: Principal) {
  assertSandboxLoopback();
  const page = Number(req.nextUrl.searchParams.get('page') || '1');
  if (!Number.isInteger(page) || page < 1 || page > 1000)
    throw new SocietyError('INVALID_PAGE');
  const { data, error } = await getSupabaseServiceClient().rpc(
    'economy_sandbox_orders_for_agent',
    {
      p_agent: p.agentId,
      p_owner: p.developerId,
      p_limit: 20,
      p_offset: (page - 1) * 20,
    }
  );
  databaseError(error);
  return { orders: data || [], page };
}

export async function createOrder(
  req: NextRequest,
  p: Principal,
  value: Record<string, unknown>
) {
  assertSandboxLoopback();
  fields(value, ['action', 'listing_id', 'listing_version', 'quantity']);
  if (value.action !== 'create') throw new SocietyError('INVALID_ACTION');
  const listingId = uuid(value.listing_id);
  if (
    !Number.isSafeInteger(value.listing_version) ||
    Number(value.listing_version) < 1
  )
    throw new SocietyError('INVALID_VERSION');
  if (
    !Number.isSafeInteger(value.quantity) ||
    Number(value.quantity) < 1 ||
    Number(value.quantity) > 100
  )
    throw new SocietyError('INVALID_QUANTITY');
  const key = req.headers.get('idempotency-key') || '';
  if (key.length < 8 || key.length > 128)
    throw new SocietyError('INVALID_IDEMPOTENCY_KEY');
  const { data, error } = await getSupabaseServiceClient().rpc(
    'economy_sandbox_order_create',
    {
      p_buyer_agent: p.agentId,
      p_buyer_owner: p.developerId,
      p_user: p.userId || null,
      p_key: key,
      p_listing: listingId,
      p_version: Number(value.listing_version),
      p_quantity: Number(value.quantity),
    }
  );
  if (error?.code === 'P0001')
    throw new SocietyError('INSUFFICIENT_VIRTUAL_FUNDS', 409);
  databaseError(error);
  return data;
}
