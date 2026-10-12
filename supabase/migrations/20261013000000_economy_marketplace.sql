-- Optional marketplace. No wallet, payment, or subscription state is modified.
create table public.economy_policies (
 agent_id uuid primary key references public.agents(id) on delete cascade,
 developer_id uuid not null references public.developers(id),
 allow_proposals boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.economy_listings (
 id uuid primary key default gen_random_uuid(),
 seller_agent_id uuid not null references public.agents(id) on delete cascade,
 seller_owner_id uuid not null references public.developers(id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 state text not null default 'draft' check(state in('draft','published','withdrawn')),
 visibility text not null default 'private' check(visibility in('private','public')),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 search_document tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(payload->>'title','') || ' ' || coalesce(payload->>'description','') || ' ' || coalesce(payload->>'tags',''))) stored,
 check ((state='published')=(visibility='public')),
 check (payload->>'listing_type' in ('physical_product','digital_product','agent_service','human_service')),
 check (payload->>'price_currency'='USD'),
 check (jsonb_typeof(payload->'price_amount')='string' and payload->>'price_amount' ~ '^[0-9]{1,15}$'),
 check ((payload->>'price_amount')::numeric > 0),
 check (jsonb_typeof(payload->'inventory')='number' and payload->>'inventory' ~ '^[0-9]{1,7}$')
);
create index economy_public_page on public.economy_listings(state,visibility,created_at desc,id);
create index economy_owner_page on public.economy_listings(seller_owner_id,seller_agent_id,created_at desc,id);
create index economy_search on public.economy_listings using gin(search_document);
create index economy_tags on public.economy_listings using gin((payload->'tags'));
create table public.economy_events (
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.agents(id) on delete cascade,
 developer_id uuid not null references public.developers(id),
 actor_user_id uuid,
 action text not null,
 object_id uuid,
 version integer,
 created_at timestamptz not null default now()
);
create table public.economy_requests (
 agent_id uuid not null references public.agents(id) on delete cascade,
 developer_id uuid not null references public.developers(id),
 request_key text not null check(length(request_key) between 8 and 128),
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(agent_id,developer_id,request_key)
);
alter table public.economy_policies enable row level security;
alter table public.economy_listings enable row level security;
alter table public.economy_events enable row level security;
alter table public.economy_requests enable row level security;
revoke all on public.economy_policies,public.economy_listings,public.economy_events,public.economy_requests from anon,authenticated;
grant all on public.economy_policies,public.economy_listings,public.economy_events,public.economy_requests to service_role;

create function public.economy_mutate(p_agent uuid,p_developer uuid,p_user uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.agents; l public.economy_listings; previous public.economy_requests; result jsonb; request jsonb;
begin
 select * into a from public.agents where id=p_agent for update;
 if a.id is null or a.status<>'active' or a.developer_id is distinct from p_developer then raise insufficient_privilege; end if;
 if p_user is not null and not public.society_is_owner(p_agent,p_user) then raise insufficient_privilege; end if;
 if p_user is null and (p_action not in ('create','edit') or not exists(select 1 from public.economy_policies where agent_id=p_agent and developer_id=p_developer and allow_proposals)) then raise insufficient_privilege; end if;
 request=jsonb_build_object('action',p_action,'data',p_data,'actor',p_user);
 select * into previous from public.economy_requests where agent_id=p_agent and developer_id=p_developer and request_key=p_key;
 if found then
   if previous.request<>request then raise exception 'Idempotency conflict' using errcode='40001'; end if;
   return previous.result;
 end if;
 if p_action='policy' then
   insert into public.economy_policies(agent_id,developer_id,allow_proposals) values(p_agent,p_developer,(p_data->>'allow_proposals')::boolean)
   on conflict(agent_id) do update set developer_id=excluded.developer_id,allow_proposals=excluded.allow_proposals,updated_at=now();
   result=jsonb_build_object('updated',true);
 elsif p_action='create' then
   insert into public.economy_listings(seller_agent_id,seller_owner_id,payload) values(p_agent,p_developer,p_data->'payload') returning * into l;
   result=to_jsonb(l)-'search_document';
 elsif p_action in ('edit','publish','withdraw') then
   select * into l from public.economy_listings where id=(p_data->>'id')::uuid and seller_agent_id=p_agent and seller_owner_id=p_developer for update;
   if l.id is null then raise no_data_found; end if;
   if l.version<>(p_data->>'version')::integer then raise exception 'Version conflict' using errcode='40001'; end if;
   if p_action='edit' then
     -- Agents cannot withdraw or change an already public offer by editing it.
     if p_user is null and l.state<>'draft' then raise insufficient_privilege; end if;
     update public.economy_listings set payload=p_data->'payload',state='draft',visibility='private',version=version+1,updated_at=now() where id=l.id returning * into l;
   elsif p_action='publish' then
     if l.state<>'draft' then raise exception 'Not a draft' using errcode='40001'; end if;
     update public.economy_listings set state='published',visibility='public',version=version+1,updated_at=now() where id=l.id returning * into l;
   else
     update public.economy_listings set state='withdrawn',visibility='private',version=version+1,updated_at=now() where id=l.id returning * into l;
   end if;
   result=to_jsonb(l)-'search_document';
 else raise exception 'Invalid action' using errcode='22023'; end if;
 insert into public.economy_events(agent_id,developer_id,actor_user_id,action,object_id,version) values(p_agent,p_developer,p_user,p_action,l.id,l.version);
 insert into public.economy_requests(agent_id,developer_id,request_key,request,result) values(p_agent,p_developer,p_key,request,result);
 return result;
end $$;
revoke all on function public.economy_mutate(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.economy_mutate(uuid,uuid,uuid,text,text,jsonb) to service_role;

create function public.economy_transfer() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.developer_id is distinct from new.developer_id then
   update public.economy_listings set state='withdrawn',visibility='private',version=version+1,updated_at=now() where seller_agent_id=new.id;
   delete from public.economy_policies where agent_id=new.id;
   if old.developer_id is not null then
     insert into public.economy_events(agent_id,developer_id,action) values(new.id,old.developer_id,'ownership_transfer');
   end if;
 end if;
 return new;
end $$;
revoke all on function public.economy_transfer() from public,anon,authenticated;
create trigger economy_transfer after update of developer_id on public.agents for each row execute function public.economy_transfer();
