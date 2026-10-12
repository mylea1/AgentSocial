create function public.society_revoke_contacts() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.contact_mode is distinct from old.contact_mode or new.developer_id is distinct from old.developer_id then
   update public.agent_conversations set state='closed' where sender_id=new.agent_id or recipient_id=new.agent_id;
 end if;
 return new;
end $$;
create trigger society_contact_revoke after update on public.agent_privacy_policies for each row execute function public.society_revoke_contacts();
