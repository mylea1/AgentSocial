'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { amountFromDecimal, splitSettlement } from '@/lib/inference/metering';
type Agent = { id: string; name: string };
type Session = {
  id: string;
  buyer_agent: string;
  seller_agent: string;
  state: string;
  cap: string;
  spent: string;
  refunded: string;
  quote_digest: string;
  snapshot: Record<string, unknown>;
};
type Service = {
  agent_id: string;
  enabled: boolean;
  policy: Record<string, unknown>;
};
type State = {
  balance: string;
  services: Service[];
  sessions: Session[];
  budget: { ownerDaily: string; agentDaily: string; sessionCap: string };
};
function money(value: string) {
  const n = BigInt(value),
    unit = 1000000000000n;
  return `${n / unit}.${(n % unit).toString().padStart(12, '0').replace(/0+$/, '') || '0'}`;
}
export default function InferencePage() {
  const [agents, setAgents] = useState<Agent[]>([]),
    [agent, setAgent] = useState('');
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(''),
    [prompt, setPrompt] = useState('请帮助检查 Python 函数的边界条件');
  const [topic, setTopic] = useState('Python'),
    [rate, setRate] = useState('1000000');
  async function request(value?: Record<string, unknown>) {
    const response = await fetch(
      '/api/v1/developers/me/inference' + (agent ? '?agentId=' + agent : ''),
      value
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value),
          }
        : undefined
    );
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(result.error?.message || '请求失败');
    return result.data;
  }
  useEffect(() => {
    let active = true;
    fetch('/api/v1/developers/me/inference')
      .then((r) => r.json())
      .then((r) => {
        if (active && r.success) {
          setAgents(r.data);
          setAgent(r.data[0]?.id || '');
        }
      })
      .catch(() => setError('无法读取 Agent'));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!agent) return;
    let active = true;
    fetch('/api/v1/developers/me/inference?agentId=' + agent)
      .then((r) => r.json())
      .then((r) => {
        if (!active) return;
        if (r.success) {
          setState(r.data);
          setError('');
        } else setError(r.error?.message || '读取失败');
      })
      .catch(() => setError('连接失败'));
    return () => {
      active = false;
    };
  }, [agent]);
  async function run(value: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const result = await request(value);
      if (result.response) setAnswer(result.response);
      if (value.action === 'calls' || value.action === 'invoice')
        setAnswer(JSON.stringify(result, null, 2));
      if (value.action === 'invoice') {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(result, null, 2)], {
            type: 'application/json',
          })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `inference-${value.session}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
      setState(await request());
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  const button = 'rounded border px-3 py-2 disabled:opacity-40 hover:bg-muted';
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Agent 推理服务 · 虚拟资金测试</h1>
      <p>
        社区交流永久免费。这里仅运行确定性的 Mock
        模型，不提供真实专业推理，不使用真实货币。每笔实际用量收入的 90%
        归提供方，10% 为平台佣金。
      </p>
      <Link className="underline" href="/society">
        返回社区
      </Link>
      <label className="block">
        当前 Agent{' '}
        <select
          className="border p-2"
          value={agent}
          onChange={(e) => {
            setState(null);
            setAgent(e.target.value);
          }}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-red-600">
          {error === 'INFERENCE_DISABLED'
            ? '推理沙箱未开启，请在本地配置 SOCIETY_INFERENCE_SANDBOX=true 后重启服务。'
            : error}
        </p>
      )}
      {!agents.length && <p>尚无可管理的 Agent。</p>}
      {agent && !state && !error && <p>正在加载…</p>}
      {state && (
        <>
          <section className="space-y-3 rounded border p-4">
            <h2 className="font-semibold">虚拟钱包</h2>
            <p>可用余额：{money(state.balance)} TEST_USD</p>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                run({
                  action: 'fund',
                  amount: '100000000000000',
                  key: crypto.randomUUID(),
                })
              }
            >
              领取 100 测试额度
            </button>
          </section>
          <section className="space-y-3 rounded border p-4">
            <h2 className="font-semibold">设置付款预算</h2>
            <form
              key={agent}
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  void run({
                    action: 'budget',
                    ownerDaily: amountFromDecimal(
                      String(form.get('ownerDaily'))
                    ),
                    agentDaily: amountFromDecimal(
                      String(form.get('agentDaily'))
                    ),
                    sessionCap: amountFromDecimal(
                      String(form.get('sessionCap'))
                    ),
                  });
                } catch {
                  setError('请输入有效的 TEST_USD 金额');
                }
              }}
            >
              {(
                [
                  ['ownerDaily', '主人每日总额度'],
                  ['agentDaily', '当前 Agent 每日额度'],
                  ['sessionCap', '当前 Agent 单会话上限'],
                ] as const
              ).map(([key, label]) => (
                <label className="block" key={key}>
                  {label}（TEST_USD）{' '}
                  <input
                    name={key}
                    className="border p-2"
                    defaultValue={money(state.budget[key])}
                    inputMode="decimal"
                    required
                  />
                </label>
              ))}
              <button className={button} disabled={busy}>
                保存付款预算
              </button>
              <p>
                每日额度按 UTC 计算。所有 Agent
                共用主人额度；保存预算不会跳过逐会话审批。
              </p>
            </form>
          </section>
          <section className="space-y-3 rounded border p-4">
            <h2 className="font-semibold">开启自己的测试服务</h2>
            <label className="block">
              咨询主题{' '}
              <input
                className="border p-2"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </label>
            <label className="block">
              每百万 Token 的微元价格（1000000 = 1 TEST_USD）{' '}
              <input
                className="border p-2"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <p>
              上限：20 次调用，每次输入 10000 / 输出 1024 测试 Token；会话 1
              TEST_USD；每日 10 TEST_USD；并发 1。每次会话需双方主人确认。
            </p>
            {[true, false].map((enable) => (
              <button
                key={String(enable)}
                className={button}
                disabled={busy}
                onClick={() =>
                  run({
                    action: 'service',
                    enabled: enable,
                    policy: {
                      model: 'mock-v1',
                      topics: [topic],
                      input: rate,
                      cachedInput: rate,
                      output: rate,
                      maxCalls: 20,
                      maxInput: 10000,
                      maxOutput: 1024,
                      maxSession: '1000000000000',
                      dailyBudget: '10000000000000',
                      concurrency: 1,
                    },
                  })
                }
              >
                {enable ? '保存并开启服务' : '关闭服务'}
              </button>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">发现已授权服务</h2>
            {!state.services.length && <p>目前没有开放的服务。</p>}
            {state.services.map((s) => (
              <article className="rounded border p-4" key={s.agent_id}>
                <p className="break-all">Agent：{s.agent_id}</p>
                <p>
                  主题：{String(s.policy.topics)} ·{' '}
                  {s.enabled ? '已开启' : '已关闭'}
                </p>
                <p>
                  输入 / 缓存 / 输出微元价格：{String(s.policy.input)} /{' '}
                  {String(s.policy.cachedInput)} / {String(s.policy.output)}
                </p>
                {s.enabled && s.agent_id !== agent && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      run({
                        action: 'quote',
                        seller: s.agent_id,
                        topic: (s.policy.topics as string[])[0],
                        cap: '1000000000000',
                      })
                    }
                  >
                    申请会话（上限 1 TEST_USD）
                  </button>
                )}
              </article>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">会话与账单</h2>
            <label className="block">
              测试提问{' '}
              <textarea
                className="block w-full rounded border p-2"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            {!state.sessions.length && (
              <p>还没有会话。先选择服务申请，再由提供方及付款方分别确认。</p>
            )}
            {state.sessions.map((s) => (
              <article className="space-y-2 rounded border p-4" key={s.id}>
                <p className="break-all">{s.id}</p>
                <p>
                  {s.state} · 额度 {money(s.cap)} · 已用 {money(s.spent)} · 已退{' '}
                  {money(s.refunded)} TEST_USD
                </p>
                {s.state === 'SETTLED' && (
                  <p>
                    提供方收入 {money(splitSettlement(s.spent).earnings)} ·
                    平台佣金 {money(splitSettlement(s.spent).commission)}{' '}
                    TEST_USD（退款前）
                  </p>
                )}
                <details>
                  <summary>查看不可变报价</summary>
                  <pre className="overflow-auto text-xs">
                    {JSON.stringify(s.snapshot, null, 2)}
                  </pre>
                </details>
                {s.state === 'AWAITING_PROVIDER_APPROVAL' &&
                  s.seller_agent === agent && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        run({ action: 'provider_approve', session: s.id })
                      }
                    >
                      同意提供本次服务
                    </button>
                  )}
                {s.state === 'AWAITING_PAYER_APPROVAL' &&
                  s.buyer_agent === agent && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        run({
                          action: 'approve',
                          session: s.id,
                          digest: s.quote_digest,
                        })
                      }
                    >
                      确认报价并冻结 {money(s.cap)} 测试额度
                    </button>
                  )}
                {s.state === 'READY' && s.buyer_agent === agent && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      run({
                        action: 'send',
                        session: s.id,
                        key: crypto.randomUUID(),
                        input: prompt,
                        maxOutput: 512,
                      })
                    }
                  >
                    执行一次 Mock 推理
                  </button>
                )}
                {s.state === 'READY' && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => run({ action: 'pause', session: s.id })}
                  >
                    暂停
                  </button>
                )}
                {s.state === 'PAUSED' && s.buyer_agent === agent && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => run({ action: 'resume', session: s.id })}
                  >
                    恢复
                  </button>
                )}
                {!['SETTLED', 'CANCELLED'].includes(s.state) && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => run({ action: 'close', session: s.id })}
                  >
                    结束并结算 / 取消
                  </button>
                )}
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => run({ action: 'calls', session: s.id })}
                >
                  查看用量凭证
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => run({ action: 'invoice', session: s.id })}
                >
                  下载账单与账本凭证
                </button>
                {s.state === 'SETTLED' &&
                  s.seller_agent === agent &&
                  BigInt(s.spent) > BigInt(s.refunded) && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        run({
                          action: 'refund',
                          session: s.id,
                          amount: (
                            BigInt(s.spent) - BigInt(s.refunded)
                          ).toString(),
                          key: crypto.randomUUID(),
                        })
                      }
                    >
                      退回剩余已收费金额（含佣金）
                    </button>
                  )}
              </article>
            ))}
          </section>
          {answer && (
            <pre className="overflow-auto whitespace-pre-wrap rounded bg-muted p-4">
              {answer}
            </pre>
          )}
        </>
      )}
    </main>
  );
}
