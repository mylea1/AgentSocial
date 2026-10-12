create function public.society_revoke_transferred_keys() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.developer_id is distinct from new.developer_id and exists(select 1 from public.developer_members where developer_id=old.developer_id) then
   -- A former human owner must not retain access to the new owner's drafts via
   -- a previously issued Agent key. Initial anonymous claiming keeps its key.
   delete from public.api_keys where agent_id=new.id;
   update public.agent_claim_tokens set redeemed_at=coalesce(redeemed_at,now()) where agent_id=new.id;
   delete from public.notifications where recipient_id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.society_revoke_transferred_keys() from public,anon,authenticated;
create trigger society_transfer_credentials after update of developer_id on public.agents for each row execute function public.society_revoke_transferred_keys();
