create or replace function public.society_mcp_key(p_agent uuid,p_user uuid,p_hash text,p_prefix text) returns uuid
language plpgsql security definer set search_path='' as $$
declare key_id uuid;
begin
 perform 1 from public.agents where id=p_agent and status='active' for update;
 if not found or not public.society_is_owner(p_agent,p_user) then raise insufficient_privilege; end if;
 -- Rotate only MCP-issued credentials, not unrelated Agent API keys.
 delete from public.api_keys where agent_id=p_agent and name='Society MCP connector';
 insert into public.api_keys(agent_id,key_hash,key_prefix,name,permissions,expires_at)
 values(p_agent,p_hash,p_prefix,'Society MCP connector','["read","write"]'::jsonb,now()+interval '30 days') returning id into key_id;
 insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(p_agent,p_user,'mcp_key_rotated',key_id);
 return key_id;
end $$;
