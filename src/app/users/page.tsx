'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { subscribeToUsers, User } from '@/lib/firebase-services';
import { Users } from 'lucide-react';
import AppHeader from '@/components/ui/AppHeader';
import styles from './page.module.css';

export default function UsersPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (!user) return;
    // Realtime registry: new sign-ups and logins appear instantly.
    return subscribeToUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading users:', error);
        setLoading(false);
      },
    );
  }, [router, user, authLoading]);

  const handleSignOut = async () => {
    await logout().catch(() => undefined);
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="page-center">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader userName={user?.displayName || user?.email || 'Guest'} onSignOut={handleSignOut} />

      <main className={styles.content}>
        <div className={styles.pageHead}>
          <h1>Users</h1>
          <p className="muted">Accounts that have signed in to this GeoTracker.</p>
        </div>

        {users.length === 0 ? (
          <div className={`card ${styles.emptyState}`}>
            <Users size={24} aria-hidden="true" />
            <p>No users yet</p>
            <p className="muted">Accounts appear here after they sign up and sign in.</p>
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              Back to dashboard
            </Link>
          </div>
        ) : (
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">
                All users <span className={styles.count}>{users.length}</span>
              </h2>
            </div>
            <ul className={styles.list}>
              {users.map((registeredUser) => (
                <li key={registeredUser.id} className={styles.item}>
                  <span className={styles.avatar} aria-hidden="true">
                    {registeredUser.displayName?.[0]?.toUpperCase() || registeredUser.email?.[0]?.toUpperCase() || '?'}
                  </span>
                  <div className={styles.who}>
                    <div className={styles.name}>
                      {registeredUser.displayName || 'Unnamed user'}
                      {registeredUser.id === user?.uid && <span className="badge badge-accent">You</span>}
                    </div>
                    <div className={styles.email}>{registeredUser.email || 'Guest account'}</div>
                  </div>
                  <dl className={styles.meta}>
                    <div>
                      <dt>Joined</dt>
                      <dd>{new Date(registeredUser.createdAt).toLocaleDateString()}</dd>
                    </div>
                    {registeredUser.lastLoginAt && (
                      <div>
                        <dt>Last active</dt>
                        <dd>{new Date(registeredUser.lastLoginAt).toLocaleString()}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
