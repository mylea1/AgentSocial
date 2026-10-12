alter table public.knowledge_entries add column search_document tsvector generated always as
  (setweight(to_tsvector('simple',title),'A') || setweight(to_tsvector('simple',problem_description),'B') || to_tsvector('simple',solution)) stored;
create index society_knowledge_search on public.knowledge_entries using gin(search_document);
alter table public.agent_public_profiles add column search_document tsvector generated always as
  (to_tsvector('simple',payload)) stored;
create index society_profile_search on public.agent_public_profiles using gin(search_document);

create function public.society_search(p_query text default '',p_tag text default '',p_kind text default '',p_active boolean default false,p_confirmed boolean default false,p_page integer default 1)
returns table(id uuid,agent_id uuid,kind text,title text,summary text,tags text[],claim_status text,rank real,total bigint)
language sql stable security invoker set search_path = '' as $$
 with q as (select websearch_to_tsquery('simple',left(p_query,200)) query),
 documents as (
   select k.id,k.author_agent_id agent_id,k.content_type kind,k.title,left(k.problem_description,600) summary,k.tags,k.verification_status claim_status,k.search_document document,a.status,
     k.created_at
   from public.knowledge_entries k join public.agents a on a.id=k.author_agent_id
   union all
   select p.agent_id,p.agent_id,'agent',a.name,left(p.payload->>'bio',600),
     array(select jsonb_array_elements_text(coalesce(p.payload->'skills','[]') || coalesce(p.payload->'interests','[]') || coalesce(p.payload->'topics','[]'))),
     p.claim_status,p.search_document || setweight(to_tsvector('simple',a.name),'A'),a.status,p.updated_at
   from public.agent_public_profiles p join public.agents a on a.id=p.agent_id
   union all
   select c.id,null::uuid,'community',c.name,left(coalesce(c.description,''),600),'{}'::text[],'self_reported',
     to_tsvector('simple',c.name || ' ' || coalesce(c.description,'')),'active',c.created_at
   from public.communities c
 ), ranked as (
   select d.*,ts_rank_cd(d.document,q.query) rank from documents d cross join q
   where (p_query='' or d.document @@ q.query)
   and (p_tag='' or lower(p_tag)=any(d.tags))
   and (p_kind='' or d.kind=p_kind)
   and (not p_active or d.status='active')
   and (not p_confirmed or d.claim_status='owner_confirmed')
 )
 select r.id,r.agent_id,r.kind,r.title,r.summary,r.tags,r.claim_status,r.rank,count(*) over()
 from ranked r order by r.rank desc,r.created_at desc,r.id
 limit 20 offset ((greatest(1,least(p_page,1000))-1)*20);
$$;
revoke all on function public.society_search(text,text,text,boolean,boolean,integer) from public;
grant execute on function public.society_search(text,text,text,boolean,boolean,integer) to anon,authenticated,service_role;
