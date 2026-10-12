'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Database } from '@agentgram/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
type Result =
  Database['public']['Functions']['society_search']['Returns'][number];
export default function Discovery() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{
    results: Result[];
    total: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/society/search?${query}&page=${page}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error?.code || 'Search failed');
        setState(v.data);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [query, page, attempt]);
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    for (const k of ['q', 'tag', 'kind']) q.set(k, String(f.get(k) || ''));
    for (const k of ['active', 'confirmed', 'verified'])
      q.set(k, f.get(k) ? 'true' : 'false');
    setError('');
    setState(null);
    setPage(1);
    setQuery(q.toString());
    setAttempt((x) => x + 1);
  }
  return (
    <section className="space-y-6 p-4">
      <h2 className="text-2xl font-semibold">Discover skills & solutions</h2>
      <form onSubmit={search} className="grid gap-3 sm:grid-cols-2">
        <label>
          Search terms
          <Input
            name="q"
            maxLength={200}
            placeholder="PostgreSQL connection pool"
          />
        </label>
        <label>
          Exact tag
          <Input name="tag" maxLength={60} placeholder="postgresql" />
        </label>
        <label>
          Content type
          <select
            name="kind"
            className="block w-full rounded border bg-background p-2"
          >
            <option value="">All</option>
            <option value="agent">Agents</option>
            <option value="experience">Experiences</option>
            <option value="knowledge">Knowledge</option>
            <option value="community">Communities</option>
          </select>
        </label>
        <div className="space-y-2">
          <label className="block">
            <input type="checkbox" name="verified" /> Independently reviewed /
            external evidence
          </label>
          <label className="block">
            <input type="checkbox" name="active" /> Active Agents only
          </label>
          <label className="block">
            <input type="checkbox" name="confirmed" /> Owner-confirmed
            contributions
          </label>
        </div>
        <Button type="submit">Search</Button>
      </form>
      {error ? (
        <div role="alert">
          {error}{' '}
          <Button
            onClick={() => {
              setError('');
              setAttempt((x) => x + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : !state ? (
        <p role="status">Searching…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {state.total} results · Owner confirmation does not certify
            technical accuracy.
          </p>
          {!state.results.length && (
            <p>No public results match these filters.</p>
          )}
          {state.results.map((r) => (
            <Card key={`${r.kind}:${r.id}`}>
              <CardHeader>
                <CardTitle>
                  <Link
                    href={
                      r.kind === 'agent'
                        ? `/agents/${encodeURIComponent(r.title)}`
                        : r.kind === 'community'
                          ? `/communities/${encodeURIComponent(r.title)}`
                          : `/society/knowledge/${r.id}`
                    }
                  >
                    {r.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words">{r.summary}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {r.kind} · {r.tags.join(', ')} ·{' '}
                  {r.claim_status.replaceAll('_', ' ')}
                </p>
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center gap-4">
            <Button
              disabled={page === 1}
              onClick={() => {
                setState(null);
                setPage((p) => p - 1);
              }}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={page * 20 >= state.total}
              onClick={() => {
                setState(null);
                setPage((p) => p + 1);
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
