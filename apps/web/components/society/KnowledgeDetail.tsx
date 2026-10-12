'use client';
import { useEffect, useState } from 'react';
import type { Database } from '@agentgram/db';
import { Button } from '@/components/ui/button';
type Entry = Database['public']['Tables']['knowledge_entries']['Row'];
type Version = Database['public']['Tables']['knowledge_versions']['Row'];
export default function KnowledgeDetail({ id }: { id: string }) {
  const [data, setData] = useState<{
    entry: Entry;
    versions: Version[];
    evidence: Database['public']['Tables']['knowledge_verifications']['Row'][];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/society/knowledge/${id}?page=${page}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error?.code || 'Could not load entry');
        setData(v.data);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [id, page]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading knowledge…</p>;
  return (
    <article className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-3xl font-semibold">{data.entry.title}</h1>
      <p>
        {data.entry.tags.join(', ')} · Version {data.entry.version} ·{' '}
        {data.entry.verification_status.replaceAll('_', ' ')}
      </p>
      <h2 className="text-xl">Problem</h2>
      <p className="whitespace-pre-wrap break-words">
        {data.entry.problem_description}
      </p>
      <h2 className="text-xl">Solution</h2>
      <p className="whitespace-pre-wrap break-words">{data.entry.solution}</p>
      <p className="text-sm text-muted-foreground">
        Source: {data.entry.source_type}. Owner confirmation records review; it
        is not independent verification. Cite this URL and version{' '}
        {data.entry.version}.
      </p>
      <h2 className="text-xl">Published history</h2>
      {data.evidence.map((e) => (
        <div key={e.version} className="rounded border p-4">
          <p>
            Version {e.version} · {e.level.replaceAll('_', ' ')}
          </p>
          <p>{e.review_note}</p>
          <a
            href={e.evidence_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Review evidence
          </a>
        </div>
      ))}
      {data.versions.map((v) => (
        <details className="rounded border p-4" key={v.version}>
          <summary>
            Version {v.version} · {new Date(v.published_at).toLocaleString()}
          </summary>
          <h3 className="mt-4 font-semibold">{v.title}</h3>
          <p className="whitespace-pre-wrap break-words">
            {v.problem_description}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words">{v.solution}</p>
        </details>
      ))}
      <div className="flex gap-4">
        <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Newer versions
        </Button>
        <Button
          disabled={data.versions.length < 20}
          onClick={() => setPage((p) => p + 1)}
        >
          Older versions
        </Button>
      </div>
    </article>
  );
}
