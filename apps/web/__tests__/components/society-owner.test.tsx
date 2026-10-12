import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OwnerContacts from '@/components/society/OwnerContacts';
import OwnerSociety from '@/components/society/OwnerSociety';
const agent = '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Society owner controls', () => {
  it('approves the displayed request and revokes a displayed session through authenticated owner API', async () => {
    const writes: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ success: true, data: {} });
      }
      if (String(input).includes('view=corrections'))
        return Response.json({ success: true, data: [] });
      return Response.json({
        success: true,
        data: {
          rules: null,
          requests: [
            {
              id: 'request-1',
              recipient_id: agent,
              sender_id: 'other',
              topic: 'postgresql',
              purpose: 'Connection pooling',
              state: 'pending',
              expires_at: '2099-01-01T00:00:00Z',
            },
          ],
          sessions: [
            {
              id: 'session-1',
              state: 'active',
              message_count: 0,
              max_messages: 20,
              expires_at: '2099-01-01T00:00:00Z',
            },
          ],
        },
      });
    });
    render(
      <OwnerContacts agentId={agent} mode="manual" onChanged={async () => {}} />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve contact' })
    );
    await waitFor(() =>
      expect(writes).toContainEqual({
        action: 'contact_accept',
        id: 'request-1',
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Revoke authorization' })
      ).toBeEnabled()
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke authorization' })
    );
    await waitFor(() =>
      expect(writes).toContainEqual({ action: 'close', id: 'session-1' })
    );
  });
  it('does not display failed contact approval as success', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST')
        return Response.json(
          { success: false, error: { code: 'PERMISSION_DENIED' } },
          { status: 403 }
        );
      if (String(input).includes('view=corrections'))
        return Response.json({ success: true, data: [] });
      return Response.json({
        success: true,
        data: {
          rules: null,
          requests: [
            {
              id: 'request-1',
              recipient_id: agent,
              sender_id: 'other',
              topic: 'python',
              purpose: 'Review',
              state: 'pending',
              expires_at: '2099-01-01T00:00:00Z',
            },
          ],
          sessions: [],
        },
      });
    });
    render(
      <OwnerContacts agentId={agent} mode="manual" onChanged={async () => {}} />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve contact' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PERMISSION_DENIED'
    );
  });
  it('submits approval for exactly the draft version shown and disables risky approvals', async () => {
    const writes: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ success: true, data: {} });
      }
      if (url.includes('view=contacts'))
        return Response.json({
          success: true,
          data: { rules: null, requests: [], sessions: [] },
        });
      if (url.includes('view=corrections'))
        return Response.json({ success: true, data: [] });
      if (!url.includes('?'))
        return Response.json({
          success: true,
          data: [{ id: agent, name: 'Python Agent' }],
        });
      return Response.json({
        success: true,
        data: {
          policy: {
            version: 1,
            publish_mode: 'manual',
            contact_mode: 'disabled',
            auto_categories: [],
            auto_tags: [],
          },
          drafts: [
            {
              id: 'draft-1',
              kind: 'experience',
              version: 4,
              state: 'pending',
              payload: { title: 'Pool tuning' },
              findings: [],
            },
            {
              id: 'draft-2',
              kind: 'knowledge',
              version: 2,
              state: 'pending',
              payload: { title: 'Private' },
              findings: ['email'],
            },
          ],
        },
      });
    });
    render(<OwnerSociety />);
    const approve = await screen.findAllByRole('button', {
      name: 'Approve publication',
    });
    expect(approve[1]).toBeDisabled();
    fireEvent.click(approve[0]);
    await waitFor(() =>
      expect(writes).toContainEqual({
        action: 'approve',
        id: 'draft-1',
        version: 4,
      })
    );
  });
});
