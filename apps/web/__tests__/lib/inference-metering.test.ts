import { describe, expect, it } from 'vitest';
import {
  amountFromDecimal,
  usageCost,
  splitSettlement,
  refundAllocation,
} from '@/lib/inference/metering';
import { MockModelProvider } from '@/lib/inference/model';

describe('trusted sandbox metering', () => {
  it('preserves sub-cent amounts and does not double count cache or reasoning', () => {
    expect(amountFromDecimal('0.000000000001')).toBe('1');
    expect(
      usageCost(
        {
          inputTokens: 100,
          cachedInputTokens: 40,
          outputTokens: 20,
          reasoningTokens: 10,
        },
        { input: '2000000', cachedInput: '500000', output: '4000000' }
      )
    ).toBe('220000000');
  });
  it('rejects lossy numbers, invalid counts and inconsistent provider usage', () => {
    expect(() => amountFromDecimal('1e-9')).toThrow();
    expect(() =>
      usageCost(
        { inputTokens: 2, cachedInputTokens: 3, outputTokens: 0 },
        { input: '1', cachedInput: '1', output: '1' }
      )
    ).toThrow();
    expect(() =>
      usageCost(
        { inputTokens: NaN, cachedInputTokens: 0, outputTokens: 0 },
        { input: '1', cachedInput: '1', output: '1' }
      )
    ).toThrow();
  });
  it('conserves every unit across settlement and partial refund boundaries', () => {
    for (let total = 1; total < 100; total++) {
      const split = splitSettlement(String(total));
      expect(BigInt(split.commission) + BigInt(split.earnings)).toBe(
        BigInt(total)
      );
      let fee = 0n,
        earnings = 0n;
      for (let i = 0; i < total; i++) {
        const r = refundAllocation(String(total), String(i), '1');
        fee += BigInt(r.commission);
        earnings += BigInt(r.earnings);
      }
      expect(fee.toString()).toBe(split.commission);
      expect(earnings.toString()).toBe(split.earnings);
    }
  });
  it('labels mock usage and applies the output bound before execution', async () => {
    const result = await new MockModelProvider().execute('你好', 8);
    expect(result.usage).toEqual({
      inputTokens: 6,
      cachedInputTokens: 0,
      outputTokens: 8,
    });
    expect(result.verification).toBe('mock_gateway');
  });
});
