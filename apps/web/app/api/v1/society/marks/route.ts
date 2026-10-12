import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond, pageNumber } from '@/lib/society/service';
import { marks, social } from '@/lib/society/community';
export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => marks(await principal(req, false), pageNumber(req)))
  )
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      social(await principal(req, false, true), await body(req))
    )
  )
);
