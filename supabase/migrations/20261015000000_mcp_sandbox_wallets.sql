-- Local sandbox balances only. These rows never represent or settle real money.
create table public.economy_sandbox_wallets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  owner_id uuid not null references public.developers(id),
  balance_minor numeric(20,0) not null default 0 check(balance_minor >= 0),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index economy_sandbox_wallet_one_current on public.economy_sandbox_wallets(agent_id) where is_current;
create index economy_sandbox_wallet_owner on public.economy_sandbox_wallets(agent_id,owner_id,created_at desc);

create table public.economy_sandbox_wallet_requests (
  wallet_id uuid not null references public.economy_sandbox_wallets(id),
  idempotency_key text not null check(length(idempotency_key) between 8 and 128),
  amount_minor numeric(20,0) not null check(amount_minor > 0),
  balance_after_minor numeric(20,0) not null check(balance_after_minor >= 0),
  created_at timestamptz not null default now(),
  primary key(wallet_id,idempotency_key)
);

create table public.economy_sandbox_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.economy_sandbox_wallets(id),
  owner_id uuid not null references public.developers(id),
  entry_type text not null check(entry_type in ('recharge','order_debit','order_credit')),
  amount_minor numeric(20,0) not null check(amount_minor > 0),
  order_id uuid references public.economy_sandbox_orders(id),
  recharge_key text,
  created_at timestamptz not null default now(),
  check ((entry_type='recharge' and order_id is null and recharge_key is not null)
      or (entry_type in ('order_debit','order_credit') and order_id is not null and recharge_key is null))
);
create unique index economy_sandbox_wallet_ledger_recharge on public.economy_sandbox_wallet_ledger(wallet_id,recharge_key) where entry_type='recharge';
create unique index economy_sandbox_wallet_ledger_order on public.economy_sandbox_wallet_ledger(order_id,entry_type) where order_id is not null;
create index economy_sandbox_wallet_ledger_history on public.economy_sandbox_wallet_ledger(wallet_id,created_at,id);

alter table public.economy_sandbox_wallets enable row level security;
alter table public.economy_sandbox_wallet_requests enable row level security;
alter table public.economy_sandbox_wallet_ledger enable row level security;
revoke all on public.economy_sandbox_wallets,public.economy_sandbox_wallet_requests,public.economy_sandbox_wallet_ledger from public,anon,authenticated;
grant all on public.economy_sandbox_wallets,public.economy_sandbox_wallet_requests,public.economy_sandbox_wallet_ledger to service_role;

create function public.economy_sandbox_wallet_owner_transfer() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.developer_id is distinct from new.developer_id then
    update public.economy_sandbox_wallets set is_current=false,closed_at=now()
      where agent_id=new.id and is_current;
    if new.developer_id is not null then
      insert into public.economy_sandbox_wallets(agent_id,owner_id,balance_minor)
        values(new.id,new.developer_id,0);
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.economy_sandbox_wallet_owner_transfer() from public,anon,authenticated;
create trigger economy_sandbox_wallet_owner_transfer after update of developer_id on public.agents
for each row execute function public.economy_sandbox_wallet_owner_transfer();

create function public.economy_sandbox_wallet_get(p_agent uuid,p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.agents; w public.economy_sandbox_wallets;
begin
  select * into a from public.agents where id=p_agent;
  if a.id is null or a.status<>'active' or a.developer_id is distinct from p_owner then raise insufficient_privilege; end if;
  insert into public.economy_sandbox_wallets(agent_id,owner_id,balance_minor)
    values(p_agent,p_owner,0) on conflict do nothing;
  select * into w from public.economy_sandbox_wallets where agent_id=p_agent and is_current for update;
  if w.owner_id is distinct from p_owner then raise insufficient_privilege; end if;
  return jsonb_build_object('agent_id',w.agent_id,'owner_id',w.owner_id,'balance_minor',w.balance_minor::text,'currency','USD','virtual',true);
end
$$;
revoke all on function public.economy_sandbox_wallet_get(uuid,uuid) from public,anon,authenticated;
grant execute on function public.economy_sandbox_wallet_get(uuid,uuid) to service_role;

-- Only trusted service_role callers can mint sandbox funds. Amount is text to avoid JSON number rounding.
create function public.economy_sandbox_wallet_recharge(p_agent uuid,p_owner uuid,p_amount_minor text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.agents; w public.economy_sandbox_wallets; previous public.economy_sandbox_wallet_requests; amount numeric;
begin
  if p_amount_minor is null or p_amount_minor !~ '^[1-9][0-9]{0,19}$' or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'Invalid virtual recharge request' using errcode='22023';
  end if;
  amount=p_amount_minor::numeric;
  if amount>99999999999999999999 then raise exception 'Recharge amount too large' using errcode='22023'; end if;
  select * into a from public.agents where id=p_agent for update;
  if a.id is null or a.status<>'active' or a.developer_id is distinct from p_owner then raise insufficient_privilege; end if;
  insert into public.economy_sandbox_wallets(agent_id,owner_id,balance_minor)
    values(p_agent,p_owner,0) on conflict do nothing;
  select * into w from public.economy_sandbox_wallets where agent_id=p_agent and is_current for update;
  if w.owner_id is distinct from p_owner then raise insufficient_privilege; end if;
  select * into previous from public.economy_sandbox_wallet_requests where wallet_id=w.id and idempotency_key=p_idempotency_key;
  if found then
    if previous.amount_minor<>amount then raise exception 'Idempotency conflict' using errcode='40001'; end if;
    return jsonb_build_object('agent_id',p_agent,'owner_id',p_owner,'amount_minor',previous.amount_minor::text,'balance_minor',previous.balance_after_minor::text,'currency','USD','virtual',true);
  end if;
  if w.balance_minor+amount>99999999999999999999 then raise exception 'Wallet balance too large' using errcode='22003'; end if;
  update public.economy_sandbox_wallets set balance_minor=balance_minor+amount where id=w.id returning * into w;
  insert into public.economy_sandbox_wallet_requests(wallet_id,idempotency_key,amount_minor,balance_after_minor)
    values(w.id,p_idempotency_key,amount,w.balance_minor);
  insert into public.economy_sandbox_wallet_ledger(wallet_id,owner_id,entry_type,amount_minor,recharge_key)
    values(w.id,p_owner,'recharge',amount,p_idempotency_key);
  return jsonb_build_object('agent_id',p_agent,'owner_id',p_owner,'amount_minor',amount::text,'balance_minor',w.balance_minor::text,'currency','USD','virtual',true);
end
$$;
revoke all on function public.economy_sandbox_wallet_recharge(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.economy_sandbox_wallet_recharge(uuid,uuid,text,text) to service_role;

-- Order and stock mutations are already one transaction in economy_sandbox_order_create.
-- The trigger debits/credits within that transaction, so any failure rolls inventory back too.
create function public.economy_sandbox_order_settle() returns trigger
language plpgsql security definer set search_path='' as $$
declare amount numeric; buyer_wallet public.economy_sandbox_wallets; seller_wallet public.economy_sandbox_wallets;
begin
  if new.sandbox_marker<>'mcp_sandbox_fixture' or new.status<>'sandbox_completed' then raise insufficient_privilege; end if;
  if new.total_price_minor !~ '^[1-9][0-9]{0,19}$' then raise exception 'Invalid sandbox order amount' using errcode='22023'; end if;
  amount=new.total_price_minor::numeric;
  insert into public.economy_sandbox_wallets(agent_id,owner_id,balance_minor)
    values(new.buyer_agent_id,new.buyer_owner_id,0) on conflict do nothing;
  insert into public.economy_sandbox_wallets(agent_id,owner_id,balance_minor)
    values(new.seller_agent_id,new.seller_owner_id,0) on conflict do nothing;
  -- Lock both accounts in a stable order, including reciprocal concurrent trades.
  perform 1 from public.economy_sandbox_wallets
    where agent_id in (new.buyer_agent_id,new.seller_agent_id) and is_current order by id for update;
  select * into buyer_wallet from public.economy_sandbox_wallets where agent_id=new.buyer_agent_id and is_current;
  select * into seller_wallet from public.economy_sandbox_wallets where agent_id=new.seller_agent_id and is_current;
  if buyer_wallet.owner_id is distinct from new.buyer_owner_id or seller_wallet.owner_id is distinct from new.seller_owner_id then raise insufficient_privilege; end if;
  if buyer_wallet.balance_minor<amount then raise exception 'Insufficient virtual funds' using errcode='P0001'; end if;
  if seller_wallet.balance_minor+amount>99999999999999999999 then raise exception 'Seller wallet balance too large' using errcode='22003'; end if;
  update public.economy_sandbox_wallets set balance_minor=balance_minor-amount where id=buyer_wallet.id;
  update public.economy_sandbox_wallets set balance_minor=balance_minor+amount where id=seller_wallet.id;
  insert into public.economy_sandbox_wallet_ledger(wallet_id,owner_id,entry_type,amount_minor,order_id)
    values (buyer_wallet.id,new.buyer_owner_id,'order_debit',amount,new.id),
           (seller_wallet.id,new.seller_owner_id,'order_credit',amount,new.id);
  return new;
end
$$;
revoke all on function public.economy_sandbox_order_settle() from public,anon,authenticated;
create trigger economy_sandbox_order_settle after insert on public.economy_sandbox_orders
for each row execute function public.economy_sandbox_order_settle();

