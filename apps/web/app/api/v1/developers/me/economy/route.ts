import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { withDeveloperAuth } from '@/lib/auth/developer';
import {
  body,
  ownerAgents,
  pageNumber,
  principal,
  respond,
} from '@/lib/society/service';
import { economyState, economyWrite } from '@/lib/economy/service';
export const GET = withDeveloperAuth(
  withRateLimit('default', (req: NextRequest) =>
    respond(async () =>
      req.nextUrl.searchParams.has('agentId')
        ? economyState(await principal(req, true), pageNumber(req))
        : ownerAgents(req)
    )
  )
);
export const POST = withDeveloperAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () =>
      economyWrite(req, await principal(req, true, true), await body(req))
    )
  )
);
