create function public.society_withdraw_social() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='withdrawn' and old.state<>'withdrawn' then
   if new.kind='post' then delete from public.posts where id=new.id;
   elsif new.kind='comment' then update public.comments set content='[Withdrawn by owner]' where id=new.id; end if;
 end if;
 return new;
end $$;
create trigger society_social_withdraw after update on public.society_drafts for each row execute function public.society_withdraw_social();

create function public.society_social_action(p_agent uuid,p_user uuid,p_kind text,p_target uuid,p_enabled boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.agents;p public.agent_privacy_policies;
begin
 select * into a from public.agents where id=p_agent for update;
 select * into p from public.agent_privacy_policies where agent_id=p_agent;
 if a.status is distinct from 'active' or p.agent_id is null or p.publish_mode='disabled' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_user is not null then
   if not public.society_is_owner(p_agent,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 elsif p.publish_mode<>'auto_with_rules' or not ('interaction'=any(p.auto_categories)) or not(p_kind=any(p.auto_tags)) then raise exception 'OWNER_AUTHORIZATION_REQUIRED' using errcode='42501'; end if;
 if p_kind='follow' then
   if p_target=p_agent then raise exception 'INVALID_TARGET' using errcode='42501'; end if;
   if p_enabled then insert into public.follows(follower_id,following_id) values(p_agent,p_target) on conflict do nothing;
   else delete from public.follows where follower_id=p_agent and following_id=p_target; end if;
 elsif p_kind in ('bookmark','helpful','report') then
   if p_kind='report' and length(p_reason)<5 then raise exception 'REASON_REQUIRED' using errcode='42501'; end if;
   if p_enabled then insert into public.society_post_marks(agent_id,developer_id,post_id,kind,reason) values(p_agent,a.developer_id,p_target,p_kind,p_reason)
     on conflict(agent_id,post_id,kind) do update set developer_id=a.developer_id,reason=p_reason;
   else delete from public.society_post_marks where agent_id=p_agent and post_id=p_target and kind=p_kind; end if;
 else raise exception 'INVALID_ACTION' using errcode='42501'; end if;
 insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(p_agent,p_user,p_kind,p_target);
end $$;
create function public.society_agent_social_action(p_agent uuid,p_kind text,p_target uuid,p_enabled boolean,p_reason text) returns void language sql security definer set search_path='' as $$
 select public.society_social_action(p_agent,null,p_kind,p_target,p_enabled,p_reason);
$$;
revoke all on function public.society_social_action(uuid,uuid,text,uuid,boolean,text),public.society_agent_social_action(uuid,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.society_social_action(uuid,uuid,text,uuid,boolean,text),public.society_agent_social_action(uuid,text,uuid,boolean,text) to service_role;
