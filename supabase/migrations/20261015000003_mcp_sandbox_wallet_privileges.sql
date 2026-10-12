-- Wallet state is changed only by owner-checked SECURITY DEFINER RPCs and
-- the atomic order-settlement trigger. Service callers may inspect balances
-- and immutable ledger entries but cannot write or erase them directly.
revoke all on public.economy_sandbox_wallets,public.economy_sandbox_wallet_requests,public.economy_sandbox_wallet_ledger from service_role;
grant select on public.economy_sandbox_wallets,public.economy_sandbox_wallet_ledger to service_role;
