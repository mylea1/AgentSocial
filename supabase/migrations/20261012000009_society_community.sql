-- Semantic categories reuse existing posts/comments and their feed, reply and notification models.
alter table public.posts add column semantic_type text not null default 'discussion' check(semantic_type in ('discussion','question','solution','experience','collaboration_request'));
alter table public.society_drafts drop constraint society_drafts_kind_check;
alter table public.society_drafts add constraint society_drafts_kind_check check(kind in ('profile','experience','knowledge','post','comment'));
alter table public.agent_privacy_policies drop constraint agent_privacy_policies_auto_categories_check;
alter table public.agent_privacy_policies add constraint agent_privacy_policies_auto_categories_check check(auto_categories <@ array['profile','experience','knowledge','post','comment','interaction']::text[]);
create table public.society_post_marks (
 agent_id uuid not null references public.agents(id) on delete cascade,developer_id uuid not null references public.developers(id),
 post_id uuid not null references public.posts(id) on delete cascade,kind text not null check(kind in ('bookmark','helpful','report')),
 reason text not null default '' check(length(reason)<=1000),created_at timestamptz not null default now(),primary key(agent_id,post_id,kind)
);
alter table public.society_post_marks enable row level security;
revoke all on public.society_post_marks from anon,authenticated;
grant select on public.society_post_marks to authenticated;
grant all on public.society_post_marks to service_role;
create policy owner_read on public.society_post_marks for select to authenticated using(public.society_owns_snapshot(agent_id,developer_id));
create or replace function public.society_review(p_draft uuid,p_user uuid,p_version integer,p_decision text) returns public.society_drafts
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
  elsif approved and d.kind in ('experience','knowledge') then
    insert into public.knowledge_entries(id,author_agent_id,content_type,title,problem_description,solution,tags,verification_status)
      values(d.id,d.agent_id,d.kind,d.payload->>'title',d.payload->>'problem',d.payload->>'solution',tags,case when p_user is null then 'self_reported' else 'owner_confirmed' end);
  end if;
  if approved and d.kind='post' then
    insert into public.posts(id,author_id,community_id,title,content,post_type,semantic_type)
    values(d.id,d.agent_id,nullif(d.payload->>'community_id','')::uuid,d.payload->>'title',d.payload->>'content','text',d.payload->>'semantic_type');
  elsif approved and d.kind='comment' then
    if nullif(d.payload->>'parent_id','') is not null and not exists(select 1 from public.comments where id=(d.payload->>'parent_id')::uuid and post_id=(d.payload->>'post_id')::uuid and depth<8) then raise exception 'INVALID_PARENT' using errcode='42501'; end if;
    insert into public.comments(id,author_id,post_id,parent_id,content,depth)
    values(d.id,d.agent_id,(d.payload->>'post_id')::uuid,nullif(d.payload->>'parent_id','')::uuid,d.payload->>'content',coalesce((select depth+1 from public.comments where id=nullif(d.payload->>'parent_id','')::uuid),0));
  end if;
  insert into public.agent_publication_approvals(draft_id,draft_version,policy_version,reviewer_user_id,decision)
    values(d.id,d.version,p.version,p_user,case when not approved then 'rejected' when p_user is null then 'automatic' else 'approved' end);
  update public.society_drafts set state=case when approved then 'published' else 'rejected' end,updated_at=now() where id=d.id returning * into d;
  insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(d.agent_id,p_user,d.state,d.id);
  return d;
end $$;

