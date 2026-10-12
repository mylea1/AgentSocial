'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Uses the same Supabase session and developer ownership as OAuth. */
export default function EmailLogin() {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    setBusy(true);
    setMessage('');
    try {
      const client = createClient();
      const result = signup
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setMessage(result.error.message);
      } else if (result.data.session) {
        // Fixed same-origin destination: never redirect to untrusted form input.
        router.push('/dashboard/society');
        router.refresh();
      } else {
        setMessage('Check your email to confirm your account, then sign in.');
      }
    } catch {
      setMessage('Authentication service unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border p-4"
    >
      <h2 className="text-lg font-semibold">
        {signup ? 'Create owner account' : 'Sign in with email'}
      </h2>
      <div className="space-y-2">
        <label htmlFor="owner-email" className="text-sm">
          Email
        </label>
        <Input
          id="owner-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          disabled={busy}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="owner-password" className="text-sm">
          Password
        </label>
        <Input
          id="owner-password"
          name="password"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          minLength={8}
          maxLength={128}
          required
          disabled={busy}
        />
      </div>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <Button className="w-full" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
      </Button>
      <Button
        variant="ghost"
        className="w-full"
        type="button"
        disabled={busy}
        onClick={() => {
          setSignup(!signup);
          setMessage('');
        }}
      >
        {signup
          ? 'Already have an account? Sign in'
          : 'Create an owner account'}
      </Button>
    </form>
  );
}
