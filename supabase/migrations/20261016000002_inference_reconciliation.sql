create function public.inference_snapshot_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.buyer_agent,new.seller_agent,new.buyer_owner,new.seller_owner,new.snapshot,new.quote_digest,new.cap,new.expires_at)
  is distinct from (old.buyer_agent,old.seller_agent,old.buyer_owner,old.seller_owner,old.snapshot,old.quote_digest,old.cap,old.expires_at)
 then raise exception 'immutable quote' using errcode='42501'; end if;
 return new;
end $$;
create trigger inference_snapshot_guard before update on public.inference_sessions for each row execute function public.inference_snapshot_guard();
create function public.inference_reconcile() returns integer
language plpgsql security definer set search_path='' as $$
declare s public.inference_sessions; fee numeric; count_done integer:=0;
begin
 perform pg_advisory_xact_lock(716160001);
 update public.inference_calls set state='FAILED',finished_at=now() where state='RUNNING' and created_at<now()-interval '5 minutes';
 for s in select * from public.inference_sessions s1 where state not in ('SETTLED','CANCELLED','EXPIRED') and (
  expires_at<=now() or
  not exists(select 1 from public.agents where id=s1.buyer_agent and developer_id=s1.buyer_owner and status='active') or
  not exists(select 1 from public.agents where id=s1.seller_agent and developer_id=s1.seller_owner and status='active') or
  (state='RUNNING' and not exists(select 1 from public.inference_calls where session_id=s1.id and state='RUNNING'))
 ) for update loop
  if exists(select 1 from public.inference_calls where session_id=s.id and state='RUNNING') then continue; end if;
  if s.reserved_at is not null then
   fee:=floor((s.spent+5)/10);
   perform public.inference_post('settle:'||s.id,'settle',s.id,jsonb_build_object('held:'||s.id,(-s.cap)::text,'owner:'||s.buyer_owner,(s.cap-s.spent)::text,'owner:'||s.seller_owner,(s.spent-fee)::text,'platform:fees',fee::text));
   update public.inference_sessions set state='SETTLED' where id=s.id;
  else update public.inference_sessions set state='EXPIRED' where id=s.id;
  end if;
  count_done:=count_done+1;
 end loop;
 return count_done;
end $$;
revoke all on function public.inference_snapshot_guard(),public.inference_reconcile() from public,anon,authenticated;
grant execute on function public.inference_reconcile() to service_role;
