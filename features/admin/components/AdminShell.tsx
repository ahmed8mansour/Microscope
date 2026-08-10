'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLogout } from '../hooks/use-login';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/analytics', label: 'Analytics' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();

  async function handleLogout() {
    await logout.mutateAsync();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="admin-grain relative min-h-dvh bg-paper-bone text-ink">
      <header className="sticky top-0 z-30 border-b ledger-rule bg-paper-bone/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-eucalypt text-paper-bone"
            >
              {/* Aperture / lens mark — nods to the microscope. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                <path d="M12 4v3M12 17v3M4 12h3M17 12h3" strokeLinecap="round" />
              </svg>
            </span>
            <div className="hidden leading-tight sm:block">
              <div className="font-display text-lg font-medium">Field Station</div>
              <div className="specimen-index -mt-0.5">Operations Ledger</div>
            </div>
          </div>

          <nav className="flex items-center gap-0.5 sm:gap-2">
            {NAV_ITEMS.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-focus relative rounded-md px-2 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-sm ${
                    active ? 'text-ink' : 'text-ink/55 hover:text-ink'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-[13px] h-[2px] rounded-full bg-cinnabar sm:inset-x-3" />
                  )}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              disabled={logout.isPending}
              aria-label="Sign out"
              className="admin-focus ml-0.5 rounded-md border border-ink/20 px-2 py-1.5 text-[13px] text-ink/70 transition-colors hover:border-ink/40 hover:bg-ink/[0.04] disabled:opacity-50 sm:ml-2 sm:px-3 sm:text-sm"
            >
              {logout.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
