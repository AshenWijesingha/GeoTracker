'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, LogOut, Radio, Users } from 'lucide-react';
import Brand from './Brand';
import ThemeToggle from './ThemeToggle';
import styles from './AppHeader.module.css';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/tracker', label: 'Quick Track', Icon: Radio },
  { href: '/users', label: 'Users', Icon: Users },
];

interface Props {
  userName?: string | null;
  onSignOut?: () => void;
  /** Extra controls shown before the theme switch (e.g. "Enable alerts"). */
  actions?: React.ReactNode;
}

/** Top bar for signed-in pages: brand, primary navigation, theme and account. */
export default function AppHeader({ userName, onSignOut, actions }: Props) {
  const pathname = usePathname() ?? '';
  const initial = (userName || 'G').trim().charAt(0).toUpperCase();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/dashboard" className={styles.brandLink} aria-label="GeoTracker dashboard">
          <Brand />
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname.replace(/\/$/, '').endsWith(href);
            return (
              <Link key={href} href={href} className={styles.navItem} aria-current={active ? 'page' : undefined}>
                <Icon size={16} aria-hidden="true" />
                <span className={styles.navLabel}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          {actions}
          <ThemeToggle />
          {onSignOut && (
            <div className={styles.account}>
              <span className={styles.avatar} aria-hidden="true">
                {initial}
              </span>
              <span className={styles.userName}>{userName || 'Guest'}</span>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onSignOut} title="Sign out">
                <LogOut size={16} aria-hidden="true" />
                <span className="sr-only">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
