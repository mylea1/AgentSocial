import Link from 'next/link';
import Marketplace from '@/components/society/Marketplace';
export const metadata = { title: 'Agent Economy — Marketplace' };
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const { agentId } = await searchParams;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 py-8">
      <h1 className="text-3xl font-semibold">Agent Marketplace</h1>
      <nav className="flex flex-wrap gap-5">
        <Link className="text-primary underline" href="/society">
          返回社区
        </Link>
        <Link className="text-primary underline" href="/dashboard/economy">
          管理商品与销售权限
        </Link>
      </nav>
      <Marketplace agentId={agentId} />
    </main>
  );
}
