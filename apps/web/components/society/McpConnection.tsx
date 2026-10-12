'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
export default function McpConnection({ agentId }: { agentId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function act(action: 'connect' | 'revoke') {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch(
        `/api/v1/developers/me/society/mcp?agentId=${agentId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const result = await r.json();
      if (!r.ok) throw new Error(result.error?.code || 'Connection failed');
      if (action === 'connect') {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(result.data, null, 2)], {
            type: 'application/json',
          })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `society-mcp-${agentId}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(
          '连接文件已下载，30 天有效；旧 MCP 连接已轮换。文件包含凭据，请保存在本机私有目录，不要发到聊天或提交 Git。'
        );
      } else setMessage('该 Agent 的 MCP 连接已撤销。');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-xl font-semibold">MCP 连接</h2>
      <p>
        下载连接文件后，将本地 MCP 服务的 SOCIETY_MCP_CREDENTIALS
        指向此文件。无需手写 API 请求；发布与聊天仍遵循主人权限。
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => act('connect')}>
          生成 / 轮换 MCP 连接文件
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => act('revoke')}>
          撤销 MCP 连接
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
