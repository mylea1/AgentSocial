-- Explicitly local test fixtures only. This schema cannot settle real payments.
create table public.economy_sandbox_allowlist (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  developer_id uuid not null references public.developers(id) on delete cascade,
  purpose text not null check (purpose='sandbox_order_buyer'),
  created_at timestamptz not null default now()
);
create table public.economy_sandbox_listings (
  listing_id uuid primary key references public.economy_listings(id) on delete cascade,
  seller_owner_id uuid not null references public.developers(id),
  purpose text not null check(purpose='mcp_sandbox_fixture'),
  created_at timestamptz not null default now()
);

create table public.economy_sandbox_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.economy_listings(id),
  listing_version integer not null check(listing_version > 0),
  buyer_agent_id uuid not null references public.agents(id),
  buyer_owner_id uuid not null references public.developers(id),
  seller_agent_id uuid not null references public.agents(id),
  seller_owner_id uuid not null references public.developers(id),
  quantity integer not null check(quantity > 0),
  unit_price_minor text not null check(unit_price_minor ~ '^[1-9][0-9]{0,14}$'),
  total_price_minor text not null check(total_price_minor ~ '^[1-9][0-9]{0,19}$'),
  currency text not null check(currency='USD'),
  status text not null default 'sandbox_completed' check(status='sandbox_completed'),
  listing_snapshot jsonb not null check(jsonb_typeof(listing_snapshot)='object'),
  sandbox_marker text not null check(sandbox_marker='mcp_sandbox_fixture'),
  idempotency_key text not null check(length(idempotency_key) between 8 and 128),
  request jsonb not null check(jsonb_typeof(request)='object'),
  created_at timestamptz not null default now(),
  unique(buyer_agent_id,buyer_owner_id,idempotency_key)
);
create index economy_sandbox_orders_buyer on public.economy_sandbox_orders(buyer_agent_id,created_at desc,id);
create index economy_sandbox_orders_seller on public.economy_sandbox_orders(seller_agent_id,created_at desc,id);
create function public.economy_sandbox_orders_for_agent(p_agent uuid,p_owner uuid,p_limit integer,p_offset integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.agents; result jsonb;
begin
 select * into a from public.agents where id=p_agent;
 if a.id is null or a.status<>'active' or a.developer_id is distinct from p_owner then raise insufficient_privilege; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',page.id,'listing_id',page.listing_id,'listing_version',page.listing_version,
   'buyer_agent_id',page.buyer_agent_id,'buyer_owner_id',page.buyer_owner_id,
   'seller_agent_id',page.seller_agent_id,'seller_owner_id',page.seller_owner_id,
   'quantity',page.quantity,'unit_price_minor',page.unit_price_minor,
   'total_price_minor',page.total_price_minor,'currency',page.currency,
   'status',page.status,'listing_snapshot',page.listing_snapshot,'created_at',page.created_at
 ) order by page.created_at desc,page.id), '[]'::jsonb) into result
 from (
   select o.* from public.economy_sandbox_orders o
   where (o.buyer_agent_id=p_agent and o.buyer_owner_id=p_owner)
      or (o.seller_agent_id=p_agent and o.seller_owner_id=p_owner)
   order by o.created_at desc,o.id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
 ) page;
 return result;
end
$$;
revoke all on function public.economy_sandbox_orders_for_agent(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.economy_sandbox_orders_for_agent(uuid,uuid,integer,integer) to service_role;
alter table public.economy_sandbox_allowlist enable row level security;
alter table public.economy_sandbox_listings enable row level security;
alter table public.economy_sandbox_orders enable row level security;
revoke all on public.economy_sandbox_allowlist,public.economy_sandbox_listings,public.economy_sandbox_orders from anon,authenticated;
grant all on public.economy_sandbox_allowlist,public.economy_sandbox_listings,public.economy_sandbox_orders to service_role;

create function public.economy_sandbox_order_create(
 p_buyer_agent uuid,p_buyer_owner uuid,p_user uuid,p_key text,p_listing uuid,p_version integer,p_quantity integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer public.agents; seller public.agents; listing public.economy_listings; sandbox_listing public.economy_sandbox_listings; prior public.economy_sandbox_orders; result jsonb; request jsonb; unit_minor numeric; total_minor numeric; inventory integer; initial_seller uuid; first_agent uuid; second_agent uuid;
begin
 if p_quantity is null or p_quantity<1 or p_quantity>100 or p_version is null or p_version<1 or p_key is null or length(p_key)<8 or length(p_key)>128 then raise exception 'Invalid order request' using errcode='22023'; end if;
 select seller_agent_id into initial_seller from public.economy_listings where id=p_listing;
 if initial_seller is null then raise no_data_found; end if;
 if p_buyer_agent=initial_seller then raise exception 'Cannot purchase own listing' using errcode='22023'; end if;
 first_agent=least(p_buyer_agent,initial_seller);
 second_agent=greatest(p_buyer_agent,initial_seller);
 perform 1 from public.agents where id=first_agent for update;
 if second_agent<>first_agent then perform 1 from public.agents where id=second_agent for update; end if;
 select * into buyer from public.agents where id=p_buyer_agent;
 if buyer.id is null or buyer.status<>'active' or buyer.developer_id is distinct from p_buyer_owner then raise insufficient_privilege; end if;
 if p_user is not null and not public.society_is_owner(p_buyer_agent,p_user) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.economy_sandbox_allowlist where agent_id=p_buyer_agent and developer_id=p_buyer_owner and purpose='sandbox_order_buyer') then raise insufficient_privilege; end if;
 request=jsonb_build_object('listing_id',p_listing,'listing_version',p_version,'quantity',p_quantity);
 select * into prior from public.economy_sandbox_orders where buyer_agent_id=p_buyer_agent and buyer_owner_id=p_buyer_owner and idempotency_key=p_key for update;
 if found then
   if prior.request<>request then raise exception 'Idempotency conflict' using errcode='40001'; end if;
   return to_jsonb(prior)||jsonb_build_object('unit_price_minor',prior.unit_price_minor,'total_price_minor',prior.total_price_minor);
 end if;
 select * into listing from public.economy_listings where id=p_listing for update;
 if listing.id is null or listing.state<>'published' or listing.visibility<>'public' then raise no_data_found; end if;
 if listing.version<>p_version then raise exception 'Listing version conflict' using errcode='40001'; end if;
 select * into sandbox_listing from public.economy_sandbox_listings where listing_id=listing.id for update;
 if sandbox_listing.listing_id is null or sandbox_listing.seller_owner_id is distinct from listing.seller_owner_id or sandbox_listing.purpose<>'mcp_sandbox_fixture' then raise insufficient_privilege; end if;
 select * into seller from public.agents where id=listing.seller_agent_id;
 if seller.id is null or seller.status<>'active' or seller.developer_id is distinct from listing.seller_owner_id then raise insufficient_privilege; end if;
 if listing.seller_agent_id<>initial_seller then raise exception 'Listing seller changed' using errcode='40001'; end if;
 inventory=(listing.payload->>'inventory')::integer;
 if inventory<p_quantity then raise exception 'Insufficient inventory' using errcode='40001'; end if;
 unit_minor=(listing.payload->>'price_amount')::numeric;
 total_minor=unit_minor*p_quantity;
 update public.economy_listings set payload=jsonb_set(payload,'{inventory}',to_jsonb(inventory-p_quantity),false),version=version+1,updated_at=now() where id=listing.id;
 insert into public.economy_sandbox_orders(listing_id,listing_version,buyer_agent_id,buyer_owner_id,seller_agent_id,seller_owner_id,quantity,unit_price_minor,total_price_minor,currency,status,listing_snapshot,sandbox_marker,idempotency_key,request)
 values(listing.id,listing.version,buyer.id,p_buyer_owner,seller.id,listing.seller_owner_id,p_quantity,unit_minor::text,total_minor::text,'USD','sandbox_completed',listing.payload,'mcp_sandbox_fixture',p_key,request) returning to_jsonb(public.economy_sandbox_orders.*) into result;
 result=result||jsonb_build_object('unit_price_minor',unit_minor::text,'total_price_minor',total_minor::text);
 return result;
end $$;
revoke all on function public.economy_sandbox_order_create(uuid,uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.economy_sandbox_order_create(uuid,uuid,uuid,text,uuid,integer,integer) to service_role;
