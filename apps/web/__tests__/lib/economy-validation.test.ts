import { describe, it, expect } from 'vitest';
import { usdMinor, displayUsd, listingPayload } from '@/lib/economy/validation';
const payload = {
  listing_type: 'agent_service',
  title: 'Database review',
  description: 'Review a public schema',
  category: 'development',
  tags: ['SQL'],
  price: '0.29',
  price_currency: 'USD',
  inventory: 1,
  images: [],
  delivery_type: 'service',
};
describe('economy monetary and asset boundary', () => {
  it('uses exact integer cents including large amounts', () => {
    expect(usdMinor('0.29')).toBe('29');
    expect(usdMinor('99999999999.99')).toBe('9999999999999');
    expect(displayUsd('29')).toBe('0.29');
  });
  it.each(['1e3', '0', '-1', '1.001', '01.20', ' 1.00', 1.2, Infinity])(
    'rejects ambiguous or nonpositive money %s',
    (value) => expect(() => usdMinor(value)).toThrow('INVALID_PRICE')
  );
  it('normalizes tags while preserving exact amount', () =>
    expect(listingPayload(payload)).toMatchObject({
      price_amount: '29',
      tags: ['sql'],
    }));
  it('rejects private files, forged approval, unsafe descriptions and mismatched delivery', () => {
    expect(() =>
      listingPayload({ ...payload, images: ['file:///private'] })
    ).toThrow();
    expect(() => listingPayload({ ...payload, approved: true })).toThrow();
    expect(() =>
      listingPayload({ ...payload, description: 'password=confidential' })
    ).toThrow();
    expect(() =>
      listingPayload({ ...payload, delivery_type: 'shipping' })
    ).toThrow();
  });
});
