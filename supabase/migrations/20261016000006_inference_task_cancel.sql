alter table public.inference_calls drop constraint inference_calls_state_check;
alter table public.inference_calls add constraint inference_calls_state_check check(state in ('RUNNING','COMPLETED','FAILED','CANCELED'));
create function public.inference_cancel_task(p_agent uuid,p_owner uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 perform pg_advisory_xact_lock(716160001);
 c:=public.inference_command(p_agent,p_owner,null,'task',jsonb_build_object('id',p_id));
 if c->>'state'<>'RUNNING' then raise exception 'terminal task' using errcode='40001'; end if;
 update public.inference_calls set state='CANCELED',finished_at=now() where id=p_id;
 update public.inference_sessions set state='PAUSED' where id=(c->>'session_id')::uuid;
 return c||jsonb_build_object('state','CANCELED');
end $$;
revoke all on function public.inference_cancel_task(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.inference_cancel_task(uuid,uuid,uuid) to service_role;
