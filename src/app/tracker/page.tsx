'use client';

import { useEffect, useState } from 'react';
import LiveTracker from '@/components/LiveTracker';
import { generateTrackingId } from '@/lib/storage';
import styles from './page.module.css';

const SESSION_KEY = 'standalone_tracker_id';

// Quick Track: share your own location without creating a tracker first.
// The session ID can later be added to any account from the dashboard
// ("Link an existing tracker").
export default function StandaloneTracker() {
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let id = '';
    try {
      id = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || '';
    } catch {
      // storage unavailable
    }
    if (!id) id = generateTrackingId();
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {
      // storage unavailable
    }
    setTrackingId(id);
  }, []);

  if (!trackingId) {
    return (
      <div className={styles.gradientBg}>
        <div className={styles.container}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  const copy = () => {
    void navigator.clipboard?.writeText(trackingId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <LiveTracker
      trackingId={trackingId}
      subtitle="Quick Track — share this device's location"
      headerExtra={
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--cyber-text-muted)', wordBreak: 'break-all' }}>
          Session ID: <code>{trackingId}</code>{' '}
          <button
            type="button"
            onClick={copy}
            style={{ background: 'none', border: '1px solid var(--cyber-border)', color: 'var(--cyber-primary)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <br />
          Add this ID on your dashboard (&quot;Link existing tracker&quot;) to watch it live.
        </p>
      }
    />
  );
}
