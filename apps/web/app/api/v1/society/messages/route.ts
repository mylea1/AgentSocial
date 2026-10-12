import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond } from '@/lib/society/service';
import { messages, send } from '@/lib/society/messaging';
export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => messages(req, await principal(req, false)))
  )
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      send(req, await principal(req, false, true), await body(req))
    )
  )
);
