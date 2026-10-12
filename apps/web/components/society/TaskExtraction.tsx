'use client';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Payload } from '@/lib/society/validation';

export default function TaskExtraction({
  agentId,
  onSaved,
}: {
  agentId: string;
  onSaved: () => Promise<void>;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  async function request(value: unknown) {
    const response = await fetch(
      `/api/v1/developers/me/society?agentId=${agentId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(value),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.code || 'Request failed');
    return result.data;
  }
  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setPayload(null);
    setMessage('');
    try {
      const result = await request({
        action: 'extract',
        authorized: form.get('authorized') === 'on',
        task: {
          title: form.get('title'),
          problem: form.get('problem'),
          solution: form.get('solution'),
        },
      });
      setPayload(result.payload);
      setKey(crypto.randomUUID());
      if (result.findings.length)
        setMessage(
          `Blocked: ${result.findings.join(', ')}. Remove private information before retrying.`
        );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Extraction failed');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await request({
        action: 'save',
        kind: 'experience',
        payload,
        authorized: true,
      });
      setPayload(null);
      setMessage(
        'Private draft saved. Review and submit it in the draft list.'
      );
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>从授权任务生成经验草稿</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          仅处理你在下方提供的摘要。使用本地规则建议标签，不读取聊天记录、不调用外部模型，也不会自动公开。敏感信息检查不能保证识别所有隐私。
        </p>
        <form
          onSubmit={extract}
          className="space-y-3"
          onChange={() => setPayload(null)}
        >
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">
              任务标题
              <Input name="title" required maxLength={200} />
            </label>
            <label className="block">
              问题摘要
              <textarea
                name="problem"
                required
                maxLength={4000}
                className="min-h-24 w-full rounded-md border bg-background p-3"
              />
            </label>
            <label className="block">
              解决方案
              <textarea
                name="solution"
                required
                maxLength={10000}
                className="min-h-24 w-full rounded-md border bg-background p-3"
              />
            </label>
            <label className="block">
              <input name="authorized" type="checkbox" required />{' '}
              我有权处理此摘要，且已移除私人信息
            </label>
            <Button disabled={busy}>生成候选</Button>
          </fieldset>
        </form>
        {message && <p role="status">{message}</p>}
        {payload && (
          <div className="space-y-3">
            <p>
              候选能力标签：
              {(payload.tags as string[]).join(', ') ||
                '未匹配，可保存后手动补充'}
            </p>
            <p>标题：{payload.title}</p>
            <p className="whitespace-pre-wrap">问题：{payload.problem}</p>
            <p className="whitespace-pre-wrap">方案：{payload.solution}</p>
            <Button disabled={busy} onClick={save}>
              保存为私有经验草稿
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
