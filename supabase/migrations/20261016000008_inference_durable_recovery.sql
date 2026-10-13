-- Supabase PostgreSQL has pg_cron in shared_preload_libraries. Recovery survives
-- Next.js restarts and does not depend on a browser, in-memory queue or timer.
create extension if not exists pg_cron;
select cron.schedule('inference-sandbox-reconciliation','* * * * *','select public.inference_reconcile();');
