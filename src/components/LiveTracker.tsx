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
import {
  AlertCircle,
  ArrowLeft,
  BatteryMedium,
  Download,
  Info as InfoIcon,
  MapPin,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  Smartphone,
  Square,
  Tag,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { usePlatform } from '@/lib/platform';
import Brand from './ui/Brand';
import ThemeToggle from './ui/ThemeToggle';
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
  const platform = usePlatform();
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

  const phaseBadge =
    t.phase === 'tracking'
      ? { cls: 'badge-success', label: 'Sharing live' }
      : t.phase === 'starting'
        ? { cls: 'badge-accent', label: 'Finding your location…' }
        : t.phase === 'paused'
          ? { cls: 'badge-warning', label: 'Paused' }
          : t.phase === 'error'
            ? { cls: 'badge-danger', label: 'Problem' }
            : null;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Brand size={26} />
        <ThemeToggle />
      </header>

      <main className={styles.container}>
        <header className={styles.header}>
          <h1>Location sharing</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {tracker?.name && (
            <p className={styles.trackerName}>
              <Tag size={14} aria-hidden="true" /> {tracker.name}
            </p>
          )}
          {headerExtra}
        </header>

        {platform === 'android' && (
          <Link href="/download" className={`card ${styles.appBanner}`}>
            <span className={styles.appBannerIcon} aria-hidden="true">
              <Download size={18} />
            </span>
            <span>
              <strong>Share all the time with the app</strong>
              <small>The Android app keeps sharing in the background and after restarts. Tap to install.</small>
            </span>
          </Link>
        )}

        {showConsent ? (
          <section className={`card ${styles.consent}`} aria-labelledby="consent-title">
            <div className={styles.consentIcon} aria-hidden="true">
              <MapPin size={22} />
            </div>
            <h2 id="consent-title">{t.phase === 'stopped' ? 'Sharing is off' : 'Share your location?'}</h2>
            <p className="muted">While this page is open, the owner of this link will see:</p>
            <ul className={styles.shareList}>
              <li>
                <Navigation size={16} aria-hidden="true" /> Your precise location and route
              </li>
              <li>
                <BatteryMedium size={16} aria-hidden="true" /> Battery level and charging state
              </li>
              <li>
                <Smartphone size={16} aria-hidden="true" /> Device type, browser and IP address
              </li>
            </ul>
            <p className={styles.consentNote}>
              You can pause or stop at any time. Your browser will ask for permission first.
            </p>
            <button type="button" className="btn btn-lg btn-block" onClick={t.start}>
              <Play size={16} aria-hidden="true" />
              {t.phase === 'stopped' ? 'Start sharing again' : 'Start sharing'}
            </button>
          </section>
        ) : (
          <section className={`card ${styles.liveCard}`}>
            <div className={styles.statusBar} role="status">
              {phaseBadge && <span className={`badge badge-dot ${phaseBadge.cls}`}>{phaseBadge.label}</span>}
              {t.phase === 'tracking' && (
                <span className="badge">
                  {t.motion === 'moving' ? 'Moving · every 5 s' : 'Still · every 60 s'}
                </span>
              )}
              <span className={`badge ${t.online ? '' : 'badge-warning'}`}>
                {t.online ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
                {t.online ? 'Online' : 'Offline — will sync later'}
              </span>
              {t.pending > 0 && <span className="badge badge-accent">{t.pending} syncing</span>}
            </div>

            {t.error && (
              <div className="status error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{t.error}</span>
                {t.phase === 'error' && (
                  <button type="button" className={`btn btn-sm btn-secondary ${styles.inlineBtn}`} onClick={t.start}>
                    Retry
                  </button>
                )}
              </div>
            )}

            {(t.current || t.phase === 'tracking') && (
              <div className={styles.map}>
                <LiveMap markers={markers} trail={t.trail} followId="self" height={320} />
              </div>
            )}

            {t.current && (
              <div className="info-grid">
                <Info label="Latitude" value={t.current.latitude.toFixed(6)} mono />
                <Info label="Longitude" value={t.current.longitude.toFixed(6)} mono />
                <Info label="Accuracy" value={`±${t.current.accuracy.toFixed(0)} m`} />
                <Info label="Fix age" value={formatFixAge(t.current.timestamp, now)} />
                <Info
                  label="Speed"
                  value={typeof t.current.speed === 'number' ? `${(t.current.speed * 3.6).toFixed(1)} km/h` : '—'}
                />
                <Info
                  label="Battery"
                  value={
                    t.battery ? `${Math.round(t.battery.level * 100)}%${t.battery.charging ? ' · charging' : ''}` : '—'
                  }
                  tone={batteryState === 'critical' ? 'danger' : batteryState === 'low' ? 'warning' : undefined}
                />
                <Info label="Updates sent" value={String(t.uploads)} />
                <Info label="Last sync" value={t.lastUpload ? formatFixAge(t.lastUpload, now) : '—'} />
              </div>
            )}

            <div className={styles.actions}>
              {t.phase === 'paused' ? (
                <button type="button" className="btn" onClick={t.resume}>
                  <Play size={16} aria-hidden="true" /> Resume
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={t.pause} disabled={t.phase === 'error'}>
                  <Pause size={16} aria-hidden="true" /> Pause
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void t.refresh()}
                disabled={t.phase !== 'tracking'}
              >
                <RefreshCw size={16} aria-hidden="true" /> Update now
              </button>
              <button type="button" className="btn btn-danger-outline" onClick={t.stop}>
                <Square size={14} aria-hidden="true" /> Stop sharing
              </button>
            </div>

            <label className={styles.toggle}>
              <input type="checkbox" checked={t.keepAwake} onChange={(e) => void t.setKeepAwake(e.target.checked)} />
              <span>
                Keep screen awake
                <small>More reliable updates on phones</small>
              </span>
            </label>
          </section>
        )}

        <section className={`card ${styles.section}`} aria-labelledby="sos-title">
          <h2 id="sos-title">Emergency</h2>
          <SosButton
            active={sosActive}
            disabled={showConsent}
            onTrigger={handleSos}
            onCancel={() => cancelSos(trackingId).catch(() => setSosError('Could not cancel SOS.'))}
          />
          {sosError && <p className={styles.errorText}>{sosError}</p>}
          {showConsent && <p className={styles.sectionHint}>Start sharing to enable the SOS button.</p>}
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="chat-title">
          <h2 id="chat-title">Messages</h2>
          <div className="field">
            <label htmlFor="chat-name">Your name</label>
            <input
              id="chat-name"
              className="input"
              value={displayName}
              maxLength={40}
              onChange={(e) => saveName(e.target.value)}
            />
          </div>
          <ChatPanel trackingId={trackingId} role="device" senderName={displayName || 'Device'} compact />
        </section>

        {deviceInfo && (
          <details className="device-info disclosure">
            <summary>
              <InfoIcon size={16} aria-hidden="true" /> What this device shares
            </summary>
            <div className="device-details">
              <Row label="Browser" value={deviceInfo.browser} />
              <Row label="Operating system" value={deviceInfo.os} />
              <Row label="Platform" value={deviceInfo.platform} />
              <Row label="Screen" value={deviceInfo.screen} />
              <Row label="IP address" value={t.ip} />
              <Row label="User agent" value={deviceInfo.userAgent} small />
            </div>
          </details>
        )}

        <p className={styles.footerNote}>
          Updates every {TRACKING_CONFIG.movingIntervalMs / 1000} s while moving and every{' '}
          {TRACKING_CONFIG.idleIntervalMs / 1000} s when still. Keep this page open to keep sharing.
        </p>

        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={14} aria-hidden="true" /> GeoTracker home
        </Link>
      </main>
    </div>
  );
}

function Info({ label, value, tone, mono }: { label: string; value: string; tone?: 'warning' | 'danger'; mono?: boolean }) {
  return (
    <div className="info-card">
      <div className="info-label">{label}</div>
      <div
        className={`info-value ${mono ? 'mono' : ''} ${tone === 'danger' ? styles.danger : tone === 'warning' ? styles.warning : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="device-item">
      <span className="device-label">{label}</span>
      <span className={`device-value ${small ? styles.small : ''}`}>{value}</span>
    </div>
  );
}
