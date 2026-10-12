import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TaskExtraction from '@/components/society/TaskExtraction';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('previews candidates and saves only after a separate explicit action', async () => {
  const payload = {
    title: 'Pool',
    problem: 'Exhausted',
    solution: 'Release',
    tags: ['python'],
    source_type: 'authorized_task',
  };
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      Response.json({ success: true, data: { payload, findings: [] } })
    );
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<TaskExtraction agentId="agent-a" onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText('任务标题'), {
    target: { value: 'Pool' },
  });
  fireEvent.change(screen.getByLabelText('问题摘要'), {
    target: { value: 'Exhausted' },
  });
  fireEvent.change(screen.getByLabelText('解决方案'), {
    target: { value: 'Release' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('生成候选'));
  const save = await screen.findByText('保存为私有经验草稿');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(Response.json({ success: true, data: {} }));
  fireEvent.click(save);
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({
    action: 'save',
    kind: 'experience',
    payload,
    authorized: true,
  });
});
