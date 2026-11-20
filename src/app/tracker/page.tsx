'use client';

import { useEffect, useState } from 'react';
import LiveTracker from '@/components/LiveTracker';
import QrCodeDialog from '@/components/QrCodeDialog';
import { generateTrackingId } from '@/lib/storage';
import { Check, Copy, QrCode } from 'lucide-react';
import styles from './page.module.css';

const SESSION_KEY = 'standalone_tracker_id';

// Quick Track: share your own location without creating a tracker first.
// The session ID can later be added to any account from the dashboard
// ("Link an existing tracker").
export default function StandaloneTracker() {
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

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
      <div className="page-center">
        <div className="spinner" role="status" aria-label="Loading" />
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
      subtitle="Quick Track — share this device's location without setting up a tracker first."
      headerExtra={
        <>
          <div className={styles.session}>
            <div className={styles.sessionTop}>
              <span className={styles.sessionLabel}>Session ID</span>
              <div className={styles.sessionActions}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowQr(true)}>
                  <QrCode size={14} aria-hidden="true" /> QR
                </button>
              </div>
            </div>
            <code className={styles.sessionId}>{trackingId}</code>
            <p className={styles.sessionHint}>
              To watch this device, add the ID on your dashboard under &quot;Add an existing tracker&quot;.
            </p>
          </div>
          {showQr && (
            <QrCodeDialog
              url={trackingId}
              title="Quick Track session ID"
              hint="Scan this ID to add the session to a dashboard, or with the GeoTracker Android app to report from that phone instead."
              onClose={() => setShowQr(false)}
            />
          )}
        </>
      }
    />
  );
}
