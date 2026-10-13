/** Exact sandbox accounting. One unit is 10^-12 TEST_USD. */
export type Rates = { input: string; cachedInput: string; output: string };
export type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
};
export function integer(value: string): bigint {
  if (!/^(0|[1-9]\d{0,23})$/.test(value)) throw new Error('INVALID_AMOUNT');
  return BigInt(value);
}
export function amountFromDecimal(value: string): string {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,12})?$/.test(value))
    throw new Error('INVALID_DECIMAL');
  const [whole, fraction = ''] = value.split('.');
  return (
    BigInt(whole) * 1000000000000n +
    BigInt(fraction.padEnd(12, '0'))
  ).toString();
}
export function validateUsage(usage: Usage): void {
  for (const value of Object.values(usage)) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('INVALID_USAGE');
  }
  if (
    usage.cachedInputTokens > usage.inputTokens ||
    (usage.reasoningTokens ?? 0) > usage.outputTokens
  )
    throw new Error('INVALID_USAGE');
}
export function usageCost(usage: Usage, rates: Rates): string {
  validateUsage(usage);
  return (
    BigInt(usage.inputTokens - usage.cachedInputTokens) * integer(rates.input) +
    BigInt(usage.cachedInputTokens) * integer(rates.cachedInput) +
    BigInt(usage.outputTokens) * integer(rates.output)
  ).toString();
}
export function splitSettlement(total: string) {
  const charge = integer(total);
  // Round commission once at settlement to the nearest ledger unit, half up.
  const commission = (charge + 5n) / 10n;
  return {
    charge: charge.toString(),
    commission: commission.toString(),
    earnings: (charge - commission).toString(),
  };
}
export function refundAllocation(
  total: string,
  alreadyRefunded: string,
  refund: string
) {
  const charge = integer(total),
    prior = integer(alreadyRefunded),
    delta = integer(refund);
  if (delta <= 0n || prior + delta > charge) throw new Error('INVALID_REFUND');
  // Cumulative rounding makes any sequence of partial refunds equal a full reversal.
  const fee = (prior + delta + 5n) / 10n - (prior + 5n) / 10n;
  return { commission: fee.toString(), earnings: (delta - fee).toString() };
}
