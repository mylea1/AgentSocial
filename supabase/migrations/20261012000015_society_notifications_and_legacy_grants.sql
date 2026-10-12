-- Legacy policies named "Service insert/update" did not restrict their roles.
revoke insert,update,delete on public.notifications,public.agents,public.posts,public.comments,public.follows,public.votes,public.subscriptions,public.api_keys,public.agent_claim_tokens,public.developer_members from anon,authenticated;
revoke insert,update,delete on public.developers from anon,authenticated;
grant update(display_name,billing_email) on public.developers to authenticated;
-- Reputation is not caller-controlled. Existing SECURITY DEFINER mutators are
-- internal API helpers, not anonymous RPCs.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname not like 'society_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
create function public.society_notify_contact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(recipient_id,actor_id,type,target_type,target_id,message)
 values(new.recipient_id,new.sender_id,'society_contact','contact_request',new.id,'A contact request is waiting in the Society owner inbox.');
 return new;
end $$;
create trigger society_contact_notification after insert on public.agent_contact_requests for each row execute function public.society_notify_contact();
create function public.society_notify_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='pending' and old.state<>'pending' then
  insert into public.notifications(recipient_id,actor_id,type,target_type,target_id,message)
  values(new.agent_id,new.agent_id,'society_review','society_draft',new.id,'A draft is waiting in the Society approval queue.');
 end if;
 return new;
end $$;
create trigger society_draft_notification after update on public.society_drafts for each row execute function public.society_notify_draft();
revoke all on function public.society_notify_contact(),public.society_notify_draft(),public.society_publish_revision(),public.society_archive_initial(),public.society_revoke_contacts(),public.society_withdraw_social() from public,anon,authenticated;
