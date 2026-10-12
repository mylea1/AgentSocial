-- Phase 1: private candidates, owner policy, atomic publication, public projections.
create table public.agent_privacy_policies (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  developer_id uuid not null references public.developers(id),
  publish_mode text not null default 'manual' check (publish_mode in ('disabled','manual','auto_with_rules')),
  auto_categories text[] not null default '{}' check (auto_categories <@ array['profile','experience','knowledge']::text[]),
  auto_tags text[] not null default '{}' check (cardinality(auto_tags) <= 30),
  contact_mode text not null default 'disabled' check (contact_mode in ('disabled','manual','auto_with_rules')),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
create table public.society_drafts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  developer_id uuid not null references public.developers(id),
  kind text not null check (kind in ('profile','experience','knowledge')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  findings text[] not null default '{}',
  state text not null default 'draft' check (state in ('draft','pending','published','rejected','withdrawn')),
  version integer not null default 1 check (version > 0),
  policy_version integer not null,
  request_key text not null check (length(request_key) between 8 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_id,request_key)
);
create index society_draft_owner_page on public.society_drafts(developer_id,created_at desc,id);
create index society_draft_agent_page on public.society_drafts(agent_id,created_at desc,id);
create table public.agent_public_profiles (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  draft_id uuid not null references public.society_drafts(id) on delete cascade,
  payload jsonb not null,
  claim_status text not null default 'self_reported' check (claim_status in ('self_reported','owner_confirmed')),
  updated_at timestamptz not null default now()
);
create table public.knowledge_entries (
  id uuid primary key references public.society_drafts(id) on delete cascade,
  author_agent_id uuid not null references public.agents(id) on delete cascade,
  content_type text not null check (content_type in ('experience','knowledge')),
  title text not null,
  problem_description text not null,
  solution text not null,
  tags text[] not null default '{}',
  verification_status text not null check (verification_status in ('self_reported','owner_confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index society_knowledge_tags on public.knowledge_entries using gin(tags);
create index society_knowledge_page on public.knowledge_entries(created_at desc,id);
create table public.agent_publication_approvals (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.society_drafts(id) on delete cascade,
  draft_version integer not null,
  policy_version integer not null,
  reviewer_user_id uuid,
  decision text not null check (decision in ('approved','rejected','automatic')),
  reviewed_at timestamptz not null default now(),
  unique(draft_id,draft_version)
);
create table public.society_audit_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  object_id uuid,
  created_at timestamptz not null default now()
);
create index society_audit_page on public.society_audit_events(agent_id,created_at desc,id);

create function public.society_is_owner(p_agent uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents a join public.developer_members m on m.developer_id=a.developer_id
    where a.id=p_agent and m.user_id=p_user and m.role in ('owner','admin'));
$$;
revoke all on function public.society_is_owner(uuid,uuid) from public;
grant execute on function public.society_is_owner(uuid,uuid) to authenticated,service_role;

alter table public.agent_privacy_policies enable row level security;
alter table public.society_drafts enable row level security;
alter table public.agent_public_profiles enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.agent_publication_approvals enable row level security;
alter table public.society_audit_events enable row level security;
revoke all on public.agent_privacy_policies,public.society_drafts,public.agent_publication_approvals,public.society_audit_events from anon,authenticated;
grant select on public.agent_privacy_policies,public.society_drafts,public.agent_publication_approvals,public.society_audit_events to authenticated;
revoke all on public.agent_public_profiles,public.knowledge_entries from anon,authenticated;
grant select on public.agent_public_profiles,public.knowledge_entries to anon,authenticated;
grant all on public.agent_privacy_policies,public.society_drafts,public.agent_public_profiles,public.knowledge_entries,public.agent_publication_approvals,public.society_audit_events to service_role;
create policy owner_read on public.agent_privacy_policies for select to authenticated using (public.society_is_owner(agent_id,auth.uid()));
create policy owner_read on public.society_drafts for select to authenticated using (public.society_is_owner(agent_id,auth.uid()) and developer_id=(select a.developer_id from public.agents a where a.id=agent_id));
create policy owner_read on public.society_audit_events for select to authenticated using (public.society_is_owner(agent_id,auth.uid()));
create policy owner_read on public.agent_publication_approvals for select to authenticated using (exists(select 1 from public.society_drafts d where d.id=draft_id));
create policy public_read on public.agent_public_profiles for select to anon,authenticated using (true);
create policy public_read on public.knowledge_entries for select to anon,authenticated using (true);

-- Close pre-existing private-data exposures before adding Society content.
drop policy if exists "Public read" on public.notifications;
create policy owner_read on public.notifications for select to authenticated using (public.society_is_owner(recipient_id,auth.uid()));
drop policy if exists "Service role full access" on public.agent_api_access_requests;
create policy service_access on public.agent_api_access_requests for all to service_role using (true) with check (true);
alter table public.agent_memory_audit_log enable row level security;
create policy owner_read on public.agent_memory_audit_log for select to authenticated using (public.society_is_owner(agent_id,auth.uid()));
drop policy if exists agents_own_memories on public.agent_memories;
create policy owner_read on public.agent_memories for select to authenticated using (public.society_is_owner(agent_id,auth.uid()));

create function public.society_set_policy(p_agent uuid,p_user uuid,p_mode text,p_categories text[],p_tags text[],p_contact text) returns public.agent_privacy_policies
language plpgsql security definer set search_path = '' as $$
declare a public.agents; result public.agent_privacy_policies;
begin
  select * into a from public.agents where id=p_agent for update;
  if not public.society_is_owner(p_agent,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.agent_privacy_policies(agent_id,developer_id,publish_mode,auto_categories,auto_tags,contact_mode)
    values(p_agent,a.developer_id,p_mode,p_categories,p_tags,p_contact)
    on conflict(agent_id) do update set publish_mode=p_mode,auto_categories=p_categories,auto_tags=p_tags,contact_mode=p_contact,
      developer_id=a.developer_id,version=agent_privacy_policies.version+1,updated_at=now() returning * into result;
  insert into public.society_audit_events(agent_id,actor_user_id,action) values(p_agent,p_user,'policy_updated');
  return result;
end $$;

create function public.society_review(p_draft uuid,p_user uuid,p_version integer,p_decision text) returns public.society_drafts
language plpgsql security definer set search_path = '' as $$
declare d public.society_drafts; p public.agent_privacy_policies; a public.agents; approved boolean; tags text[];
begin
  -- Lock Agent first across policy, review and ownership operations.
  select a0.* into a from public.agents a0 join public.society_drafts d0 on d0.agent_id=a0.id where d0.id=p_draft for update of a0;
  select * into d from public.society_drafts where id=p_draft for update;
  if d.id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  select * into p from public.agent_privacy_policies where agent_id=d.agent_id for update;
  if d.developer_id is distinct from a.developer_id or p.developer_id is distinct from a.developer_id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_user is not null and not public.society_is_owner(d.agent_id,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if d.version<>p_version or d.policy_version<>p.version then raise exception 'STALE_REVIEW' using errcode='40001'; end if;
  if d.state='published' and p_decision='approve' then return d; end if;
  if d.state<>'pending' then raise exception 'NOT_PENDING' using errcode='40001'; end if;
  if p_decision not in ('approve','reject') then raise exception 'INVALID_DECISION'; end if;
  approved := p_decision='approve';
  if approved and (p.publish_mode='disabled' or a.status<>'active' or cardinality(d.findings)>0) then raise exception 'PUBLICATION_BLOCKED' using errcode='42501'; end if;
  tags := array(select jsonb_array_elements_text(coalesce(d.payload->'tags',d.payload->'skills','[]'::jsonb)));
  if p_user is null and (not approved or p.publish_mode<>'auto_with_rules' or not(d.kind=any(p.auto_categories)) or cardinality(tags)=0 or not(tags <@ p.auto_tags)) then raise exception 'APPROVAL_REQUIRED' using errcode='42501'; end if;
  if approved and d.kind='profile' then
    insert into public.agent_public_profiles(agent_id,draft_id,payload,claim_status) values(d.agent_id,d.id,d.payload,case when p_user is null then 'self_reported' else 'owner_confirmed' end)
    on conflict(agent_id) do update set draft_id=d.id,payload=d.payload,claim_status=excluded.claim_status,updated_at=now();
  elsif approved then
    insert into public.knowledge_entries(id,author_agent_id,content_type,title,problem_description,solution,tags,verification_status)
      values(d.id,d.agent_id,d.kind,d.payload->>'title',d.payload->>'problem',d.payload->>'solution',tags,case when p_user is null then 'self_reported' else 'owner_confirmed' end);
  end if;
  insert into public.agent_publication_approvals(draft_id,draft_version,policy_version,reviewer_user_id,decision)
    values(d.id,d.version,p.version,p_user,case when not approved then 'rejected' when p_user is null then 'automatic' else 'approved' end);
  update public.society_drafts set state=case when approved then 'published' else 'rejected' end,updated_at=now() where id=d.id returning * into d;
  insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(d.agent_id,p_user,d.state,d.id);
  return d;
end $$;

create function public.society_withdraw(p_draft uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.society_drafts;
begin
  select * into d from public.society_drafts where id=p_draft for update;
  if not public.society_is_owner(d.agent_id,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  delete from public.agent_public_profiles where draft_id=d.id;
  delete from public.knowledge_entries where id=d.id;
  update public.society_drafts set state='withdrawn',updated_at=now() where id=d.id;
  insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(d.agent_id,p_user,'withdrawn',d.id);
end $$;

revoke all on function public.society_set_policy(uuid,uuid,text,text[],text[],text),public.society_review(uuid,uuid,integer,text),public.society_withdraw(uuid,uuid) from public,anon,authenticated;
grant execute on function public.society_set_policy(uuid,uuid,text,text[],text[],text),public.society_review(uuid,uuid,integer,text),public.society_withdraw(uuid,uuid) to service_role;
