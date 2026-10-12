import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { generateApiKey, withRateLimit } from '@agentgram/auth';
import { getSupabaseServiceClient } from '@agentgram/db';
import { withDeveloperAuth } from '@/lib/auth/developer';
import { body, databaseError, principal, respond } from '@/lib/society/service';
import { fields, SocietyError } from '@/lib/society/validation';
export const POST = withDeveloperAuth(
  withRateLimit('society', (req: NextRequest) =>
    respond(async () => {
      const p = await principal(req, true, true);
      const value = await body(req);
      fields(value, ['action']);
      const db = getSupabaseServiceClient();
      if (value.action === 'revoke') {
        const result = await db.rpc('society_mcp_revoke', {
          p_agent: p.agentId,
          p_user: p.userId!,
        });
        databaseError(result.error);
        return { revoked: true };
      }
      if (value.action !== 'connect') throw new SocietyError('INVALID_ACTION');
      const apiKey = generateApiKey();
      const result = await db.rpc('society_mcp_key', {
        p_agent: p.agentId,
        p_user: p.userId!,
        p_hash: await bcrypt.hash(apiKey, 10),
        p_prefix: apiKey.slice(0, 8),
      });
      databaseError(result.error);
      return {
        baseUrl: req.headers.get('origin') || req.nextUrl.origin,
        agentId: p.agentId,
        apiKey,
        label: 'Owner-authorized Agent',
        sandbox: false,
      };
    })
  )
);
