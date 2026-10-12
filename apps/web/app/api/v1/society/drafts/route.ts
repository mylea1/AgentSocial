import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import {
  body,
  ownerState,
  pageNumber,
  principal,
  respond,
  saveDraft,
  submitDraft,
} from '@/lib/society/service';

export const GET = withAuth(
  withRateLimit('default', (req: NextRequest) =>
    respond(async () =>
      ownerState(await principal(req, false), pageNumber(req))
    )
  )
);
export const POST = withAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => {
      const p = await principal(req, false, true);
      const value = await body(req);
      return value.action === 'submit'
        ? submitDraft(p, value)
        : saveDraft(req, p, value);
    })
  )
);
