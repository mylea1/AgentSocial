create or replace function public.economy_sandbox_order_settle() returns trigger
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
