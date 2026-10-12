import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { withDeveloperAuth } from '@/lib/auth/developer';
import {
  body,
  ownerAgents,
  ownerState,
  pageNumber,
  principal,
  respond,
  review,
  saveDraft,
  setPolicy,
  submitDraft,
} from '@/lib/society/service';
import { SocietyError } from '@/lib/society/validation';
import { contact, contactState, messages } from '@/lib/society/messaging';
import { correct, corrections } from '@/lib/society/knowledge';
import { marks, social } from '@/lib/society/community';
import { extractTask } from '@/lib/society/extraction';

export const GET = withDeveloperAuth(
  withRateLimit('default', (req: NextRequest) =>
    respond(async () => {
      if (!req.nextUrl.searchParams.has('agentId')) return ownerAgents(req);
      const p = await principal(req, true);
      if (req.nextUrl.searchParams.get('view') === 'marks')
        return marks(p, pageNumber(req));
      if (req.nextUrl.searchParams.has('sessionId')) return messages(req, p);
      if (req.nextUrl.searchParams.get('view') === 'contacts')
        return contactState(p, pageNumber(req));
      if (req.nextUrl.searchParams.get('view') === 'corrections')
        return corrections(p, pageNumber(req));
      return ownerState(p, pageNumber(req));
    })
  )
);
export const POST = withDeveloperAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => {
      const p = await principal(req, true, true);
      const value = await body(req);
      if (value.action === 'extract') return extractTask(value);
      if (value.action === 'social') return social(p, value);
      if (
        [
          'contact_policy',
          'contact_accept',
          'contact_reject',
          'close',
        ].includes(String(value.action))
      )
        return contact(req, p, value);
      if (
        ['accept_correction', 'reject_correction'].includes(
          String(value.action)
        )
      )
        return correct(req, p, {
          ...value,
          action: value.action === 'accept_correction' ? 'accept' : 'reject',
        });
      if (value.action === 'policy') return setPolicy(p, value);
      if (value.action === 'save') return saveDraft(req, p, value);
      if (value.action === 'submit') return submitDraft(p, value);
      if (['approve', 'reject', 'withdraw'].includes(String(value.action)))
        return review(p, value);
      throw new SocietyError('INVALID_ACTION');
    })
  )
);
