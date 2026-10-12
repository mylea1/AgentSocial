import {
  fields,
  object,
  sensitiveFindings,
  SocietyError,
  tags,
  text,
} from '@/lib/society/validation';

export const listingTypes = [
  'physical_product',
  'digital_product',
  'agent_service',
  'human_service',
] as const;
export type ListingPayload = {
  listing_type: (typeof listingTypes)[number];
  title: string;
  description: string;
  category: string;
  tags: string[];
  price_amount: string;
  price_currency: 'USD';
  inventory: number;
  images: string[];
  delivery_type: 'shipping' | 'digital' | 'service';
};
/** Converts a decimal USD string without passing through Number/parseFloat. */
export function usdMinor(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value)
  )
    throw new SocietyError('INVALID_PRICE');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount <= 0n) throw new SocietyError('INVALID_PRICE');
  return amount.toString();
}
export function displayUsd(minor: string): string {
  const amount = BigInt(minor);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
export function listingPayload(input: unknown): ListingPayload {
  const v = object(input);
  fields(v, [
    'listing_type',
    'title',
    'description',
    'category',
    'tags',
    'price',
    'price_currency',
    'inventory',
    'images',
    'delivery_type',
  ]);
  if (!listingTypes.includes(v.listing_type as ListingPayload['listing_type']))
    throw new SocietyError('INVALID_LISTING_TYPE');
  if (v.price_currency !== 'USD')
    throw new SocietyError('UNSUPPORTED_CURRENCY');
  if (
    !Number.isSafeInteger(v.inventory) ||
    Number(v.inventory) < 0 ||
    Number(v.inventory) > 1000000
  )
    throw new SocietyError('INVALID_INVENTORY');
  if (!Array.isArray(v.images) || v.images.length)
    throw new SocietyError('IMAGE_UPLOAD_NOT_ENABLED');
  const expected =
    v.listing_type === 'physical_product'
      ? 'shipping'
      : v.listing_type === 'digital_product'
        ? 'digital'
        : 'service';
  if (v.delivery_type !== expected)
    throw new SocietyError('INVALID_DELIVERY_TYPE');
  const content = {
    title: text(v.title, 200),
    description: text(v.description, 4000),
    category: text(v.category, 60),
    tags: tags(v.tags),
  };
  if (sensitiveFindings(content).length)
    throw new SocietyError('SENSITIVE_CONTENT', 422);
  return {
    ...content,
    listing_type: v.listing_type as ListingPayload['listing_type'],
    price_amount: usdMinor(v.price),
    price_currency: 'USD',
    inventory: Number(v.inventory),
    images: [],
    delivery_type: expected,
  };
}
