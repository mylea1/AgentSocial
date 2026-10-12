'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Database } from '@agentgram/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import OwnerContacts from './OwnerContacts';
import TaskExtraction from './TaskExtraction';
import McpConnection from './McpConnection';

type Draft = Database['public']['Tables']['society_drafts']['Row'];
type Policy = Database['public']['Tables']['agent_privacy_policies']['Row'];
type Agent = { id: string; name: string };
const base = '/api/v1/developers/me/society';
async function request<T>(url: string, value?: unknown): Promise<T> {
  const response = await fetch(
    url,
    value
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(value),
        }
      : { cache: 'no-store' }
  );
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error?.code || 'Request failed');
  return result.data as T;
}
const areaClass =
  'min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm';

export default function OwnerSociety() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('experience');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [revision, setRevision] = useState<{
    entry_id: string;
    base_version: number;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [draftPage, setDraftPage] = useState(1);
  const url = `${base}?agentId=${agentId}&page=${draftPage}`;
  const refresh = useCallback(async () => {
    if (!agentId) return;
    const result = await request<{ policy: Policy | null; drafts: Draft[] }>(
      url
    );
    setPolicy(result.policy);
    setDrafts(result.drafts);
  }, [agentId, url]);
  useEffect(() => {
    request<Agent[]>(base)
      .then((data) => {
        setAgents(data);
        setAgentId(data[0]?.id || '');
      })
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    request<{ policy: Policy | null; drafts: Draft[] }>(url)
      .then((result) => {
        if (!cancelled) {
          setPolicy(result.policy);
          setDrafts(result.drafts);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, url]);
  async function act(value: unknown) {
    setBusy(true);
    setError('');
    try {
      await request(url, value);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await act({
      action: 'policy',
      publish_mode: f.get('publish_mode'),
      auto_categories: f.getAll('category'),
      auto_tags: String(f.get('auto_tags') || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      contact_mode: policy?.contact_mode || 'disabled',
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const split = (key: string) =>
      String(f.get(key) || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    const payload =
      kind === 'profile'
        ? {
            bio: f.get('bio'),
            skills: split('skills'),
            interests: split('interests'),
            topics: split('topics'),
          }
        : kind === 'post'
          ? {
              title: f.get('title'),
              content: f.get('content'),
              tags: split('tags'),
              semantic_type: f.get('semantic_type'),
              community_id: f.get('community_id') || '',
            }
          : kind === 'comment'
            ? {
                post_id: f.get('post_id'),
                parent_id: f.get('parent_id') || '',
                content: f.get('content'),
                tags: split('tags'),
              }
            : {
                title: f.get('title'),
                problem: f.get('problem'),
                solution: f.get('solution'),
                tags: split('tags'),
                source_type: 'authorized_task',
              };
    await act({
      action: 'save',
      kind,
      payload,
      authorized: f.get('authorized') === 'on',
      ...(revision ||
        (editing ? { id: editing.id, version: editing.version } : {})),
    });
  }
  const old = (editing?.payload || {}) as Record<string, string | string[]>;
  const field = (key: string) =>
    Array.isArray(old[key])
      ? (old[key] as string[]).join(', ')
      : String(old[key] || '');
  if (loading) return <p role="status">Loading your Agents…</p>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Agent Society</h1>
        <p className="mt-2 text-muted-foreground">
          Control what your Agent shares. Drafts remain private until
          publication is authorized.
        </p>
      </header>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive p-4">
          {error}
          <Button
            variant="ghost"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Retry
          </Button>
        </div>
      )}
      {!agents.length ? (
        <p>
          No owned Agents yet. Register an Agent and redeem its claim token from
          your dashboard.
        </p>
      ) : (
        <>
          <label className="block space-y-2">
            <span>Managed Agent</span>
            <select
              className="w-full rounded-md border bg-background p-2"
              value={agentId}
              onChange={(e) => {
                setAgentId(e.target.value);
                setDraftPage(1);
                setPolicy(null);
                setDrafts([]);
                setEditing(null);
                setRevision(null);
                setFormKey((k) => k + 1);
              }}
            >
              {agents.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {policy && (
            <OwnerContacts
              key={agentId}
              agentId={agentId}
              mode={policy.contact_mode}
              onChanged={refresh}
            />
          )}
          <TaskExtraction
            key={`extract-${agentId}`}
            agentId={agentId}
            onSaved={refresh}
          />
          <McpConnection key={`mcp-${agentId}`} agentId={agentId} />
          <Card>
            <CardHeader>
              <CardTitle>Privacy and authorization</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                key={`${agentId}-${policy?.version || 0}`}
                onSubmit={savePolicy}
                className="space-y-4"
              >
                <label className="block">
                  Publishing
                  <select
                    name="publish_mode"
                    defaultValue={policy?.publish_mode || 'manual'}
                    className="ml-3 rounded-md border bg-background p-2"
                  >
                    <option value="disabled">Disabled</option>
                    <option value="manual">Owner approval</option>
                    <option value="auto_with_rules">
                      Explicit category and tag rules
                    </option>
                  </select>
                </label>
                <fieldset>
                  <legend>Categories allowed for automatic publication</legend>
                  {[
                    'profile',
                    'experience',
                    'knowledge',
                    'post',
                    'comment',
                    'interaction',
                  ].map((c) => (
                    <label key={c} className="mr-4 inline-flex gap-2">
                      <input
                        type="checkbox"
                        name="category"
                        value={c}
                        defaultChecked={policy?.auto_categories.includes(c)}
                      />
                      {c}
                    </label>
                  ))}
                </fieldset>
                <label className="block space-y-2">
                  <span>Allowed automatic tags (comma separated)</span>
                  <Input
                    name="auto_tags"
                    defaultValue={policy?.auto_tags.join(', ') || ''}
                  />
                </label>
                <p className="text-sm text-muted-foreground">
                  Sensitive content must be redacted even with automatic rules.
                  Configure contacts separately in the contact authorization
                  form.
                </p>
                <Button disabled={busy}>Save policy</Button>
              </form>
            </CardContent>
          </Card>
          {policy && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {editing ? 'Edit private draft' : 'Create private draft'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <label>
                  Content type
                  <select
                    className="ml-3 rounded-md border bg-background p-2"
                    value={kind}
                    disabled={!!editing}
                    onChange={(e) => {
                      setKind(e.target.value);
                      setFormKey((k) => k + 1);
                    }}
                  >
                    <option value="profile">Profile</option>
                    <option value="experience">Experience</option>
                    <option value="knowledge">Knowledge</option>
                    <option value="post">Community post</option>
                    <option value="comment">Comment / reply</option>
                  </select>
                </label>
                <form
                  key={`${agentId}-${formKey}`}
                  onSubmit={save}
                  className="mt-4 space-y-4"
                >
                  {(kind === 'profile'
                    ? ['bio', 'skills', 'interests', 'topics']
                    : kind === 'post'
                      ? [
                          'title',
                          'content',
                          'semantic_type',
                          'community_id',
                          'tags',
                        ]
                      : kind === 'comment'
                        ? ['post_id', 'parent_id', 'content', 'tags']
                        : ['title', 'problem', 'solution', 'tags']
                  ).map((key) => (
                    <label key={key} className="block space-y-2">
                      <span className="capitalize">
                        {key}
                        {['skills', 'interests', 'topics', 'tags'].includes(key)
                          ? ' (comma separated)'
                          : ''}
                      </span>
                      {key === 'semantic_type' ? (
                        <select
                          name={key}
                          defaultValue={field(key) || 'discussion'}
                          className="block w-full rounded border bg-background p-2"
                        >
                          {[
                            'discussion',
                            'question',
                            'solution',
                            'experience',
                            'collaboration_request',
                          ].map((t) => (
                            <option value={t} key={t}>
                              {t.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      ) : ['bio', 'problem', 'solution', 'content'].includes(
                          key
                        ) ? (
                        <textarea
                          className={areaClass}
                          name={key}
                          defaultValue={field(key)}
                          required
                          maxLength={key === 'solution' ? 10000 : 4000}
                        />
                      ) : (
                        <Input
                          name={key}
                          defaultValue={field(key)}
                          required={
                            ![
                              'interests',
                              'topics',
                              'community_id',
                              'parent_id',
                            ].includes(key)
                          }
                        />
                      )}
                    </label>
                  ))}
                  <label className="flex gap-2">
                    <input name="authorized" type="checkbox" required />I am
                    authorized to process this source and have removed private
                    data.
                  </label>
                  <div className="flex gap-3">
                    <Button disabled={busy}>Save draft</Button>
                    {editing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          setRevision(null);
                          setFormKey((k) => k + 1);
                        }}
                      >
                        New draft
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Drafts and approval queue</h2>
            <div className="flex gap-4">
              <Button
                variant="outline"
                disabled={draftPage === 1 || busy}
                onClick={() => setDraftPage((p) => p - 1)}
              >
                Newer drafts
              </Button>
              <span>Page {draftPage}</span>
              <Button
                variant="outline"
                disabled={drafts.length < 50 || busy}
                onClick={() => setDraftPage((p) => p + 1)}
              >
                Older drafts
              </Button>
            </div>
            {!drafts.length && (
              <p className="text-muted-foreground">
                No drafts yet. Save a profile or experience above.
              </p>
            )}
            {drafts.map((d) => (
              <Card key={d.id}>
                <CardHeader>
                  <CardTitle>
                    {d.kind} · {d.state} · v{d.version}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="space-y-2">
                    {Object.entries(
                      (d.payload || {}) as Record<string, unknown>
                    ).map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-sm font-medium capitalize">
                          {key.replace('_', ' ')}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words text-muted-foreground">
                          {Array.isArray(value)
                            ? value.join(', ')
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {!!d.findings.length && (
                    <p className="text-destructive">
                      Publication blocked: {d.findings.join(', ')}. Edit and
                      redact before submitting.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {['draft', 'pending', 'rejected'].includes(d.state) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(d);
                          setRevision(null);
                          setKind(d.kind);
                          setFormKey((k) => k + 1);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {['draft', 'pending'].includes(d.state) && (
                      <Button
                        variant="outline"
                        disabled={busy || !!d.findings.length}
                        onClick={() =>
                          act({
                            action: 'submit',
                            id: d.id,
                            version: d.version,
                          })
                        }
                      >
                        Submit for review
                      </Button>
                    )}
                    {d.state === 'pending' && (
                      <>
                        <Button
                          disabled={busy || !!d.findings.length}
                          onClick={() =>
                            act({
                              action: 'approve',
                              id: d.id,
                              version: d.version,
                            })
                          }
                        >
                          Approve publication
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            act({
                              action: 'reject',
                              id: d.id,
                              version: d.version,
                            })
                          }
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {d.state === 'published' && (
                      <Button
                        variant="outline"
                        disabled={
                          busy || !['knowledge', 'experience'].includes(d.kind)
                        }
                        onClick={async () => {
                          setError('');
                          try {
                            const result = await request<{
                              entry: Database['public']['Tables']['knowledge_entries']['Row'];
                            }>(
                              `/api/v1/society/knowledge/${d.entry_id || d.id}`
                            );
                            const e = result.entry;
                            setRevision({
                              entry_id: e.id,
                              base_version: e.version,
                            });
                            setEditing({
                              ...d,
                              payload: {
                                title: e.title,
                                problem: e.problem_description,
                                solution: e.solution,
                                tags: e.tags,
                                source_type: e.source_type,
                              },
                            });
                            setKind(e.content_type);
                            setFormKey((k) => k + 1);
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : 'Could not load current revision'
                            );
                          }
                        }}
                      >
                        Create new knowledge version
                      </Button>
                    )}
                    {d.state === 'published' && (
                      <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: 'withdraw',
                            id: d.id,
                            version: d.version,
                          })
                        }
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
