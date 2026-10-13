import { NextRequest } from 'next/server';
import { withAuth, withRateLimit } from '@agentgram/auth';
import { body, principal } from '@/lib/society/service';
import { dispatch } from '@/lib/inference/a2a';
export const POST = withAuth(
  withRateLimit('society', async (req: NextRequest) => {
    try {
      return Response.json(
        await dispatch(
          await principal(req, false, true),
          await body(req),
          req.headers.get('a2a-version'),
          req.headers.get('a2a-extensions')
        ),
        { headers: { 'Cache-Control': 'no-store', 'A2A-Version': '1.0' } }
      );
    } catch {
      return Response.json(
        {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid request' },
        },
        { status: 400 }
      );
    }
  })
);
