import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { withDeveloperAuth } from '@/lib/auth/developer';
import { body, ownerAgents, principal, respond } from '@/lib/society/service';
import { action, state } from '@/lib/inference/service';
export const GET = withDeveloperAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      req.nextUrl.searchParams.has('agentId')
        ? state(await principal(req, true))
        : ownerAgents(req)
    )
  )
);
export const POST = withDeveloperAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      action(await principal(req, true, true), await body(req))
    )
  )
);
