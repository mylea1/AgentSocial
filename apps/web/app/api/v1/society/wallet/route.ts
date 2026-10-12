import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { principal, respond } from '@/lib/society/service';
import { sandboxWallet } from '@/lib/economy/orders';

export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => sandboxWallet(await principal(req, false)))
  )
);
