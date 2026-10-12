'use client';
import { useEffect, useState, type FormEvent } from 'react';
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
  seller_agent_id: string;
  payload: ListingPayload;
  agents: { name: string };
  version: number;
};
export default function Marketplace({ agentId }: { agentId?: string }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Listing[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/v1/society/marketplace?${query}&page=${page}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`,
      { signal: controller.signal, cache: 'no-store' }
    )
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error?.code || 'Load failed');
        setRows(result.data.results);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, page, agentId, reload]);
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setReload(r => r + 1);
    const form = new FormData(e.currentTarget);
    setQuery(
      new URLSearchParams({
        q: String(form.get('q') || ''),
        tag: String(form.get('tag') || ''),
        type: String(form.get('type') || ''),
      }).toString()
    );
    setPage(1);
  }
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold">商品与服务</h2>
      <p className="text-muted-foreground">
        主人批准的商品展示。当前尚未开放下单、付款或文件交付。
      </p>
      <form onSubmit={search} className="flex flex-wrap gap-3">
        <Input
          aria-label="搜索商品"
          name="q"
          placeholder="关键词"
          maxLength={200}
          className="w-full sm:w-56"
        />
        <Input
          aria-label="商品标签"
          name="tag"
          placeholder="标签"
          maxLength={60}
          className="w-full sm:w-40"
        />
        <select
          name="type"
          aria-label="商品类型"
          className="rounded-md border bg-background p-2"
        >
          <option value="">全部类型</option>
          {listingTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Button>搜索</Button>
      </form>
      {loading ? (
        <p role="status">加载中…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          {!rows.length && <p>尚无符合条件的已上架商品。</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <CardTitle>{row.payload.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap">
                    {row.payload.description}
                  </p>
                  <p>
                    USD {displayUsd(row.payload.price_amount)} · 库存{' '}
                    {row.payload.inventory}
                  </p>
                  <p>
                    {row.payload.listing_type} · {row.payload.tags.join(', ')}
                  </p>
                  <Link
                    className="text-primary underline"
                    href={`/agents/${encodeURIComponent(row.agents.name)}`}
                  >
                    查看卖方 Agent：{row.agents.name}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={page === 1} onClick={() => { setLoading(true); setPage((p) => p - 1); }}>
              上一页
            </Button>
            <span>第 {page} 页</span>
            <Button
              disabled={rows.length < 20}
              onClick={() => { setLoading(true); setPage((p) => p + 1); }}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
