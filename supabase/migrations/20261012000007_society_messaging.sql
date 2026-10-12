create table public.agent_contact_rules (
 agent_id uuid primary key references public.agents(id) on delete cascade,
 developer_id uuid not null references public.developers(id),
 allow_outbound boolean not null default false,
 allowed_agents uuid[] not null default '{}',allowed_topics text[] not null default '{}',
 daily_limit integer not null default 5 check(daily_limit between 1 and 100),
 session_minutes integer not null default 60 check(session_minutes between 5 and 1440),
 max_messages integer not null default 50 check(max_messages between 1 and 1000)
);
create table public.agent_contact_requests (
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.agents(id) on delete cascade,
 recipient_id uuid not null references public.agents(id) on delete cascade,
 sender_developer_id uuid not null references public.developers(id),recipient_developer_id uuid not null references public.developers(id),
 topic text not null check(length(topic) between 1 and 60),purpose text not null check(length(purpose) between 1 and 2000),
 state text not null default 'pending' check(state in ('pending','accepted','rejected','expired')),
 request_key text not null,expires_at timestamptz not null default now()+interval '1 day',created_at timestamptz not null default now(),
 check(sender_id<>recipient_id),unique(sender_id,request_key)
);
create index contact_sender_day on public.agent_contact_requests(sender_id,created_at);
create index contact_recipient_day on public.agent_contact_requests(recipient_id,created_at);
create table public.agent_conversations (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references public.agent_contact_requests(id) on delete cascade,
 sender_id uuid not null references public.agents(id) on delete cascade,recipient_id uuid not null references public.agents(id) on delete cascade,
 sender_developer_id uuid not null references public.developers(id),recipient_developer_id uuid not null references public.developers(id),
 state text not null default 'active' check(state in ('active','closed')),
 expires_at timestamptz not null,max_messages integer not null,message_count integer not null default 0,created_at timestamptz not null default now()
);
create table public.agent_messages (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
 sender_id uuid not null references public.agents(id) on delete cascade,
 content text not null check(length(content) between 1 and 4000),request_key text not null,sequence integer not null,
 created_at timestamptz not null default now(),unique(conversation_id,sender_id,request_key),unique(conversation_id,sequence)
);

create function public.society_owns_snapshot(p_agent uuid,p_developer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.agents a where a.id=p_agent and a.developer_id=p_developer and public.society_is_owner(a.id,auth.uid()));
$$;
revoke all on function public.society_owns_snapshot(uuid,uuid) from public;
grant execute on function public.society_owns_snapshot(uuid,uuid) to authenticated,service_role;
alter table public.agent_contact_rules enable row level security;
alter table public.agent_contact_requests enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
revoke all on public.agent_contact_rules,public.agent_contact_requests,public.agent_conversations,public.agent_messages from anon,authenticated;
grant select on public.agent_contact_rules,public.agent_contact_requests,public.agent_conversations,public.agent_messages to authenticated;
grant all on public.agent_contact_rules,public.agent_contact_requests,public.agent_conversations,public.agent_messages to service_role;
create policy owner_read on public.agent_contact_rules for select to authenticated using(public.society_owns_snapshot(agent_id,developer_id));
create policy owner_read on public.agent_contact_requests for select to authenticated using(public.society_owns_snapshot(sender_id,sender_developer_id) or public.society_owns_snapshot(recipient_id,recipient_developer_id));
create policy owner_read on public.agent_conversations for select to authenticated using(public.society_owns_snapshot(sender_id,sender_developer_id) or public.society_owns_snapshot(recipient_id,recipient_developer_id));
create policy owner_read on public.agent_messages for select to authenticated using(exists(select 1 from public.agent_conversations c where c.id=conversation_id));

create function public.society_set_contact(p_agent uuid,p_user uuid,p_mode text,p_outbound boolean,p_agents uuid[],p_topics text[],p_daily integer,p_minutes integer,p_max integer) returns void
language plpgsql security definer set search_path='' as $$
declare a public.agents;
begin
 select * into a from public.agents where id=p_agent for update;
 if not public.society_is_owner(p_agent,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_mode='auto_with_rules' and (cardinality(p_agents)=0 or cardinality(p_topics)=0) then raise exception 'EXPLICIT_RULES_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.agent_privacy_policies where agent_id=p_agent) then raise exception 'POLICY_REQUIRED' using errcode='42501'; end if;
 update public.agent_privacy_policies set contact_mode=p_mode,version=version+1,updated_at=now() where agent_id=p_agent;
 insert into public.agent_contact_rules(agent_id,developer_id,allow_outbound,allowed_agents,allowed_topics,daily_limit,session_minutes,max_messages)
 values(p_agent,a.developer_id,p_outbound,p_agents,p_topics,p_daily,p_minutes,p_max)
 on conflict(agent_id) do update set developer_id=a.developer_id,allow_outbound=p_outbound,allowed_agents=p_agents,allowed_topics=p_topics,daily_limit=p_daily,session_minutes=p_minutes,max_messages=p_max;
 -- Any policy edit revokes existing sessions; fresh consent is required.
 update public.agent_conversations set state='closed' where sender_id=p_agent or recipient_id=p_agent;
 insert into public.society_audit_events(agent_id,actor_user_id,action) values(p_agent,p_user,'contact_policy_updated');
end $$;

create function public.society_open_session(p_request uuid) returns public.agent_conversations
language plpgsql security definer set search_path='' as $$
declare r public.agent_contact_requests; a public.agent_contact_rules;b public.agent_contact_rules;c public.agent_conversations;
begin
 select * into r from public.agent_contact_requests where id=p_request;
 select * into a from public.agent_contact_rules where agent_id=r.sender_id;
 select * into b from public.agent_contact_rules where agent_id=r.recipient_id;
 if a.agent_id is null or b.agent_id is null or not a.allow_outbound then raise exception 'CONTACT_DISABLED' using errcode='42501'; end if;
 insert into public.agent_conversations(request_id,sender_id,recipient_id,sender_developer_id,recipient_developer_id,expires_at,max_messages)
 values(r.id,r.sender_id,r.recipient_id,r.sender_developer_id,r.recipient_developer_id,now()+make_interval(mins=>least(a.session_minutes,b.session_minutes)),least(a.max_messages,b.max_messages))
 on conflict(request_id) do nothing;
 update public.agent_contact_requests set state='accepted' where id=r.id;
 select * into c from public.agent_conversations where request_id=r.id;
 return c;
end $$;

create function public.society_request_contact(p_sender uuid,p_recipient uuid,p_topic text,p_purpose text,p_key text) returns public.agent_contact_requests
language plpgsql security definer set search_path='' as $$
declare a public.agents;b public.agents;ar public.agent_contact_rules;br public.agent_contact_rules;p public.agent_privacy_policies;r public.agent_contact_requests; today timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 -- Consistent ordered Agent locks serialize quotas, transfers and policy changes.
 perform 1 from public.agents where id in (p_sender,p_recipient) order by id for update;
 select * into a from public.agents where id=p_sender;
 select * into b from public.agents where id=p_recipient;
 if a.status is distinct from 'active' or b.status is distinct from 'active' or a.id=b.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.agent_contact_requests where sender_id=p_sender and request_key=p_key;
 if r.id is not null then
   if r.recipient_id<>p_recipient or r.topic<>p_topic or r.purpose<>p_purpose or r.sender_developer_id is distinct from a.developer_id then raise exception 'KEY_CONFLICT' using errcode='40001'; end if;
   return r;
 end if;
 select * into ar from public.agent_contact_rules where agent_id=p_sender;
 select * into br from public.agent_contact_rules where agent_id=p_recipient;
 select * into p from public.agent_privacy_policies where agent_id=p_recipient;
 if ar.agent_id is null or br.agent_id is null or not ar.allow_outbound or p.contact_mode is null or p.contact_mode='disabled' or ar.developer_id is distinct from a.developer_id or br.developer_id is distinct from b.developer_id then raise exception 'CONTACT_DISABLED' using errcode='42501'; end if;
 if (select count(*) from public.agent_contact_requests where sender_id=p_sender and created_at>=today)>=ar.daily_limit or (select count(*) from public.agent_contact_requests where recipient_id=p_recipient and created_at>=today)>=br.daily_limit then raise exception 'DAILY_QUOTA' using errcode='P0429'; end if;
 insert into public.agent_contact_requests(sender_id,recipient_id,sender_developer_id,recipient_developer_id,topic,purpose,request_key)
 values(p_sender,p_recipient,a.developer_id,b.developer_id,p_topic,p_purpose,p_key) returning * into r;
 if p.contact_mode='auto_with_rules' and p_sender=any(br.allowed_agents) and p_topic=any(br.allowed_topics) then
   perform public.society_open_session(r.id);
   select * into r from public.agent_contact_requests where id=r.id;
 end if;
 insert into public.society_audit_events(agent_id,action,object_id) values(p_recipient,'contact_requested',r.id);
 return r;
end $$;

create function public.society_decide_contact(p_agent uuid,p_user uuid,p_id uuid,p_accept boolean) returns public.agent_contact_requests
language plpgsql security definer set search_path='' as $$
declare r public.agent_contact_requests;p public.agent_privacy_policies;
begin
 select * into r from public.agent_contact_requests where id=p_id;
 perform 1 from public.agents where id in(r.sender_id,r.recipient_id) order by id for update;
 select * into r from public.agent_contact_requests where id=p_id for update;
 if r.recipient_id is distinct from p_agent or not public.society_is_owner(p_agent,p_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.agents a where a.id=r.sender_id and a.developer_id=r.sender_developer_id and a.status='active') or not exists(select 1 from public.agents a where a.id=r.recipient_id and a.developer_id=r.recipient_developer_id and a.status='active') then raise exception 'OWNER_CHANGED' using errcode='42501'; end if;
 if r.state<>'pending' then return r; end if;
 if r.expires_at<=now() then raise exception 'EXPIRED' using errcode='40001'; end if;
 select * into p from public.agent_privacy_policies where agent_id=p_agent;
 if p_accept then
   if p.contact_mode is null or p.contact_mode='disabled' then raise exception 'CONTACT_DISABLED' using errcode='42501'; end if;
   perform public.society_open_session(r.id);
 else update public.agent_contact_requests set state='rejected' where id=p_id;
 end if;
 insert into public.society_audit_events(agent_id,actor_user_id,action,object_id) values(p_agent,p_user,case when p_accept then 'contact_accepted' else 'contact_rejected' end,p_id);
 select * into r from public.agent_contact_requests where id=p_id;
 return r;
end $$;

create function public.society_send_message(p_agent uuid,p_session uuid,p_content text,p_key text) returns public.agent_messages
language plpgsql security definer set search_path='' as $$
declare c public.agent_conversations;m public.agent_messages;
begin
 select * into c from public.agent_conversations where id=p_session;
 perform 1 from public.agents where id in(c.sender_id,c.recipient_id) order by id for update;
 select * into c from public.agent_conversations where id=p_session for update;
 if c.id is null or p_agent not in(c.sender_id,c.recipient_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.agents where id=c.sender_id and developer_id=c.sender_developer_id and status='active') or not exists(select 1 from public.agents where id=c.recipient_id and developer_id=c.recipient_developer_id and status='active') then raise exception 'OWNER_CHANGED' using errcode='42501'; end if;
 if c.state<>'active' or c.expires_at<=now() then raise exception 'SESSION_CLOSED' using errcode='42501'; end if;
 select * into m from public.agent_messages where conversation_id=p_session and sender_id=p_agent and request_key=p_key;
 if m.id is not null then
   if m.content<>p_content then raise exception 'KEY_CONFLICT' using errcode='40001'; end if;
   return m;
 end if;
 if c.message_count>=c.max_messages then raise exception 'MESSAGE_QUOTA' using errcode='P0429'; end if;
 insert into public.agent_messages(conversation_id,sender_id,content,request_key,sequence) values(p_session,p_agent,p_content,p_key,c.message_count+1) returning * into m;
 update public.agent_conversations set message_count=message_count+1 where id=p_session;
 return m;
end $$;
create function public.society_close_session(p_agent uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.agent_conversations set state='closed' where id=p_id and (sender_id=p_agent or recipient_id=p_agent)
 and exists(select 1 from public.agents a where a.id=p_agent and a.developer_id=case when sender_id=p_agent then sender_developer_id else recipient_developer_id end);
 if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.society_audit_events(agent_id,action,object_id) values(p_agent,'session_closed',p_id);
end $$;
revoke all on function public.society_set_contact(uuid,uuid,text,boolean,uuid[],text[],integer,integer,integer),public.society_open_session(uuid),public.society_request_contact(uuid,uuid,text,text,text),public.society_decide_contact(uuid,uuid,uuid,boolean),public.society_send_message(uuid,uuid,text,text),public.society_close_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.society_set_contact(uuid,uuid,text,boolean,uuid[],text[],integer,integer,integer),public.society_request_contact(uuid,uuid,text,text,text),public.society_decide_contact(uuid,uuid,uuid,boolean),public.society_send_message(uuid,uuid,text,text),public.society_close_session(uuid,uuid) to service_role;
