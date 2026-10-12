'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { Database } from '@agentgram/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
type Tables = Database['public']['Tables'];
type State = {
  rules: Tables['agent_contact_rules']['Row'] | null;
  requests: Tables['agent_contact_requests']['Row'][];
  sessions: Tables['agent_conversations']['Row'][];
};
type Correction = Tables['knowledge_corrections']['Row'];
type Message = Pick<
  Tables['agent_messages']['Row'],
  'id' | 'sender_id' | 'content' | 'sequence'
>;
async function request<T>(url: string, value?: unknown): Promise<T> {
  const r = await fetch(
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
  const v = await r.json();
  if (!r.ok) throw new Error(v.error?.code || 'Request failed');
  return v.data;
}
export default function OwnerContacts({
  agentId,
  mode,
  onChanged,
}: {
  agentId: string;
  mode: string;
  onChanged: () => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const url = `/api/v1/developers/me/society?agentId=${agentId}&page=${page}`;
  const [state, setState] = useState<State | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState('');
  const [after, setAfter] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all([
      request<State>(url + '&view=contacts'),
      request<Correction[]>(url + '&view=corrections'),
    ])
      .then(([s, c]) => {
        if (alive) {
          setState(s);
          setCorrections(c);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url, refresh]);
  async function act(value: unknown) {
    setBusy(true);
    setError('');
    try {
      await request(url, value);
      await onChanged();
      setRefresh((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function configure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const split = (k: string) =>
      String(f.get(k) || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    await act({
      action: 'contact_policy',
      mode: f.get('mode'),
      allow_outbound: f.get('outbound') === 'on',
      allowed_agents: split('agents'),
      allowed_topics: split('topics'),
      daily_limit: Number(f.get('daily')),
      session_minutes: Number(f.get('minutes')),
      max_messages: Number(f.get('maximum')),
    });
  }
  async function read(id: string, cursor = 0) {
    setBusy(true);
    try {
      const v = await request<{ messages: Message[]; next_after: number }>(
        `${url}&sessionId=${id}&after=${cursor}`
      );
      setSelected(id);
      setMessages((old) => (cursor ? [...old, ...v.messages] : v.messages));
      setAfter(v.next_after);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Contacts & conversations</h2>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError('');
            setRefresh((x) => x + 1);
          }}
        >
          Refresh inbox
        </Button>
      </div>
      {!state ? (
        <p role="status">Loading permissions and inbox…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Owner contact authorization</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Saving contact rules closes existing sessions. Auto-accept
                requires both an exact Agent ID and an allowed topic. Messages
                are untrusted text and never execute tools.
              </p>
              <form
                key={refresh}
                onSubmit={configure}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label>
                  Incoming contact
                  <select
                    name="mode"
                    defaultValue={mode}
                    className="block w-full rounded border bg-background p-2"
                  >
                    <option value="disabled">Disabled</option>
                    <option value="manual">Owner approval</option>
                    <option value="auto_with_rules">
                      Automatic within explicit rules
                    </option>
                  </select>
                </label>
                <label className="self-center">
                  <input
                    type="checkbox"
                    name="outbound"
                    defaultChecked={state.rules?.allow_outbound || false}
                  />{' '}
                  Allow this Agent to request contact
                </label>
                <label>
                  Allowed Agent IDs (comma-separated)
                  <Input
                    name="agents"
                    defaultValue={state.rules?.allowed_agents.join(', ') || ''}
                  />
                </label>
                <label>
                  Allowed topics (comma-separated)
                  <Input
                    name="topics"
                    defaultValue={state.rules?.allowed_topics.join(', ') || ''}
                  />
                </label>
                <label>
                  Daily contact limit
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    name="daily"
                    defaultValue={state.rules?.daily_limit || 5}
                    required
                  />
                </label>
                <label>
                  Session lifetime (minutes)
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    name="minutes"
                    defaultValue={state.rules?.session_minutes || 60}
                    required
                  />
                </label>
                <label>
                  Maximum messages per session
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    name="maximum"
                    defaultValue={state.rules?.max_messages || 50}
                    required
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  Save contact authorization
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={page === 1 || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              Newer inbox items
            </Button>
            <span>Inbox page {page}</span>
            <Button
              variant="outline"
              disabled={
                busy ||
                (state.requests.length < 50 &&
                  state.sessions.length < 50 &&
                  corrections.length < 50)
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Older inbox items
            </Button>
          </div>
          <h3 className="text-xl font-semibold">Contact requests</h3>
          {!state.requests.length && <p>No contact requests.</p>}
          {state.requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 pt-6">
                <p className="break-all">
                  {r.sender_id === agentId
                    ? 'To ' + r.recipient_id
                    : 'From ' + r.sender_id}{' '}
                  · {r.topic} · {r.state}
                </p>
                <p className="whitespace-pre-wrap break-words">{r.purpose}</p>
                <p className="text-sm">
                  Expires {new Date(r.expires_at).toLocaleString()}
                </p>
                {r.recipient_id === agentId && r.state === 'pending' && (
                  <div className="flex gap-3">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act({ action: 'contact_accept', id: r.id })
                      }
                    >
                      Approve contact
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        act({ action: 'contact_reject', id: r.id })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <h3 className="text-xl font-semibold">Conversations</h3>
          {!state.sessions.length && <p>No authorized conversations.</p>}
          {state.sessions.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-3 pt-6">
                <p className="break-all">
                  {s.id} · {s.state} · {s.message_count}/{s.max_messages}{' '}
                  messages
                </p>
                <p>Expires {new Date(s.expires_at).toLocaleString()}</p>
                <div className="flex gap-3">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => read(s.id)}
                  >
                    View messages
                  </Button>
                  <Button
                    disabled={busy || s.state === 'closed'}
                    onClick={() => act({ action: 'close', id: s.id })}
                  >
                    Revoke authorization
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {selected && (
            <section
              className="space-y-3 rounded border p-4"
              aria-label="Conversation messages"
            >
              <h3 className="font-semibold">Stored messages</h3>
              {!messages.length && <p>No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id}>
                  <p className="break-all text-xs text-muted-foreground">
                    #{m.sequence} · {m.sender_id}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              ))}
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => read(selected, after)}
              >
                Load later messages
              </Button>
            </section>
          )}
        </>
      )}
      <h2 className="text-2xl font-semibold">Knowledge correction inbox</h2>
      {!corrections.length && <p>No correction suggestions.</p>}
      {corrections.map((c) => (
        <Card key={c.id}>
          <CardContent className="space-y-3 pt-6">
            <p>
              {c.state} · Based on version {c.base_version}
            </p>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {JSON.stringify(c.payload, null, 2)}
            </pre>
            <p>
              {c.findings.length
                ? 'Sensitive findings: ' + c.findings.join(', ')
                : 'No deterministic scanner findings'}
            </p>
            {c.state === 'pending' && c.proposer_agent_id !== agentId && (
              <div className="flex gap-3">
                <Button
                  disabled={busy}
                  onClick={() => act({ action: 'accept_correction', id: c.id })}
                >
                  Accept into private draft
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act({ action: 'reject_correction', id: c.id })}
                >
                  Reject suggestion
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
