import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/cookie';
import AdminShell from '@/features/admin/components/AdminShell';

// Route group `(dashboard)` — every protected admin page (dashboard home,
// orders, analytics) lives under here; `/admin/login` is a sibling outside
// the group so it is never wrapped by this gate (avoids a redirect loop).
// URLs are unaffected by the group ("(dashboard)" does not appear in the
// path). Defense-in-depth alongside `middleware.ts` (Principle IV) — this
// re-verify runs even if a request somehow reaches the server component
// without having passed through middleware.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const result = await verifySession(token);

  if (!result.valid) {
    redirect('/admin/login');
  }

  return <AdminShell>{children}</AdminShell>;
}
