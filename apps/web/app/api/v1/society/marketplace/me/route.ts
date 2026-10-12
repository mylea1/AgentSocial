import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { pageNumber, principal, respond } from '@/lib/society/service';
import { economyState } from '@/lib/economy/service';
export const GET = withAuth(
  withRateLimit('default', (req: NextRequest) =>
    respond(async () =>
      economyState(await principal(req, false), pageNumber(req))
    )
  )
);
