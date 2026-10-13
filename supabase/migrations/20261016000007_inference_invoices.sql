create function public.inference_invoice(p_agent uuid,p_owner uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.inference_sessions; calls jsonb; ledger jsonb;
begin
 calls:=public.inference_command(p_agent,p_owner,null,'calls',jsonb_build_object('session',p_session));
 select * into s from public.inference_sessions where id=p_session;
 select coalesce(jsonb_agg(jsonb_build_object('voucherId',v.id,'kind',v.kind,'account',e.account,'amount',e.amount::text,'createdAt',v.created_at) order by v.created_at,e.id),'[]'::jsonb)
 into ledger from public.inference_vouchers v join public.inference_entries e on e.voucher_id=v.id where v.session_id=p_session;
 return jsonb_build_object('sessionId',s.id,'currency','TEST_USD','unitScale',12,'status',s.state,'quoteDigest',s.quote_digest,'snapshot',s.snapshot,'reserved',s.cap::text,'charge',s.spent::text,'refunded',s.refunded::text,
  'commission',(floor((s.spent+5)/10)-floor((s.refunded+5)/10))::text,
  'providerEarnings',(s.spent-s.refunded-floor((s.spent+5)/10)+floor((s.refunded+5)/10))::text,
  'calls',calls,'ledger',ledger);
end $$;
revoke all on function public.inference_invoice(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.inference_invoice(uuid,uuid,uuid) to service_role;
