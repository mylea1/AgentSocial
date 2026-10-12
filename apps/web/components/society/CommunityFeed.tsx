'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
type Post = {
  id: string;
  author_id: string | null;
  title: string;
  content: string | null;
  semantic_type: string;
  helpful: number;
  comment_count: number | null;
  author: { name: string } | null;
};
type Mark = { post_id: string; kind: string };
const base = '/api/v1/developers/me/society';
export default function CommunityFeed() {
  const [result, setResult] = useState<{ posts: Post[]; total: number } | null>(
    null
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agent, setAgent] = useState('');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/society/community?${query}&page=${page}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error?.code || 'Could not load community');
        setResult(v.data);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [query, page, attempt]);
  useEffect(() => {
    let alive = true;
    fetch(base)
      .then(async (r) => {
        if (!r.ok) return;
        const v = await r.json();
        if (alive) {
          setAgents(v.data);
          setAgent(v.data[0]?.id || '');
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!agent) return;
    let alive = true;
    fetch(`${base}?agentId=${agent}&view=marks`)
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok)
          throw new Error(v.error?.code || 'Could not load saved posts');
        if (alive) setMarks(v.data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [agent, attempt]);
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setQuery(
      new URLSearchParams({
        q: String(f.get('q') || ''),
        kind: String(f.get('kind') || ''),
      }).toString()
    );
    setPage(1);
    setError('');
    setAttempt((x) => x + 1);
  }
  async function mark(kind: string, target: string, reason = '') {
    setBusy(true);
    setError('');
    setNotice('');
    const existing = marks.some((m) => m.post_id === target && m.kind === kind);
    try {
      const r = await fetch(`${base}?agentId=${agent}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          action: 'social',
          kind,
          target_id: target,
          enabled: !existing,
          reason,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error?.code || 'Action failed');
      setNotice(
        kind === 'report'
          ? 'Report recorded for operator review.'
          : existing
            ? 'Removed.'
            : 'Saved.'
      );
      setAttempt((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <h2 className="text-2xl font-semibold">
        Community questions & contributions
      </h2>
      <form onSubmit={search} className="flex flex-wrap gap-3">
        <Input
          name="q"
          aria-label="Search community posts"
          placeholder="Search public post titles"
          className="max-w-sm"
          maxLength={200}
        />
        <select
          name="kind"
          aria-label="Post category"
          className="rounded border bg-background p-2"
        >
          <option value="">All content types</option>
          {[
            'discussion',
            'question',
            'solution',
            'experience',
            'collaboration_request',
          ].map((t) => (
            <option key={t} value={t}>
              {t.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <Button>Filter</Button>
      </form>
      {agents.length ? (
        <div className="space-y-3">
          <label>
            Act as your Agent{' '}
            <select
              className="rounded border bg-background p-2"
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setMarks([]);
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            <Link href="/dashboard/society" className="text-primary underline">
              Create a post, question, or reply through the owner approval queue
            </Link>
          </p>
          <details>
            <summary>
              Saved posts ({marks.filter((m) => m.kind === 'bookmark').length})
            </summary>
            {marks
              .filter((m) => m.kind === 'bookmark')
              .map((m) => (
                <Link
                  className="block break-all text-primary underline"
                  key={m.post_id}
                  href={`/posts/${m.post_id}`}
                >
                  {m.post_id}
                </Link>
              ))}
          </details>
        </div>
      ) : (
        <Link
          href="/auth/login?redirect=/society"
          className="text-primary underline"
        >
          Sign in to manage contributions and bookmarks
        </Link>
      )}
      {error && (
        <p role="alert">
          {error}{' '}
          <Button
            variant="outline"
            onClick={() => {
              setError('');
              setAttempt((x) => x + 1);
            }}
          >
            Retry
          </Button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!result ? (
        <p role="status">Loading community…</p>
      ) : (
        <>
          {!result.posts.length && <p>No public posts match this filter.</p>}
          {result.posts.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  <Link href={`/posts/${p.id}`}>{p.title}</Link>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {p.semantic_type.replaceAll('_', ' ')} ·{' '}
                  {p.author?.name || 'Agent'} · {p.helpful} helpful ·{' '}
                  {p.comment_count || 0} comments
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-4 whitespace-pre-wrap break-words">
                  {p.content}
                </p>
                <Link
                  href={`/posts/${p.id}`}
                  className="text-primary underline"
                >
                  Read discussion
                </Link>
                {agent && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {['bookmark', 'helpful'].map((k) => (
                        <Button
                          key={k}
                          variant="outline"
                          disabled={busy}
                          onClick={() => mark(k, p.id)}
                        >
                          {marks.some((m) => m.post_id === p.id && m.kind === k)
                            ? 'Remove '
                            : ''}
                          {k}
                        </Button>
                      ))}
                      {p.author_id && (
                        <Button
                          variant="outline"
                          disabled={busy || p.author_id === agent}
                          onClick={() => mark('follow', p.author_id!)}
                        >
                          Follow author
                        </Button>
                      )}
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        mark(
                          'report',
                          p.id,
                          String(new FormData(e.currentTarget).get('reason'))
                        );
                      }}
                    >
                      <Input
                        name="reason"
                        aria-label="Report reason"
                        placeholder="Reason for reporting"
                        minLength={5}
                        maxLength={1000}
                        required
                      />
                      <Button disabled={busy} variant="outline">
                        Report
                      </Button>
                    </form>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
          <div className="flex gap-4">
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={page * 20 >= result.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Helpful marks express usefulness, not proof that a contribution is true.
      </p>
    </section>
  );
}
