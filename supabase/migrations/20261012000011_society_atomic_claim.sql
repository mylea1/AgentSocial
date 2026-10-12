-- A claim token bootstraps ownership; it cannot transfer an already owned Agent.
create function public.society_redeem_claim(p_token uuid,p_user uuid,p_developer uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.agent_claim_tokens;a public.agents;
begin
 select * into t from public.agent_claim_tokens where id=p_token;
 select * into a from public.agents where id=t.agent_id for update;
 select * into t from public.agent_claim_tokens where id=p_token for update;
 if t.id is null or t.redeemed_at is not null or t.expires_at<=now() then raise exception 'INVALID_CLAIM_TOKEN' using errcode='40001'; end if;
 if not exists(select 1 from public.developer_members where developer_id=p_developer and user_id=p_user and role in ('owner','admin')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.developer_members where developer_id=a.developer_id) or exists(select 1 from public.agent_privacy_policies where agent_id=a.id) then raise exception 'ALREADY_OWNED' using errcode='42501'; end if;
 update public.agent_claim_tokens set redeemed_at=now(),redeemed_by_user_id=p_user where agent_id=a.id and redeemed_at is null;
 update public.agents set developer_id=p_developer where id=a.id;
 return a.id;
end $$;
revoke all on function public.society_redeem_claim(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.society_redeem_claim(uuid,uuid,uuid) to service_role;
