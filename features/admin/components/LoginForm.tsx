'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useLogin } from '../hooks/use-login';

interface LoginFormValues {
  password: string;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const { register, handleSubmit, formState } = useForm<LoginFormValues>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(values: LoginFormValues) {
    setErrorMessage(null);
    try {
      await login.mutateAsync(values.password);
      const next = searchParams.get('next');
      router.push(next && next.startsWith('/admin') ? next : '/admin');
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="admin-grain relative flex min-h-dvh items-center justify-center bg-paper-bone px-4 text-ink">
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-eucalypt text-paper-bone"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              <path d="M12 4v3M12 17v3M4 12h3M17 12h3" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="font-display text-3xl font-medium leading-none">Field Station</h1>
          <p className="specimen-index mt-2">Operations Ledger · Staff only</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="admin-card p-6"
          noValidate
        >
          <label htmlFor="password" className="ledger-label mb-2 block">
            Access password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            {...register('password', { required: true })}
            className="admin-focus w-full rounded-lg border border-ink/15 bg-paper-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
          />
          {errorMessage && (
            <p role="alert" className="mt-3 text-sm text-cinnabar">
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={login.isPending || formState.isSubmitting}
            className="admin-focus mt-4 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper-bone transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {login.isPending ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
