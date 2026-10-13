create table public.inference_budgets (
 owner_id uuid primary key references public.developers(id),
 owner_daily numeric(30,0) not null default 1000000000000000 check(owner_daily between 1 and 1000000000000000),
 agent_limits jsonb not null default '{}'
);
alter table public.inference_budgets enable row level security;
revoke all on public.inference_budgets from public,anon,authenticated,service_role;
grant select on public.inference_budgets to service_role;
create function public.inference_budget(p_agent uuid,p_owner uuid,p_user uuid,p_value jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.inference_budgets; lim jsonb;
begin
 perform pg_advisory_xact_lock(716160001);
 if not exists(select 1 from public.agents where id=p_agent and developer_id=p_owner and status='active') then raise exception 'agent unavailable' using errcode='42501'; end if;
 if p_value is not null then
  if p_user is null or not public.society_is_owner(p_agent,p_user) then raise exception 'owner required' using errcode='42501'; end if;
  if not(p_value ?& array['ownerDaily','agentDaily','sessionCap']) or
   (p_value->>'ownerDaily')::numeric not between 1 and 1000000000000000 or
   (p_value->>'agentDaily')::numeric not between 1 and (p_value->>'ownerDaily')::numeric or
   (p_value->>'sessionCap')::numeric not between 1 and (p_value->>'agentDaily')::numeric
   then raise exception 'invalid budget' using errcode='22023'; end if;
  insert into public.inference_budgets(owner_id,owner_daily,agent_limits)
   values(p_owner,(p_value->>'ownerDaily')::numeric,jsonb_build_object(p_agent::text,p_value))
   on conflict(owner_id) do update set owner_daily=excluded.owner_daily,agent_limits=inference_budgets.agent_limits||excluded.agent_limits;
 end if;
 select * into b from public.inference_budgets where owner_id=p_owner;
 lim:=b.agent_limits->p_agent::text;
 return jsonb_build_object('ownerDaily',coalesce(b.owner_daily,1000000000000000)::text,'agentDaily',coalesce(lim->>'agentDaily','100000000000000'),'sessionCap',coalesce(lim->>'sessionCap','1000000000000'));
end $$;
-- A reservation is rejected inside the same transaction as ledger posting.
create function public.inference_budget_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare budget jsonb; owner_used numeric; agent_used numeric;
begin
 if old.reserved_at is null and new.reserved_at is not null then
  budget:=public.inference_budget(new.buyer_agent,new.buyer_owner,null,null);
  select coalesce(sum(case when state='SETTLED' then spent else cap end),0),
    coalesce(sum(case when buyer_agent=new.buyer_agent then (case when state='SETTLED' then spent else cap end) else 0 end),0)
  into owner_used,agent_used from public.inference_sessions where buyer_owner=new.buyer_owner and reserved_at>=date_trunc('day',now());
  if new.cap>(budget->>'sessionCap')::numeric or owner_used+new.cap>(budget->>'ownerDaily')::numeric or agent_used+new.cap>(budget->>'agentDaily')::numeric
  then raise exception 'owner or agent budget exceeded' using errcode='P0429'; end if;
 end if;
 return new;
end $$;
create trigger inference_budget_guard before update on public.inference_sessions for each row execute function public.inference_budget_guard();
revoke all on function public.inference_budget(uuid,uuid,uuid,jsonb),public.inference_budget_guard() from public,anon,authenticated;
grant execute on function public.inference_budget(uuid,uuid,uuid,jsonb) to service_role;
