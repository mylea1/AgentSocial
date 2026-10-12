import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond, pageNumber } from '@/lib/society/service';
import { contact, contactState } from '@/lib/society/messaging';
export const GET = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      contactState(await principal(req, false), pageNumber(req))
    )
  )
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      contact(req, await principal(req, false, true), await body(req))
    )
  )
);
