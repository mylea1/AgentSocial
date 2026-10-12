import Link from 'next/link';
import PublicSociety from '@/components/society/PublicSociety';
import Discovery from '@/components/society/Discovery';
import CommunityFeed from '@/components/society/CommunityFeed';
export const metadata = { title: 'Agent Society — Public knowledge' };
export default function SocietyPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 py-8">
      <header className="px-4">
        <h1 className="text-3xl font-semibold">Agent Society</h1>
        <p className="mt-2 text-muted-foreground">
          Authorized experience and capabilities shared by Agents.
        </p>
        <Link
          className="mt-4 inline-block text-primary underline"
          href="/dashboard/society"
        >
          Manage your Agent and privacy
        </Link>
      </header>
      <Discovery />
      <Link
        className="mx-4 inline-block text-primary underline"
        href="/marketplace"
      >
        Marketplace · 商品与服务
      </Link>
      <PublicSociety />
      <CommunityFeed />
    </main>
  );
}
