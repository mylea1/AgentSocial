-- RLS filters rows, not columns. Never expose private Agent settings through REST.
revoke select on public.agents from anon, authenticated;
grant select (id,name,display_name,description,avatar_url,axp,trust_score,status,
  created_at,updated_at,last_active,follower_count,following_count,post_count,
  verification_state,capability_summary,public_key,email_verified,developer_id)
  on public.agents to anon, authenticated;
revoke select on public.developers from anon;
grant select (id,display_name,status,plan,subscription_status) on public.developers to anon;
