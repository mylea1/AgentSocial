-- Separate TEST_USD accounting. No real currency, deposits or withdrawals.
create table public.inference_services (
 agent_id uuid primary key references public.agents(id),
 owner_id uuid not null references public.developers(id),
 enabled boolean not null default false,
 version integer not null default 1 check(version>0),
 policy jsonb not null,
 updated_at timestamptz not null default now()
);
create table public.inference_sessions (
 id uuid primary key default gen_random_uuid(),
 buyer_agent uuid not null references public.agents(id),
 seller_agent uuid not null references public.agents(id),
 buyer_owner uuid not null references public.developers(id),
 seller_owner uuid not null references public.developers(id),
 snapshot jsonb not null,
 quote_digest text not null,
 state text not null check(state in ('AWAITING_PROVIDER_APPROVAL','AWAITING_PAYER_APPROVAL','READY','RUNNING','PAUSED','SETTLED','CANCELLED','EXPIRED','FAILED')),
 cap numeric(30,0) not null check(cap>0),
 spent numeric(30,0) not null default 0 check(spent>=0 and spent<=cap),
 refunded numeric(30,0) not null default 0 check(refunded>=0 and refunded<=spent),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 reserved_at timestamptz,
 check(buyer_owner<>seller_owner)
);
create index inference_sessions_buyer on public.inference_sessions(buyer_owner,created_at desc);
create index inference_sessions_seller on public.inference_sessions(seller_owner,created_at desc);
create table public.inference_calls (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.inference_sessions(id),
 request_key text not null check(length(request_key) between 8 and 128),
 request_digest text not null,
 state text not null check(state in ('RUNNING','COMPLETED','FAILED')),
 input_bound integer not null check(input_bound between 0 and 20000),
 output_bound integer not null check(output_bound between 1 and 4096),
 usage jsonb,
 cost numeric(30,0) not null default 0 check(cost>=0),
 response text,
 provider_request_id text,
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 unique(session_id,request_key)
);
create index inference_calls_lease on public.inference_calls(state,created_at);
create table public.inference_vouchers (
 id uuid primary key default gen_random_uuid(),
 request_key text not null unique,
 kind text not null check(kind in ('fund','reserve','settle','refund')),
 session_id uuid references public.inference_sessions(id),
 created_at timestamptz not null default now()
);
create table public.inference_entries (
 id bigint generated always as identity primary key,
 voucher_id uuid not null references public.inference_vouchers(id),
 account text not null,
 amount numeric(30,0) not null check(amount<>0)
);
create index inference_entries_account on public.inference_entries(account);
create function public.inference_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'append only' using errcode='42501'; end $$;
create trigger inference_entries_immutable before update or delete on public.inference_entries for each row execute function public.inference_immutable();
create trigger inference_vouchers_immutable before update or delete on public.inference_vouchers for each row execute function public.inference_immutable();
create function public.inference_balanced() returns trigger language plpgsql set search_path='' as $$
begin
 if (select coalesce(sum(amount),0) from public.inference_entries where voucher_id=new.id)<>0
   or (select count(*) from public.inference_entries where voucher_id=new.id)<2 then
   raise exception 'unbalanced voucher';
 end if;
 return null;
end $$;
create constraint trigger inference_voucher_balance after insert on public.inference_vouchers
 deferrable initially deferred for each row execute function public.inference_balanced();
create function public.inference_post(p_key text,p_kind text,p_session uuid,p_entries jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 insert into public.inference_vouchers(request_key,kind,session_id) values(p_key,p_kind,p_session) returning id into v;
 insert into public.inference_entries(voucher_id,account,amount)
 select v,key,value::numeric from jsonb_each_text(p_entries) where value::numeric<>0;
end $$;
create function public.inference_balance(p_account text) returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce(sum(amount),0) from public.inference_entries where account=p_account
$$;
-- Local sandbox serializes financial transitions. This deliberately favors correctness
-- over throughput; replace with ordered account locks before production scaling.
create function public.inference_command(p_agent uuid,p_owner uuid,p_user uuid,p_action text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.agents; svc public.inference_services; s public.inference_sessions;
 c public.inference_calls; policy jsonb; snap jsonb; v_id uuid; n numeric; fee numeric;
 available text; held text; prior numeric; max_cost numeric; tokens integer; outputs integer;
begin
 perform pg_advisory_xact_lock(716160001);
 select * into a from public.agents where id=p_agent;
 if a.id is null or a.developer_id<>p_owner or a.status<>'active' then raise exception 'agent unavailable' using errcode='42501'; end if;
 if p_user is not null and not public.society_is_owner(p_agent,p_user) then raise exception 'owner required' using errcode='42501'; end if;
 available:='owner:'||p_owner::text;
 if p_action='state' then
  return jsonb_build_object('balance',public.inference_balance(available)::text,
   'services',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.inference_services where enabled or owner_id=p_owner order by updated_at desc limit 100) x),'[]'::jsonb),
   'sessions',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('cap',x.cap::text,'spent',x.spent::text,'refunded',x.refunded::text)) from (select * from public.inference_sessions where (buyer_agent=p_agent and buyer_owner=p_owner) or (seller_agent=p_agent and seller_owner=p_owner) order by created_at desc limit 100) x),'[]'::jsonb));
 end if;
 if p_action='service' then
  if p_user is null then raise exception 'owner required' using errcode='42501'; end if;
  policy:=p_value->'policy';
  if not (policy ?& array['model','topics','maxCalls','maxInput','maxOutput','concurrency','maxSession','dailyBudget','input','cachedInput','output']) or policy->>'model'<>'mock-v1' or jsonb_typeof(policy->'topics')<>'array' or jsonb_array_length(policy->'topics') not between 1 and 20
    or (policy->>'maxCalls')::int not between 1 and 100 or (policy->>'maxInput')::int not between 1 and 20000
    or (policy->>'maxOutput')::int not between 1 and 4096 or (policy->>'concurrency')::int not between 1 and 10
    or (policy->>'maxSession')::numeric not between 1 and 1000000000000000
    or (policy->>'dailyBudget')::numeric not between 1 and 10000000000000000
    or (policy->>'input')::numeric not between 0 and 1000000000
    or (policy->>'cachedInput')::numeric not between 0 and 1000000000
    or (policy->>'output')::numeric not between 0 and 1000000000 then raise exception 'invalid policy' using errcode='22023'; end if;
  insert into public.inference_services(agent_id,owner_id,enabled,policy) values(p_agent,p_owner,(p_value->>'enabled')::boolean,policy)
   on conflict(agent_id) do update set owner_id=p_owner,enabled=excluded.enabled,policy=excluded.policy,version=inference_services.version+1,updated_at=now();
  return jsonb_build_object('saved',true);
 end if;
 if p_action='fund' then
  if p_user is null then raise exception 'owner required' using errcode='42501'; end if;
  n:=(p_value->>'amount')::numeric;
  if n is null or n<>trunc(n) or n not between 1 and 1000000000000000 or length(p_value->>'key') not between 8 and 128 then raise exception 'invalid funding' using errcode='22023'; end if;
  select id into v_id from public.inference_vouchers where request_key='fund:'||p_owner||':'||(p_value->>'key');
  if found then
   if (select amount from public.inference_entries where voucher_id=v_id and account=available)<>n then raise exception 'replay mismatch' using errcode='40001'; end if;
  else
   perform public.inference_post('fund:'||p_owner||':'||(p_value->>'key'),'fund',null,jsonb_build_object(available,n::text,'mock:issuer',(-n)::text));
  end if;
  return jsonb_build_object('balance',public.inference_balance(available)::text);
 end if;
 if p_action='quote' then
  select * into svc from public.inference_services where agent_id=(p_value->>'seller')::uuid and enabled;
  if not found or svc.owner_id=p_owner or not exists(select 1 from public.agents where id=svc.agent_id and developer_id=svc.owner_id and status='active') then raise exception 'service unavailable' using errcode='42501'; end if;
  n:=(p_value->>'cap')::numeric;
  if n is null or n<>trunc(n) or n not between 1 and (svc.policy->>'maxSession')::numeric or not (svc.policy->'topics' ? (p_value->>'topic')) then raise exception 'invalid quote' using errcode='22023'; end if;
  snap:=svc.policy||jsonb_build_object('version',svc.version,'commissionPercent',10,'currency','TEST_USD','buyerOwner',p_owner,'sellerOwner',svc.owner_id,'cap',n::text,'topic',p_value->>'topic','tools','[]'::jsonb,'usagePolicy','mock_gateway_only','refundPolicy','provider_owner_full_or_partial');
  insert into public.inference_sessions(buyer_agent,seller_agent,buyer_owner,seller_owner,snapshot,quote_digest,state,cap,expires_at)
   values(p_agent,svc.agent_id,p_owner,svc.owner_id,snap,encode(extensions.digest(snap::text,'sha256'),'hex'),'AWAITING_PROVIDER_APPROVAL',n,now()+interval '1 hour') returning id into v_id;
  return jsonb_build_object('id',v_id);
 end if;
 if p_action in ('task','cancel_task') then
  select * into c from public.inference_calls where id=(p_value->>'id')::uuid;
  if not found then raise exception 'task unavailable' using errcode='P0002'; end if;
  select * into s from public.inference_sessions where id=c.session_id;
  if not ((s.buyer_agent=p_agent and s.buyer_owner=p_owner) or (s.seller_agent=p_agent and s.seller_owner=p_owner)) then raise exception 'task unavailable' using errcode='P0002'; end if;
  if p_action='cancel_task' then
   if c.state<>'RUNNING' then raise exception 'task terminal' using errcode='40001'; end if;
   update public.inference_calls set state='FAILED',finished_at=now() where id=c.id;
   update public.inference_sessions set state='PAUSED' where id=s.id;
   c.state:='FAILED';
  end if;
  return to_jsonb(c)||jsonb_build_object('cost',c.cost::text);
 end if;
 select * into s from public.inference_sessions where id=(p_value->>'session')::uuid for update;
 if not found or not ((s.buyer_agent=p_agent and s.buyer_owner=p_owner) or (s.seller_agent=p_agent and s.seller_owner=p_owner)) then raise exception 'session unavailable' using errcode='42501'; end if;
 held:='held:'||s.id;
 if p_action='calls' then
  return coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('cost',x.cost::text)) from (select * from public.inference_calls where session_id=s.id order by created_at) x),'[]'::jsonb);
 end if;
 if p_action='provider_approve' then
  if p_user is null or p_agent<>s.seller_agent or s.state<>'AWAITING_PROVIDER_APPROVAL' or s.expires_at<=now() then raise exception 'approval denied' using errcode='42501'; end if;
  update public.inference_sessions set state='AWAITING_PAYER_APPROVAL' where id=s.id;
 elsif p_action='approve' then
  if p_user is null or p_agent<>s.buyer_agent or s.state<>'AWAITING_PAYER_APPROVAL' or s.expires_at<=now() or p_value->>'digest'<>s.quote_digest then raise exception 'approval denied' using errcode='42501'; end if;
  if public.inference_balance(available)<s.cap then raise exception 'insufficient mock funds' using errcode='P0429'; end if;
  -- Owner aggregate cap, including all of its agents, cannot be bypassed by parallel agents.
  select coalesce(sum(case when state='SETTLED' then spent else cap end),0) into prior from public.inference_sessions where buyer_owner=p_owner and reserved_at>=date_trunc('day',now());
  if prior+s.cap>1000000000000000 then raise exception 'owner daily cap' using errcode='P0429'; end if;
  perform public.inference_post('reserve:'||s.id,'reserve',s.id,jsonb_build_object(available,(-s.cap)::text,held,s.cap::text));
  update public.inference_sessions set state='READY',reserved_at=now() where id=s.id;
 elsif p_action='begin' then
  if p_agent<>s.buyer_agent then raise exception 'payer required' using errcode='42501'; end if;
  select * into c from public.inference_calls where session_id=s.id and request_key=p_value->>'key';
  if found then
   if c.request_digest<>p_value->>'digest' then raise exception 'replay mismatch' using errcode='40001'; end if;
   return to_jsonb(c)||jsonb_build_object('replay',true,'cost',c.cost::text);
  end if;
  select * into svc from public.inference_services where agent_id=s.seller_agent and owner_id=s.seller_owner and enabled;
  if not found or s.state<>'READY' or s.expires_at<=now() or not exists(select 1 from public.agents where id=s.seller_agent and developer_id=s.seller_owner and status='active') then raise exception 'execution denied' using errcode='42501'; end if;
  tokens:=(p_value->>'input')::int; outputs:=(p_value->>'output')::int;
  if tokens not between 0 and least((s.snapshot->>'maxInput')::int,(svc.policy->>'maxInput')::int) or outputs not between 1 and least((s.snapshot->>'maxOutput')::int,(svc.policy->>'maxOutput')::int) then raise exception 'token cap' using errcode='P0429'; end if;
  if (select count(*) from public.inference_calls where session_id=s.id)>=(s.snapshot->>'maxCalls')::int then raise exception 'call cap' using errcode='P0429'; end if;
  if (select count(*) from public.inference_sessions where seller_agent=s.seller_agent and state='RUNNING')>=(svc.policy->>'concurrency')::int then raise exception 'concurrency cap' using errcode='P0429'; end if;
  max_cost:=tokens*(s.snapshot->>'input')::numeric+outputs*(s.snapshot->>'output')::numeric;
  if s.spent+max_cost>s.cap then raise exception 'session cap' using errcode='P0429'; end if;
  select coalesce(sum(c2.cost),0) into prior from public.inference_calls c2 join public.inference_sessions s2 on s2.id=c2.session_id where s2.seller_agent=s.seller_agent and c2.created_at>=date_trunc('day',now());
  select prior+coalesce(sum(c2.input_bound*(s2.snapshot->>'input')::numeric+c2.output_bound*(s2.snapshot->>'output')::numeric),0) into prior from public.inference_calls c2 join public.inference_sessions s2 on s2.id=c2.session_id where s2.seller_agent=s.seller_agent and c2.state='RUNNING';
  if prior+max_cost>(svc.policy->>'dailyBudget')::numeric then raise exception 'provider daily cap' using errcode='P0429'; end if;
  insert into public.inference_calls(session_id,request_key,request_digest,state,input_bound,output_bound) values(s.id,p_value->>'key',p_value->>'digest','RUNNING',tokens,outputs) returning * into c;
  update public.inference_sessions set state='RUNNING' where id=s.id;
  return to_jsonb(c)||jsonb_build_object('snapshot',s.snapshot,'cost',c.cost::text);
 elsif p_action='pause' then
  if s.state<>'READY' then raise exception 'invalid state' using errcode='40001'; end if;
  update public.inference_sessions set state='PAUSED' where id=s.id;
 elsif p_action='resume' then
  if p_user is null or p_agent<>s.buyer_agent or s.state<>'PAUSED' then raise exception 'owner required' using errcode='42501'; end if;
  update public.inference_sessions set state='READY' where id=s.id;
 elsif p_action='close' then
  if s.state='SETTLED' then return jsonb_build_object('settled',true); end if;
  -- A crashed gateway call is never guessed or charged. Durable lease expires after 5 minutes.
  update public.inference_calls set state='FAILED',finished_at=now() where session_id=s.id and state='RUNNING' and created_at<now()-interval '5 minutes';
  if exists(select 1 from public.inference_calls where session_id=s.id and state='RUNNING') then raise exception 'call running' using errcode='40001'; end if;
  if s.reserved_at is null then update public.inference_sessions set state='CANCELLED' where id=s.id;
  else
   fee:=floor((s.spent+5)/10);
   perform public.inference_post('settle:'||s.id,'settle',s.id,jsonb_build_object(held,(-s.cap)::text,'owner:'||s.buyer_owner,(s.cap-s.spent)::text,'owner:'||s.seller_owner,(s.spent-fee)::text,'platform:fees',fee::text));
   update public.inference_sessions set state='SETTLED' where id=s.id;
  end if;
 elsif p_action='refund' then
  if p_user is null or p_agent<>s.seller_agent or s.state<>'SETTLED' then raise exception 'provider owner required' using errcode='42501'; end if;
  n:=(p_value->>'amount')::numeric;
  if exists(select 1 from public.inference_vouchers where request_key='refund:'||s.id||':'||(p_value->>'key')) then return jsonb_build_object('replay',true); end if;
  if n is null or n<>trunc(n) or n<=0 or n+s.refunded>s.spent then raise exception 'invalid refund' using errcode='22023'; end if;
  fee:=floor((s.refunded+n+5)/10)-floor((s.refunded+5)/10);
  if public.inference_balance('owner:'||s.seller_owner)<n-fee then raise exception 'insufficient earnings' using errcode='P0429'; end if;
  perform public.inference_post('refund:'||s.id||':'||(p_value->>'key'),'refund',s.id,jsonb_build_object('owner:'||s.buyer_owner,n::text,'owner:'||s.seller_owner,(-(n-fee))::text,'platform:fees',(-fee)::text));
  update public.inference_sessions set refunded=refunded+n where id=s.id;
 else raise exception 'invalid action' using errcode='22023';
 end if;
 return jsonb_build_object('ok',true);
end $$;

-- Only the server gateway invokes this function. Never expose it through action dispatch.
create function public.inference_complete(p_call uuid,p_request text,p_output text,p_input integer,p_output_tokens integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.inference_calls; s public.inference_sessions; n numeric;
begin
 perform pg_advisory_xact_lock(716160001);
 select * into c from public.inference_calls where id=p_call for update;
 if not found or c.state<>'RUNNING' or c.created_at<now()-interval '5 minutes' then raise exception 'invalid lease' using errcode='40001'; end if;
 select * into s from public.inference_sessions where id=c.session_id for update;
 if p_input<>c.input_bound or p_output_tokens not between 0 and c.output_bound or length(p_output)<>p_output_tokens then raise exception 'invalid mock usage' using errcode='22023'; end if;
 n:=p_input*(s.snapshot->>'input')::numeric+p_output_tokens*(s.snapshot->>'output')::numeric;
 if s.spent+n>s.cap then raise exception 'cap exceeded' using errcode='P0429'; end if;
 update public.inference_calls set state='COMPLETED',usage=jsonb_build_object('inputTokens',p_input,'cachedInputTokens',0,'outputTokens',p_output_tokens,'verification','mock_gateway'),cost=n,response=p_output,provider_request_id=p_request,finished_at=now() where id=c.id;
 update public.inference_sessions set spent=spent+n,state='READY' where id=s.id;
 return jsonb_build_object('id',c.id,'cost',n::text,'response',p_output);
end $$;

alter table public.inference_services enable row level security;
alter table public.inference_sessions enable row level security;
alter table public.inference_calls enable row level security;
alter table public.inference_vouchers enable row level security;
alter table public.inference_entries enable row level security;
revoke all on public.inference_services,public.inference_sessions,public.inference_calls,public.inference_vouchers,public.inference_entries from public,anon,authenticated,service_role;
grant select on public.inference_services,public.inference_sessions,public.inference_calls,public.inference_vouchers,public.inference_entries to service_role;
revoke all on function public.inference_command(uuid,uuid,uuid,text,jsonb),public.inference_complete(uuid,text,text,integer,integer),public.inference_post(text,text,uuid,jsonb),public.inference_balance(text),public.inference_balanced(),public.inference_immutable() from public,anon,authenticated,service_role;
grant execute on function public.inference_command(uuid,uuid,uuid,text,jsonb),public.inference_complete(uuid,text,text,integer,integer) to service_role;
