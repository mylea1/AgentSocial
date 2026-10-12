create function public.society_auto_review(p_draft uuid,p_version integer) returns public.society_drafts
language sql security definer set search_path = '' as $$
  select public.society_review(p_draft,null,p_version,'approve');
$$;
revoke all on function public.society_auto_review(uuid,integer) from public,anon,authenticated;
grant execute on function public.society_auto_review(uuid,integer) to service_role;
