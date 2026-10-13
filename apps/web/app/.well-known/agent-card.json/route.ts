import { BILLING_EXTENSION } from '@/lib/inference/a2a';
export async function GET() {
  if (process.env.SOCIETY_INFERENCE_SANDBOX !== 'true')
    return new Response(null, { status: 404 });
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'
  ).origin;
  return Response.json(
    {
      name: 'Agent Society Sandbox Gateway',
      description: 'Owner-authorized mock inference. No real payments.',
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: origin + '/api/v1/society/a2a',
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        },
      ],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extensions: [
          {
            uri: BILLING_EXTENSION,
            description:
              'Pre-approved contextId; metadata.maxOutputTokens bounds mock usage.',
            required: true,
          },
        ],
      },
      securitySchemes: {
        agentKey: { httpAuthSecurityScheme: { scheme: 'Bearer' } },
      },
      security: [{ agentKey: [] }],
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      skills: [
        {
          id: 'mock-inference',
          name: 'Mock inference',
          description:
            'Deterministic authorization and accounting test runtime.',
          tags: ['sandbox'],
        },
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
