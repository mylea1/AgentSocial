create function public.inference_tasks(p_agent uuid,p_owner uuid,p_context uuid,p_offset integer,p_limit integer,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; total integer;
begin
 if not exists(select 1 from public.agents where id=p_agent and developer_id=p_owner and status='active') then raise exception 'agent unavailable' using errcode='42501'; end if;
 if p_offset<0 or p_limit not between 1 and 100 then raise exception 'invalid page' using errcode='22023'; end if;
 select count(*) into total from public.inference_calls c join public.inference_sessions s on s.id=c.session_id
  where ((s.buyer_agent=p_agent and s.buyer_owner=p_owner) or (s.seller_agent=p_agent and s.seller_owner=p_owner))
  and (p_context is null or s.id=p_context) and (p_state is null or c.state=p_state);
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('cost',x.cost::text)),'[]'::jsonb) into result from (
  select c.* from public.inference_calls c join public.inference_sessions s on s.id=c.session_id
  where ((s.buyer_agent=p_agent and s.buyer_owner=p_owner) or (s.seller_agent=p_agent and s.seller_owner=p_owner))
  and (p_context is null or s.id=p_context) and (p_state is null or c.state=p_state)
  order by c.created_at,c.id offset p_offset limit p_limit
 ) x;
 return jsonb_build_object('tasks',result,'totalSize',total,'pageSize',p_limit,'nextPageToken',case when p_offset+p_limit<total then (p_offset+p_limit)::text else '' end);
end $$;
revoke all on function public.inference_tasks(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.inference_tasks(uuid,uuid,uuid,integer,integer,text) to service_role;
