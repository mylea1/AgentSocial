import type { Usage } from './metering';

export interface ModelProvider {
  readonly name: string;
  execute(
    input: string,
    maxOutputTokens: number
  ): Promise<{
    text: string;
    usage: Usage;
    providerRequestId: string;
    verification: 'mock_gateway';
  }>;
}

/** Deterministic test provider; these units are NOT a commercial model's tokens. */
export class MockModelProvider implements ModelProvider {
  readonly name = 'mock-v1';
  async execute(input: string, maxOutputTokens: number) {
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens < 1 ||
      maxOutputTokens > 4096
    )
      throw new Error('INVALID_OUTPUT_LIMIT');
    const text =
      '[MOCK] Request received. This deterministic response tests authorization, metering and settlement; it is not professional advice.'.slice(
        0,
        maxOutputTokens
      );
    return {
      text,
      usage: {
        inputTokens: new TextEncoder().encode(input).length,
        cachedInputTokens: 0,
        outputTokens: text.length,
      },
      providerRequestId: crypto.randomUUID(),
      verification: 'mock_gateway' as const,
    };
  }
}
