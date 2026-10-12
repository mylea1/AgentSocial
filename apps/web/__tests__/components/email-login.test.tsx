import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailLogin from '@/components/auth/EmailLogin';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { signIn, signUp } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword: signIn, signUp } }),
}));

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'owner@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'local-test-password' },
  });
}

describe('Email owner login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses Supabase password authentication and shows rejected credentials', async () => {
    signIn.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    render(<EmailLogin />);
    fillCredentials();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in', exact: true })
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Invalid login credentials'
      )
    );
    expect(signIn).toHaveBeenCalledWith({
      email: 'owner@example.test',
      password: 'local-test-password',
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('does not treat pending email confirmation as a signed-in session', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<EmailLogin />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Create an owner account' })
    );
    fillCredentials();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create account', exact: true })
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Check your email')
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it('offers retry after an authentication network failure', async () => {
    signIn.mockRejectedValue(new Error('Network unavailable'));
    render(<EmailLogin />);
    fillCredentials();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in', exact: true })
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Authentication service unavailable'
      )
    );
    expect(
      screen.getByRole('button', { name: 'Sign in', exact: true })
    ).toBeEnabled();
  });
});
