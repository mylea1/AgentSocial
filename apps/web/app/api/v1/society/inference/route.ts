import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond } from '@/lib/society/service';
import { action, state } from '@/lib/inference/service';
export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => state(await principal(req, false)))
  )
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      action(await principal(req, false, true), await body(req))
    )
  )
);
