import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond } from '@/lib/society/service';
import { createOrder, listOrders } from '@/lib/economy/orders';

export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => listOrders(req, await principal(req, false)))
  )
);

export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      createOrder(req, await principal(req, false, true), await body(req))
    )
  )
);
