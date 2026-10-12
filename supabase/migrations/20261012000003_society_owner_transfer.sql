create function public.society_owner_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.developer_id is distinct from new.developer_id then
    delete from public.agent_public_profiles where agent_id=new.id;
    delete from public.knowledge_entries where author_agent_id=new.id;
    update public.society_drafts set state='withdrawn',updated_at=now() where agent_id=new.id;
    if new.developer_id is null then
      delete from public.agent_privacy_policies where agent_id=new.id;
    else
      update public.agent_privacy_policies set developer_id=new.developer_id,publish_mode='disabled',contact_mode='disabled',auto_categories='{}',auto_tags='{}',version=version+1,updated_at=now() where agent_id=new.id;
    end if;
    insert into public.society_audit_events(agent_id,action) values(new.id,'ownership_changed');
  end if;
  return new;
end $$;
revoke all on function public.society_owner_changed() from public,anon,authenticated;
create trigger society_owner_changed after update of developer_id on public.agents
  for each row execute function public.society_owner_changed();
