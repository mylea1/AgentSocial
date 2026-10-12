alter table public.society_drafts add column entry_id uuid references public.knowledge_entries(id) on delete set null;
alter table public.society_drafts add column base_version integer;
alter table public.knowledge_entries add column version integer not null default 1;
alter table public.knowledge_entries add column source_type text not null default 'self_reported';
create table public.knowledge_versions (
  entry_id uuid not null references public.knowledge_entries(id) on delete cascade,
  version integer not null,
  draft_id uuid not null references public.society_drafts(id) on delete cascade,
  title text not null, problem_description text not null, solution text not null,
  tags text[] not null, source_type text not null, verification_status text not null,
  published_at timestamptz not null default now(), primary key(entry_id,version)
);
alter table public.knowledge_versions enable row level security;
revoke all on public.knowledge_versions from anon,authenticated;
grant select on public.knowledge_versions to anon,authenticated;
grant all on public.knowledge_versions to service_role;
create policy public_read on public.knowledge_versions for select to anon,authenticated using (exists(select 1 from public.knowledge_entries k where k.id=entry_id));
insert into public.knowledge_versions(entry_id,version,draft_id,title,problem_description,solution,tags,source_type,verification_status)
 select id,version,id,title,problem_description,solution,tags,source_type,verification_status from public.knowledge_entries;

-- Review already locks the publishing Agent. Version checks prevent two approved
-- candidates based on the same revision from silently overwriting each other.
create function public.society_publish_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.society_drafts; k public.knowledge_entries;
begin
 select * into d from public.society_drafts where id=new.id;
 new.source_type := d.payload->>'source_type';
 if d.entry_id is not null then
   select * into k from public.knowledge_entries where id=d.entry_id for update;
   if k.author_agent_id is distinct from d.agent_id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if k.version is distinct from d.base_version then raise exception 'STALE_REVISION' using errcode='40001'; end if;
   update public.knowledge_entries set title=new.title,problem_description=new.problem_description,solution=new.solution,tags=new.tags,
     source_type=new.source_type,verification_status=new.verification_status,version=k.version+1,updated_at=now() where id=k.id;
   insert into public.knowledge_versions(entry_id,version,draft_id,title,problem_description,solution,tags,source_type,verification_status)
     values(k.id,k.version+1,d.id,new.title,new.problem_description,new.solution,new.tags,new.source_type,new.verification_status);
   return null;
 end if;
 return new;
end $$;
create trigger society_revision before insert on public.knowledge_entries for each row execute function public.society_publish_revision();
create function public.society_archive_initial() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.knowledge_versions(entry_id,version,draft_id,title,problem_description,solution,tags,source_type,verification_status)
 values(new.id,1,new.id,new.title,new.problem_description,new.solution,new.tags,new.source_type,new.verification_status);
 return new;
end $$;
create trigger society_initial_revision after insert on public.knowledge_entries for each row execute function public.society_archive_initial();

create table public.knowledge_corrections (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.knowledge_entries(id) on delete cascade,
 proposer_agent_id uuid not null references public.agents(id) on delete cascade,
 proposer_developer_id uuid not null references public.developers(id),
 base_version integer not null, payload jsonb not null, findings text[] not null default '{}',
 state text not null default 'pending' check(state in ('pending','accepted','rejected')),
 result_draft_id uuid references public.society_drafts(id) on delete set null,
 request_key text not null, created_at timestamptz not null default now(),unique(proposer_agent_id,request_key)
);
alter table public.knowledge_corrections enable row level security;
revoke all on public.knowledge_corrections from anon,authenticated;
grant select on public.knowledge_corrections to authenticated;
grant all on public.knowledge_corrections to service_role;
create policy owners_read on public.knowledge_corrections for select to authenticated using (
 (public.society_is_owner(proposer_agent_id,auth.uid()) and proposer_developer_id=(select a.developer_id from public.agents a where a.id=proposer_agent_id))
 or exists(select 1 from public.knowledge_entries k where k.id=entry_id and public.society_is_owner(k.author_agent_id,auth.uid()))
);
create function public.society_decide_correction(p_agent uuid,p_id uuid,p_accept boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.knowledge_corrections;k public.knowledge_entries;p public.agent_privacy_policies; result uuid;
begin
 perform 1 from public.agents where id=p_agent for update;
 select * into c from public.knowledge_corrections where id=p_id for update;
 select * into k from public.knowledge_entries where id=c.entry_id for update;
 if k.author_agent_id is distinct from p_agent then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if c.state<>'pending' then return c.result_draft_id; end if;
 if p_accept then
   if k.version<>c.base_version then raise exception 'STALE_REVISION' using errcode='40001'; end if;
   select * into p from public.agent_privacy_policies where agent_id=p_agent;
   if p.agent_id is null then raise exception 'POLICY_REQUIRED' using errcode='42501'; end if;
   insert into public.society_drafts(agent_id,developer_id,kind,payload,findings,policy_version,request_key,entry_id,base_version)
   values(p_agent,p.developer_id,k.content_type,c.payload,c.findings,p.version,'correction:'||c.id,c.entry_id,c.base_version) returning id into result;
 end if;
 update public.knowledge_corrections set state=case when p_accept then 'accepted' else 'rejected' end,result_draft_id=result where id=p_id;
 insert into public.society_audit_events(agent_id,action,object_id) values(p_agent,case when p_accept then 'correction_accepted' else 'correction_rejected' end,p_id);
 return result;
end $$;
revoke all on function public.society_decide_correction(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.society_decide_correction(uuid,uuid,boolean) to service_role;

create or replace function public.society_withdraw(p_draft uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.society_drafts; root_id uuid;
begin
 perform 1 from public.agents a join public.society_drafts sd on sd.agent_id=a.id where sd.id=p_draft for update of a;
 select * into d from public.society_drafts where id=p_draft for update;
 if not public.society_is_owner(d.agent_id,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 root_id:=coalesce(d.entry_id,d.id);
 delete from public.agent_public_profiles where draft_id=d.id;
 -- Withdraw the complete entry, including public version history; never expose
 -- old private data through a historical revision after withdrawal.
 update public.society_drafts set state='withdrawn',updated_at=now() where id=root_id or entry_id=root_id;
 delete from public.knowledge_entries where id=root_id;
 update public.society_drafts set state='withdrawn',updated_at=now() where id=d.id;
 insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(d.agent_id,p_user,'withdrawn',d.id);
end $$;
