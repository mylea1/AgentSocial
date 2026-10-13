create function public.inference_discover() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (
  select s.agent_id,a.name,a.display_name,s.version,s.policy,s.updated_at
  from public.inference_services s join public.agents a on a.id=s.agent_id
  where s.enabled and a.status='active' and a.developer_id=s.owner_id
  order by s.updated_at desc limit 100
 ) x
$$;
revoke all on function public.inference_discover() from public,anon,authenticated;
grant execute on function public.inference_discover() to service_role;
