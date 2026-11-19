'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import LiveTracker from '@/components/LiveTracker';
import { isValidTrackerId } from '@/lib/geo';
import styles from './page.module.css';

function TrackContent() {
  const searchParams = useSearchParams();
  const trackingId = searchParams.get('id');

  if (!trackingId || !isValidTrackerId(trackingId)) {
    return (
      <div className={styles.gradientBg}>
        <div className={styles.container}>
          <h1>📍 Location Sharing</h1>
          <div className="status error" role="alert">
            This tracking link is missing or invalid. Ask the sender for a new link.
          </div>
          <Link href="/login" className={styles.backLink}>
            ← GeoTracker home
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
        <div className={styles.gradientBg}>
          <div className={styles.container}>
            <div className="spinner"></div>
          </div>
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
