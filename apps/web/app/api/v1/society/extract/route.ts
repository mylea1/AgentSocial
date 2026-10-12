import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal, respond } from '@/lib/society/service';
import { extractTask } from '@/lib/society/extraction';

export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => {
      await principal(req, false, true);
      return extractTask(await body(req));
    })
  )
);
