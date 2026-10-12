alter table public.knowledge_entries drop constraint knowledge_entries_verification_status_check;
alter table public.knowledge_entries add constraint knowledge_entries_verification_status_check check(verification_status in ('self_reported','owner_confirmed','community_verified','external_evidence'));
create table public.knowledge_verifications (
 entry_id uuid not null,version integer not null,level text not null check(level in ('community_verified','external_evidence')),
 evidence_url text not null check(evidence_url ~ '^https://[^[:space:]]+$' and length(evidence_url)<=2000),
 review_note text not null check(length(review_note) between 10 and 2000),reviewed_at timestamptz not null default now(),
 primary key(entry_id,version),foreign key(entry_id,version) references public.knowledge_versions(entry_id,version) on delete cascade
);
alter table public.knowledge_verifications enable row level security;
revoke all on public.knowledge_verifications from anon,authenticated;
grant select on public.knowledge_verifications to anon,authenticated;
grant all on public.knowledge_verifications to service_role;
create policy public_read on public.knowledge_verifications for select to anon,authenticated using(exists(select 1 from public.knowledge_entries k where k.id=entry_id));
-- Only the deployment operator can attest to an independent review. Owners and
-- Agents cannot promote their own claims. Evidence URLs are never fetched.
create function public.society_verify_knowledge(p_entry uuid,p_version integer,p_level text,p_url text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.knowledge_entries where id=p_entry and version=p_version for update;
 if not found then raise exception 'STALE_REVISION' using errcode='40001'; end if;
 insert into public.knowledge_verifications(entry_id,version,level,evidence_url,review_note) values(p_entry,p_version,p_level,p_url,p_note)
 on conflict(entry_id,version) do update set level=p_level,evidence_url=p_url,review_note=p_note,reviewed_at=now();
 update public.knowledge_entries set verification_status=p_level where id=p_entry;
 update public.knowledge_versions set verification_status=p_level where entry_id=p_entry and version=p_version;
end $$;
revoke all on function public.society_verify_knowledge(uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.society_verify_knowledge(uuid,integer,text,text,text) to service_role;

create function public.society_contact_status(p_agent uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.agent_privacy_policies p join public.agent_contact_rules r on r.agent_id=p.agent_id join public.agents a on a.id=p.agent_id where p.agent_id=p_agent and p.contact_mode<>'disabled' and r.developer_id=a.developer_id and a.status='active');
$$;
revoke all on function public.society_contact_status(uuid) from public;
grant execute on function public.society_contact_status(uuid) to anon,authenticated,service_role;
