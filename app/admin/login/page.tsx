import { Suspense } from 'react';
import LoginForm from '@/features/admin/components/LoginForm';

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
