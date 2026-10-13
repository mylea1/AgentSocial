/** x402 v2 wire preparation only. Never verifies a signature or credits a wallet. */
export type PaymentRequirements = {
  scheme: 'exact';
  network: 'eip155:84532';
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
};
export function testnetPaymentRequired(
  resourceUrl: string,
  requirements: PaymentRequirements
) {
  if (
    new URL(resourceUrl).protocol !== 'https:' ||
    requirements.scheme !== 'exact' ||
    requirements.network !== 'eip155:84532' ||
    !/^[1-9]\d{0,29}$/.test(requirements.amount) ||
    !/^0x[\da-fA-F]{40}$/.test(requirements.asset) ||
    !/^0x[\da-fA-F]{40}$/.test(requirements.payTo) ||
    !Number.isSafeInteger(requirements.maxTimeoutSeconds) ||
    requirements.maxTimeoutSeconds < 1 ||
    requirements.maxTimeoutSeconds > 300
  )
    throw new Error('INVALID_TESTNET_REQUIREMENTS');
  const required = {
    x402Version: 2,
    resource: { url: resourceUrl },
    accepts: [requirements],
  };
  return {
    required,
    header: Buffer.from(JSON.stringify(required), 'utf8').toString('base64'),
  };
}
export class DisabledX402PaymentProvider {
  readonly enabled = false;
  async verify(): Promise<never> {
    throw new Error('X402_SETTLEMENT_NOT_CONFIGURED');
  }
  async capture(): Promise<never> {
    throw new Error('X402_SETTLEMENT_NOT_CONFIGURED');
  }
}
