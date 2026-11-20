'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import LiveTracker from '@/components/LiveTracker';
import { isValidTrackerId } from '@/lib/geo';
import { Link2Off as LinkIcon } from 'lucide-react';
import styles from './page.module.css';

function TrackContent() {
  const searchParams = useSearchParams();
  const trackingId = searchParams.get('id');

  if (!trackingId || !isValidTrackerId(trackingId)) {
    return (
      <div className={styles.page}>
        <div className={`card ${styles.panel}`}>
          <span className={styles.icon} aria-hidden="true">
            <LinkIcon size={22} />
          </span>
          <h1>This link doesn&apos;t work</h1>
          <p className="muted">
            The tracking link is missing or incomplete. Ask the person who sent it for a new one.
          </p>
          <Link href="/login" className="btn btn-secondary">
            Go to GeoTracker
          </Link>
        </div>
      </div>
    );
  }

  return <LiveTracker trackingId={trackingId} subtitle="Someone shared a tracking link with you" />;
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="page-center">
          <div className="spinner" role="status" aria-label="Loading" />
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
