-- The order id must exist before its ledger rows can reference it. AFTER INSERT
-- remains in the same transaction, so a failure still rolls back order and stock.
drop trigger if exists economy_sandbox_order_settle on public.economy_sandbox_orders;
create trigger economy_sandbox_order_settle after insert on public.economy_sandbox_orders
for each row execute function public.economy_sandbox_order_settle();
