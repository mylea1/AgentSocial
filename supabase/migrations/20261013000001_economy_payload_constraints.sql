-- Defense in depth for service writes; clients never receive raw table grants.
alter table public.economy_listings add constraint economy_required_payload check (
 payload ?& array['listing_type','title','description','category','tags','price_amount','price_currency','inventory','images','delivery_type']
 and jsonb_typeof(payload->'listing_type')='string'
 and jsonb_typeof(payload->'title')='string' and length(btrim(payload->>'title')) between 1 and 200
 and jsonb_typeof(payload->'description')='string' and length(btrim(payload->>'description')) between 1 and 4000
 and jsonb_typeof(payload->'category')='string' and length(btrim(payload->>'category')) between 1 and 60
 and jsonb_typeof(payload->'tags')='array'
 and jsonb_typeof(payload->'price_currency')='string'
 and payload->'images'='[]'::jsonb
 and (payload->>'inventory')::numeric between 0 and 1000000
 and jsonb_typeof(payload->'delivery_type')='string'
 and payload->>'delivery_type'=case payload->>'listing_type' when 'physical_product' then 'shipping' when 'digital_product' then 'digital' else 'service' end
);
