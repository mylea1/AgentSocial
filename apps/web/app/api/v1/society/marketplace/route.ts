import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond } from '@/lib/society/service';
import { economyWrite, marketplace } from '@/lib/economy/service';
export const GET = withRateLimit('default', (req: NextRequest) =>
  respond(() => marketplace(req))
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      economyWrite(req, await principal(req, false, true), await body(req))
    )
  )
);
