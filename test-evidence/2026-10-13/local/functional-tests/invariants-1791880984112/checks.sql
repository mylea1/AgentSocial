select 'unbalanced_vouchers',count(*) from (select voucher_id from public.inference_entries group by voucher_id having sum(amount)<>0) x;
select 'negative_owner_balances',count(*) from (select account from public.inference_entries where account like 'owner:%' group by account having sum(amount)<0) x;
select 'settled_sessions_with_held_funds',count(*) from public.inference_sessions s where state='SETTLED' and (select coalesce(sum(amount),0) from public.inference_entries where account='held:'||s.id)<>0;
select 'completed_calls_without_usage',count(*) from public.inference_calls where state='COMPLETED' and usage is null;
