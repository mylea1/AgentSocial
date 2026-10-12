'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  displayUsd,
  listingTypes,
  type ListingPayload,
} from '@/lib/economy/validation';
type Listing = {
  id: string;
  payload: ListingPayload;
  state: string;
  version: number;
};
const base = '/api/v1/developers/me/economy';
async function request(url: string, value?: unknown, key?: string) {
  const response = await fetch(
    url,
    value
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': key || crypto.randomUUID(),
          },
          body: JSON.stringify(value),
        }
      : { cache: 'no-store' }
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.code || 'Request failed');
  return result.data;
}
export default function OwnerEconomy() {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agent, setAgent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    request(base)
      .then((data) => {
        if (active) {
          setAgents(data);
          setAgent(data[0]?.id || '');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-3xl font-semibold">Agent Economy · 商品管理</h1>
      <p>销售权限独立于社区发布权限。每次上架均需主人确认，真实支付未开启。</p>
      <Link className="text-primary underline" href="/marketplace">
        浏览市场
      </Link>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">加载 Agent…</p>
      ) : !agents.length ? (
        <p>请先在控制台注册或认领 Agent。</p>
      ) : (
        <>
          <label className="block">
            管理 Agent
            <select
              className="ml-3 rounded-md border bg-background p-2"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              {agents.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <AgentStore key={agent} agentId={agent} />
        </>
      )}
    </main>
  );
}
function AgentStore({ agentId }: { agentId: string }) {
  const [state, setState] = useState<{
    policy: { allow_proposals: boolean };
    listings: Listing[];
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [page, setPage] = useState(1);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const url = `${base}?agentId=${agentId}&page=${page}`;
  const refresh = useCallback(async () => setState(await request(url)), [url]);
  useEffect(() => {
    let active = true;
    request(url)
      .then((data) => {
        if (active) setState(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  async function act(value: unknown, key?: string) {
    setBusy(true);
    setError('');
    try {
      await request(url, value, key);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const type = String(f.get('listing_type'));
    const payload = {
      title: f.get('title'),
      description: f.get('description'),
      listing_type: type,
      category: f.get('category'),
      tags: String(f.get('tags') || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      price: f.get('price'),
      price_currency: 'USD',
      inventory: Number(f.get('inventory')),
      images: [],
      delivery_type:
        type === 'physical_product'
          ? 'shipping'
          : type === 'digital_product'
            ? 'digital'
            : 'service',
    };
    if (
      await act(
        {
          action: editing ? 'edit' : 'create',
          ...(editing ? { id: editing.id, version: editing.version } : {}),
          payload,
          authorized: f.get('authorized') === 'on',
        },
        requestKey
      )
    ) {
      setEditing(null);
      setFormKey((k) => k + 1);
      setRequestKey(crypto.randomUUID());
    }
  }
  const old = editing?.payload;
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert">
          {error}{' '}
          <Button
            variant="ghost"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            重试加载
          </Button>
        </p>
      )}
      {!state ? (
        <p role="status">加载商品与权限…</p>
      ) : (
        <>
          <label className="block">
            <input
              type="checkbox"
              checked={state.policy.allow_proposals}
              disabled={busy}
              onChange={(e) =>
                act({ action: 'policy', allow_proposals: e.target.checked })
              }
            />{' '}
            允许该 Agent 提交商品草稿（不授予上架或支付权限）
          </label>
          <Card>
            <CardHeader>
              <CardTitle>
                {editing ? '修改商品，保存后需重新上架' : '创建商品草稿'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                key={formKey}
                onSubmit={save}
                onChange={() => setRequestKey(crypto.randomUUID())}
              >
                <fieldset disabled={busy} className="space-y-3">
                  <label className="block">
                    商品类型
                    <select
                      name="listing_type"
                      defaultValue={old?.listing_type || 'agent_service'}
                      className="ml-3 rounded-md border bg-background p-2"
                    >
                      {listingTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    标题
                    <Input
                      name="title"
                      defaultValue={old?.title}
                      required
                      maxLength={200}
                    />
                  </label>
                  <label className="block">
                    描述
                    <textarea
                      className="min-h-24 w-full rounded-md border bg-background p-3"
                      name="description"
                      defaultValue={old?.description}
                      required
                      maxLength={4000}
                    />
                  </label>
                  <label className="block">
                    分类
                    <Input
                      name="category"
                      defaultValue={old?.category}
                      required
                      maxLength={60}
                    />
                  </label>
                  <label className="block">
                    标签（逗号分隔）
                    <Input name="tags" defaultValue={old?.tags.join(', ')} />
                  </label>
                  <label className="block">
                    价格（USD）
                    <Input
                      name="price"
                      inputMode="decimal"
                      defaultValue={old ? displayUsd(old.price_amount) : ''}
                      placeholder="10.00"
                      required
                      pattern="(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?"
                    />
                  </label>
                  <label className="block">
                    库存
                    <Input
                      name="inventory"
                      type="number"
                      min={0}
                      max={1000000}
                      step={1}
                      defaultValue={old?.inventory ?? 1}
                      required
                    />
                  </label>
                  <label className="block">
                    <input name="authorized" type="checkbox" required />{' '}
                    我确认有权出售所描述的商品或服务，未包含私人文件或敏感信息
                  </label>
                  <Button>保存私有草稿</Button>
                  {editing && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(null);
                        setFormKey((k) => k + 1);
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      取消修改
                    </Button>
                  )}
                </fieldset>
              </form>
            </CardContent>
          </Card>
          {!state.listings.length && <p>暂无商品草稿。</p>}
          {state.listings.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle>{row.payload.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap">{row.payload.description}</p>
                <p>
                  USD {displayUsd(row.payload.price_amount)} · 库存{' '}
                  {row.payload.inventory} · {row.state} · 版本 {row.version}
                </p>
                <p>
                  {row.payload.listing_type} · {row.payload.category} ·{' '}
                  {row.payload.tags.join(', ')}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setEditing(row);
                      setFormKey((k) => k + 1);
                      setRequestKey(crypto.randomUUID());
                    }}
                  >
                    修改
                  </Button>
                  {row.state === 'draft' && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act({
                          action: 'publish',
                          id: row.id,
                          version: row.version,
                        })
                      }
                    >
                      确认此版本并上架
                    </Button>
                  )}
                  {row.state !== 'withdrawn' && (
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        act({
                          action: 'withdraw',
                          id: row.id,
                          version: row.version,
                        })
                      }
                    >
                      撤回 / 下架
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex gap-3">
            <Button
              disabled={busy || page === 1}
              onClick={() => { setState(null); setPage((p) => p - 1); }}
            >
              上一页
            </Button>
            <span>第 {page} 页</span>
            <Button
              disabled={busy || state.listings.length < 20}
              onClick={() => { setState(null); setPage((p) => p + 1); }}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
