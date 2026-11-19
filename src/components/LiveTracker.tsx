'use client';

// Screen shown to the person sharing their location (tracking link and Quick
// Track). Sharing only starts after explicit consent and can be paused or
// stopped at any time.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLiveTracking } from '@/lib/use-live-tracking';
import { useNow } from '@/lib/use-now';
import { cancelSos, subscribeToTracker, triggerSos } from '@/lib/firebase-services';
import { getDeviceInfo } from '@/lib/storage';
import { classifyBattery, formatFixAge, TRACKING_CONFIG } from '@/lib/geo';
import type { DeviceInfo, Tracker } from '@/lib/types';
import SosButton from './SosButton';
import ChatPanel from './ChatPanel';
import styles from './LiveTracker.module.css';

const LiveMap = dynamic(() => import('./LiveMap'), { ssr: false });

interface LiveTrackerProps {
  trackingId: string;
  subtitle: string;
  /** Extra content shown under the header (e.g. the Quick Track session ID). */
  headerExtra?: React.ReactNode;
}

export default function LiveTracker({ trackingId, subtitle, headerExtra }: LiveTrackerProps) {
  const t = useLiveTracking(trackingId);
  const now = useNow(1000);
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [displayName, setDisplayName] = useState('Device');
  const [sosError, setSosError] = useState<string | null>(null);

  useEffect(() => {
    setDeviceInfo(getDeviceInfo());
    try {
      setDisplayName(localStorage.getItem('geotracker:display-name') || 'Device');
    } catch {
      // ignore
    }
  }, []);

  // Live view of the tracker document (name, SOS state). Reads are allowed for
  // anyone holding the link; a permission error just hides those extras.
  useEffect(() => subscribeToTracker(trackingId, setTracker, () => setTracker(null)), [trackingId]);

  const sosActive = Boolean(tracker?.sos?.active);
  const batteryState = classifyBattery(t.battery?.level, t.battery?.charging);

  const markers = useMemo(
    () =>
      t.current
        ? [
            {
              id: 'self',
              latitude: t.current.latitude,
              longitude: t.current.longitude,
              accuracy: t.current.accuracy,
              label: 'You are here',
              detail: `±${Math.round(t.current.accuracy)} m`,
              variant: sosActive ? ('sos' as const) : ('self' as const),
            },
          ]
        : [],
    [t.current, sosActive],
  );

  const handleSos = async () => {
    setSosError(null);
    try {
      await triggerSos(trackingId, t.current);
      void t.refresh();
    } catch {
      setSosError(t.online ? 'SOS could not be sent. Try again.' : 'You are offline — SOS will be sent when the connection returns.');
    }
  };

  const saveName = (name: string) => {
    setDisplayName(name);
    try {
      localStorage.setItem('geotracker:display-name', name);
    } catch {
      // ignore
    }
  };

  const showConsent = t.phase === 'idle' || t.phase === 'stopped';

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.header}>
          <h1>📍 Location Sharing</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {tracker?.name && <p className={styles.trackerName}>Session: {tracker.name}</p>}
          {headerExtra}
        </header>

        {showConsent ? (
          <section className={styles.consent} aria-labelledby="consent-title">
            <h2 id="consent-title">{t.phase === 'stopped' ? 'Sharing stopped' : 'Share your location?'}</h2>
            <p>
              The owner of this link will see, in real time while this page is open:
            </p>
            <ul>
              <li>Your precise location and movement trail</li>
              <li>Battery level and charging state</li>
              <li>Device type, browser and IP address</li>
            </ul>
            <p className={styles.muted}>
              You can pause or stop sharing at any time. Your browser will ask for location permission.
            </p>
            <button type="button" className="btn" onClick={t.start}>
              {t.phase === 'stopped' ? '▶ Start sharing again' : '▶ Start sharing my location'}
            </button>
          </section>
        ) : (
          <>
            <div className={styles.statusBar} role="status">
              <span className={`${styles.badge} ${t.phase === 'tracking' ? styles.live : t.phase === 'paused' ? styles.paused : t.phase === 'error' ? styles.err : ''}`}>
                {t.phase === 'tracking' && '● LIVE'}
                {t.phase === 'starting' && '◌ Acquiring GPS…'}
                {t.phase === 'paused' && '❚❚ PAUSED'}
                {t.phase === 'error' && '✗ ERROR'}
              </span>
              {t.phase === 'tracking' && (
                <span className={styles.badge}>{t.motion === 'moving' ? '🚶 Moving · 5s updates' : '🧍 Stationary · 60s heartbeat'}</span>
              )}
              <span className={`${styles.badge} ${t.online ? '' : styles.paused}`}>
                {t.online ? '☁ Online' : '⚠ Offline — queued'}
              </span>
              {t.pending > 0 && <span className={styles.badge}>⟳ {t.pending} syncing</span>}
            </div>

            {t.error && (
              <div className="status error" role="alert">
                {t.error}
                {t.phase === 'error' && (
                  <button type="button" className={styles.inlineBtn} onClick={t.start}>
                    Retry
                  </button>
                )}
              </div>
            )}

            {t.current && (
              <div className="info-grid">
                <Info label="Latitude" value={t.current.latitude.toFixed(6)} />
                <Info label="Longitude" value={t.current.longitude.toFixed(6)} />
                <Info label="Accuracy" value={`±${t.current.accuracy.toFixed(1)} m`} />
                <Info label="Fix age" value={formatFixAge(t.current.timestamp, now)} />
                <Info
                  label="Speed"
                  value={typeof t.current.speed === 'number' ? `${(t.current.speed * 3.6).toFixed(1)} km/h` : '—'}
                />
                <Info
                  label="Battery"
                  value={
                    t.battery
                      ? `${Math.round(t.battery.level * 100)}%${t.battery.charging ? ' ⚡' : ''}`
                      : 'N/A'
                  }
                  tone={batteryState === 'critical' ? 'danger' : batteryState === 'low' ? 'warning' : undefined}
                />
                <Info label="Updates sent" value={String(t.uploads)} />
                <Info label="Last sync" value={t.lastUpload ? formatFixAge(t.lastUpload, now) : '—'} />
              </div>
            )}

            {(t.current || t.phase === 'tracking') && (
              <LiveMap markers={markers} trail={t.trail} followId="self" height={340} />
            )}

            <div className={styles.actions}>
              {t.phase === 'paused' ? (
                <button type="button" className="btn" onClick={t.resume}>
                  ▶ Resume sharing
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={t.pause} disabled={t.phase === 'error'}>
                  ❚❚ Pause
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => void t.refresh()} disabled={t.phase !== 'tracking'}>
                🔄 Update now
              </button>
              <button type="button" className={`btn ${styles.stopBtn}`} onClick={t.stop}>
                ■ Stop sharing
              </button>
            </div>

            <label className={styles.toggle}>
              <input type="checkbox" checked={t.keepAwake} onChange={(e) => void t.setKeepAwake(e.target.checked)} />
              Keep screen awake (more reliable updates on phones)
            </label>
          </>
        )}

        <section className={styles.section} aria-labelledby="sos-title">
          <h2 id="sos-title">Emergency</h2>
          <SosButton
            active={sosActive}
            disabled={showConsent}
            onTrigger={handleSos}
            onCancel={() => cancelSos(trackingId).catch(() => setSosError('Could not cancel SOS.'))}
          />
          {sosError && <p className={styles.errorText}>{sosError}</p>}
          {showConsent && <p className={styles.muted}>Start sharing to enable the SOS button.</p>}
        </section>

        <section className={styles.section} aria-labelledby="chat-title">
          <h2 id="chat-title">Messages</h2>
          <label className={styles.nameField}>
            Your name
            <input value={displayName} maxLength={40} onChange={(e) => saveName(e.target.value)} />
          </label>
          <ChatPanel trackingId={trackingId} role="device" senderName={displayName || 'Device'} compact />
        </section>

        {deviceInfo && (
          <details className="device-info">
            <summary>
              <h3 style={{ display: 'inline' }}>📱 Shared device details</h3>
            </summary>
            <div className="device-details">
              <Row label="Browser" value={deviceInfo.browser} />
              <Row label="Operating System" value={deviceInfo.os} />
              <Row label="Platform" value={deviceInfo.platform} />
              <Row label="Screen" value={deviceInfo.screen} />
              <Row label="IP Address" value={t.ip} />
              <Row label="User Agent" value={deviceInfo.userAgent} small />
            </div>
          </details>
        )}

        <p className={styles.footerNote}>
          Updates: every {TRACKING_CONFIG.movingIntervalMs / 1000}s while moving, every {TRACKING_CONFIG.idleIntervalMs / 1000}s when still.
          Keep this page open for continuous sharing.
        </p>

        <Link href="/login" className={styles.backLink}>
          ← GeoTracker home
        </Link>
      </main>
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'danger' }) {
  return (
    <div className="info-card">
      <div className="info-label">{label}</div>
      <div
        className="info-value"
        style={tone ? { color: tone === 'danger' ? 'var(--cyber-danger)' : 'var(--cyber-warning)' } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="device-item">
      <span className="device-label">{label}:</span>
      <span className="device-value" style={small ? { fontSize: '10px', wordBreak: 'break-all' } : undefined}>
        {value}
      </span>
    </div>
  );
}
