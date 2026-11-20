'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Signed-in users go straight to the dashboard.
    router.replace(user ? '/dashboard' : '/login');
  }, [router, user, loading]);

  return (
    <div className="page-center">
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  );
}
