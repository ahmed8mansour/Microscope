'use client';

import { useMutation } from '@tanstack/react-query';

interface ApiErrorBody {
  error?: { code: string; message: string };
}

async function login(password: string): Promise<{ ok: true }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: true } & ApiErrorBody;
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Too many failed attempts. Try again in a few minutes.');
    }
    throw new Error(data?.error?.message ?? 'Incorrect password. Please try again.');
  }
  return { ok: true };
}

export function useLogin() {
  return useMutation({ mutationFn: login });
}

async function logout(): Promise<void> {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
}

export function useLogout() {
  return useMutation({ mutationFn: logout });
}
