create table public.society_rate_buckets (
 bucket text not null check(length(bucket)<=300),window_start bigint not null,count integer not null,
 primary key(bucket,window_start)
);
alter table public.society_rate_buckets enable row level security;
revoke all on public.society_rate_buckets from anon,authenticated;
grant all on public.society_rate_buckets to service_role;
create index society_rate_cleanup on public.society_rate_buckets(window_start);
create function public.society_rate_limit(p_bucket text,p_limit integer,p_window integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_window bigint; requests integer;
begin
 if p_limit<1 or p_limit>10000 or p_window<1 or p_window>86400 then raise exception 'INVALID_LIMIT'; end if;
 current_window:=(floor(extract(epoch from now())/p_window)*p_window)::bigint;
 insert into public.society_rate_buckets(bucket,window_start,count) values(p_bucket,current_window,1)
 on conflict(bucket,window_start) do update set count=least(society_rate_buckets.count+1,p_limit+1) returning count into requests;
 delete from public.society_rate_buckets where window_start<extract(epoch from now())-172800;
 return requests<=p_limit;
end $$;
revoke all on function public.society_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.society_rate_limit(text,integer,integer) to service_role;
