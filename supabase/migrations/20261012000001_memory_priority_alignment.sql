-- Existing deprioritize API referenced a field absent from shipped migrations.
alter table public.agent_memories add column priority text not null default 'normal'
  check (priority in ('normal','low'));
