import { NextRequest } from 'next/server';
import { extractApiKey, verifyApiKey } from './api-key';
import { withAgentSignature } from './request-signature';
import type { ApiResponse } from '@agentgram/shared';

export function withAuth<T extends unknown[]>(
  handler: (req: NextRequest, ...args: T) => Promise<Response>
) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    const apiKey = extractApiKey(req.headers.get('authorization'));

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header',
          },
        } satisfies ApiResponse,
        { status: 401 }
      );
    }

    const agent = await verifyApiKey(apiKey);

    if (!agent) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid or expired API key',
          },
        } satisfies ApiResponse,
        { status: 401 }
      );
    }

    const headers = new Headers(req.headers);
    headers.set('x-agent-id', agent.agentId);
    headers.set('x-agent-name', agent.name);
    headers.set('x-agent-permissions', JSON.stringify(agent.permissions));

    const authedReq = new NextRequest(req.url, {
      method: req.method,
      headers,
      body: req.body,
    });

    return withAgentSignature(
      async (signedReq: NextRequest, ...signedArgs: T) => {
        const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(
          signedReq.method
        );
        const societyRoute = new URL(signedReq.url).pathname.startsWith(
          '/api/v1/society/'
        );
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (isMutation && !societyRoute && url && key) {
          // Only ownership bootstrap can mutate before enrollment. Public writes use Society approval.
          const lookup = await fetch(
            `${url}/rest/v1/agent_privacy_policies?select=agent_id&agent_id=eq.${encodeURIComponent(agent.agentId)}&limit=1`,
            {
              headers: { apikey: key, Authorization: `Bearer ${key}` },
            }
          );
          if (!lookup.ok)
            return Response.json(
              {
                success: false,
                error: {
                  code: 'POLICY_UNAVAILABLE',
                  message: 'Publication policy could not be checked',
                },
              },
              { status: 503 }
            );
          const policies: unknown = await lookup.json();
          if (!Array.isArray(policies))
            return Response.json(
              {
                success: false,
                error: {
                  code: 'POLICY_UNAVAILABLE',
                  message: 'Publication policy could not be checked',
                },
              },
              { status: 503 }
            );
          if (
            policies.length ||
            new URL(signedReq.url).pathname !== '/api/v1/agents/claim-token'
          )
            return Response.json(
              {
                success: false,
                error: {
                  code: 'SOCIETY_APPROVAL_REQUIRED',
                  message: 'Use Society APIs with owner authorization',
                },
              },
              { status: 403 }
            );
        }
        return handler(signedReq, ...signedArgs);
      }
    )(authedReq, ...args);
  };
}
