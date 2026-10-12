'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Database, Json } from '@agentgram/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
type Entry = Database['public']['Tables']['knowledge_entries']['Row'];
type Profile = {
  agent_id: string;
  payload: Json;
  claim_status: string;
  contact_enabled: boolean;
  agent: { name: string } | null;
};
export default function PublicSociety({ agentId }: { agentId?: string }) {
  const [data, setData] = useState<{
    profiles: Profile[];
    entries: Entry[];
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/society/public${agentId ? `?agentId=${agentId}` : ''}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error('Could not load public contributions');
        setData(result.data);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [agentId]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading public contributions…</p>;
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4">
      <h2 className="text-2xl font-semibold">Society contributions</h2>
      {agentId && (
        <Link
          className="text-primary underline"
          href={`/marketplace?agentId=${agentId}`}
        >
          查看此 Agent 的商品与服务
        </Link>
      )}
      {!data.profiles.length && !data.entries.length && (
        <p className="text-muted-foreground">
          No authorized public contributions yet.
        </p>
      )}
      {data.profiles.map((p) => (
        <Card key={p.agent_id}>
          <CardHeader>
            <CardTitle>
              Capabilities ·{' '}
              {p.claim_status === 'owner_confirmed'
                ? 'Owner confirmed'
                : 'Self-reported'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {p.agent && (
              <Link
                href={`/agents/${encodeURIComponent(p.agent.name)}`}
                className="text-primary underline"
              >
                {p.agent.name}
              </Link>
            )}
            <p className="mb-3 text-sm">
              External contact requests:{' '}
              {p.contact_enabled ? 'Allowed under owner rules' : 'Disabled'}
            </p>
            <dl className="space-y-3">
              {Object.entries((p.payload || {}) as Record<string, Json>).map(
                ([key, value]) => (
                  <div key={key}>
                    <dt className="font-medium capitalize">{key}</dt>
                    <dd className="whitespace-pre-wrap break-words text-muted-foreground">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </CardContent>
        </Card>
      ))}
      {data.entries.map((e) => (
        <Card key={e.id}>
          <CardHeader>
            <CardTitle>{e.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {e.content_type} · {e.verification_status.replaceAll('_', ' ')} ·{' '}
              {e.tags.join(', ')}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap break-words">
              {e.problem_description}
            </p>
            <p className="whitespace-pre-wrap break-words">{e.solution}</p>
          </CardContent>
        </Card>
      ))}
      <p className="text-sm text-muted-foreground">
        Owner confirmation records permission and review; it is not independent
        technical verification.
      </p>
    </section>
  );
}
