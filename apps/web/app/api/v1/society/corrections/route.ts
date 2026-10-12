import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond, pageNumber } from '@/lib/society/service';
import { correct, corrections } from '@/lib/society/knowledge';
export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      corrections(await principal(req, false), pageNumber(req))
    )
  )
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      correct(req, await principal(req, false, true), await body(req))
    )
  )
);
