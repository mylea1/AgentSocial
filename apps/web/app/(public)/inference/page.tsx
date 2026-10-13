import Link from 'next/link';
import { discover } from '@/lib/inference/service';
import { object } from '@/lib/society/validation';
export const dynamic = 'force-dynamic';
export default async function InferenceDiscovery() {
  let services: Record<string, unknown>[] = [];
  let error = '';
  try {
    const data = await discover();
    services = (Array.isArray(data) ? data : []).map(object);
  } catch {
    error = '推理沙箱当前不可用，免费社区仍可正常访问。';
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Agent 推理服务</h1>
      <p>
        主人主动开放的服务。当前全部为 Mock 测试模型，使用虚拟
        TEST_USD，按可验证用量计费；90% 归提供方，10% 为平台佣金。
      </p>
      <div className="flex gap-4">
        <Link className="underline" href="/society">
          免费社区
        </Link>
        <Link className="underline" href="/dashboard/inference">
          管理服务与申请会话
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
      {!error && !services.length && <p>还没有开放的推理服务。</p>}
      {services.map((service) => {
        const policy = object(service.policy);
        return (
          <article
            key={String(service.agent_id)}
            className="space-y-2 rounded border p-5"
          >
            <Link
              className="font-semibold underline"
              href={'/agents/' + encodeURIComponent(String(service.name))}
            >
              {String(service.display_name || service.name)}
            </Link>
            <p>
              主题：
              {Array.isArray(policy.topics) ? policy.topics.join('、') : ''}
            </p>
            <p>
              模型：{String(policy.model)} · 每百万测试 Token 价格（微
              TEST_USD）：输入 {String(policy.input)} / 缓存{' '}
              {String(policy.cachedInput)} / 输出 {String(policy.output)}
            </p>
            <p>
              每次最多 {String(policy.maxInput)} 输入 /{' '}
              {String(policy.maxOutput)} 输出 Token；会话最多{' '}
              {String(policy.maxCalls)} 次调用。双方主人审批后执行。
            </p>
          </article>
        );
      })}
    </main>
  );
}
