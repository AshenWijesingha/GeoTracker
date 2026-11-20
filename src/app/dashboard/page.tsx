'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { createTrackerAsync, deleteTrackerAsync } from '@/lib/storage';
import {
  acknowledgeSos,
  claimTrackerInFirebase,
  clearTrackerHistoryInFirebase,
  subscribeToPoints,
  subscribeToUserTrackers,
} from '@/lib/firebase-services';
import {
  TRACKING_CONFIG,
  classifyBattery,
  computeStats,
  extractTrackerId,
  formatDistance,
  formatDuration,
  formatFixAge,
  pointsToCSV,
  pointsToGPX,
  slugify,
} from '@/lib/geo';
import { getTrackerStatus, mergeHistory, STATUS_LABEL } from '@/lib/tracker-status';
import {
  notify,
  notificationsSupported,
  requestNotificationPermission,
  startAlarm,
  stopAlarm,
  unlockAudio,
} from '@/lib/alerts';
import { appBaseUrl } from '@/lib/paths';
import QrCodeDialog from '@/components/QrCodeDialog';
import AppHeader from '@/components/ui/AppHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  Activity,
  AlertTriangle,
  Battery,
  BatteryCharging,
  BatteryLow,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  Download,
  Eraser,
  ExternalLink,
  Link2,
  MapPin,
  MousePointerClick,
  Plus,
  QrCode,
  RotateCw,
  Route,
  Search,
  Share2,
  Siren,
  Smartphone,
  Trash2,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useNow } from '@/lib/use-now';
import type { LocationData, Tracker } from '@/lib/types';
import type { MapMarker } from '@/components/LiveMap';
import ChatPanel from '@/components/ChatPanel';
import styles from './page.module.css';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

const HISTORY_PAGE = 50;

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const now = useNow(5000);

  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [points, setPoints] = useState<LocationData[]>([]);
  const [pointsError, setPointsError] = useState(false);
  const [search, setSearch] = useState('');
  const [trackerName, setTrackerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [qr, setQr] = useState<{ url: string; title: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [fitKey, setFitKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [tab, setTab] = useState<'overview' | 'messages' | 'history'>('overview');

  const batteryAlertRef = useRef<Map<string, string>>(new Map());
  const sosSeenRef = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    setNotifPermission(notificationsSupported() ? Notification.permission : 'unsupported');
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // Realtime tracker list (replaces 10 s polling: no wasted reads, instant updates)
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setPermissionError(false);
    return subscribeToUserTrackers(
      user.uid,
      (list) => {
        setTrackers(list);
        setLoading(false);
      },
      (error) => {
        console.error('Tracker subscription failed:', error);
        if (/permission/i.test(error.message)) setPermissionError(true);
        setLoading(false);
      },
    );
  }, [user, retryKey]);

  // History for the selected tracker
  useEffect(() => {
    setPoints([]);
    setPointsError(false);
    setHistoryShown(HISTORY_PAGE);
    if (!selectedId) return;
    return subscribeToPoints(selectedId, TRACKING_CONFIG.historyLimit, setPoints, () => setPointsError(true));
  }, [selectedId]);

  // Drop the selection if the tracker disappears
  useEffect(() => {
    if (selectedId && !loading && !trackers.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [trackers, selectedId, loading]);

  // SOS + battery alerts
  const sosTrackers = useMemo(() => trackers.filter((t) => t.sos?.active), [trackers]);

  useEffect(() => {
    if (sosTrackers.length > 0 && !muted) startAlarm();
    else stopAlarm();
    for (const t of sosTrackers) {
      const key = `${t.id}:${t.sos?.triggeredAt}`;
      if (!sosSeenRef.current.has(key)) {
        sosSeenRef.current.add(key);
        notify(`🚨 SOS from ${t.name}`, 'Emergency alert received. Open GeoTracker to see the location.', `sos-${t.id}`);
      }
    }
  }, [sosTrackers, muted]);

  useEffect(() => () => stopAlarm(), []);

  useEffect(() => {
    for (const t of trackers) {
      const state = classifyBattery(t.battery?.level, t.battery?.charging);
      const prev = batteryAlertRef.current.get(t.id);
      batteryAlertRef.current.set(t.id, state);
      if (prev === undefined || prev === state) continue;
      if (state === 'critical' || (state === 'low' && prev !== 'critical')) {
        const pct = Math.round((t.battery?.level ?? 0) * 100);
        notify(`🔋 ${state === 'critical' ? 'Critical' : 'Low'} battery: ${t.name}`, `Battery at ${pct}%.`, `battery-${t.id}`);
        showToast(`${t.name}: battery ${state} (${pct}%)`);
      }
    }
  }, [trackers, showToast]);

  const selected = useMemo(() => trackers.find((t) => t.id === selectedId) ?? null, [trackers, selectedId]);
  const history = useMemo(() => (selected ? mergeHistory(selected.locations, points) : []), [selected, points]);
  const stats = useMemo(() => computeStats(history), [history]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trackers;
    return trackers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.device?.os?.toLowerCase().includes(q) ||
        t.device?.browser?.toLowerCase().includes(q),
    );
  }, [trackers, search]);

  const summary = useMemo(() => {
    let live = 0;
    let lowBattery = 0;
    for (const t of trackers) {
      const s = getTrackerStatus(t, now);
      if (s === 'live' || s === 'sos') live++;
      const b = classifyBattery(t.battery?.level, t.battery?.charging);
      if (b === 'low' || b === 'critical') lowBattery++;
    }
    return { total: trackers.length, live, sos: sosTrackers.length, lowBattery };
  }, [trackers, sosTrackers.length, now]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const t of trackers) {
      const loc = t.sos?.active && typeof t.sos.latitude === 'number' && typeof t.sos.longitude === 'number'
        ? { latitude: t.sos.latitude, longitude: t.sos.longitude, accuracy: t.sos.accuracy ?? null }
        : t.lastLocation;
      if (!loc) continue;
      const status = getTrackerStatus(t, now);
      out.push({
        id: t.id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: t.id === selectedId ? loc.accuracy : null,
        label: t.name,
        detail: `${STATUS_LABEL[status]} · ${formatFixAge(t.lastSeen, now)}${
          t.battery ? ` · battery ${Math.round(t.battery.level * 100)}%` : ''
        }`,
        variant:
          status === 'sos' ? 'sos' : t.id === selectedId ? 'selected' : status === 'live' ? 'live' : status === 'paused' ? 'paused' : 'idle',
      });
    }
    return out;
  }, [trackers, selectedId, now]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleCreateTracker = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    const name = trackerName.trim();
    if (!name) {
      showToast('Please enter a tracker name');
      return;
    }
    setCreating(true);
    try {
      const tracker = await createTrackerAsync(name);
      if (!tracker) throw new Error('not signed in');
      setGeneratedUrl(`${appBaseUrl()}/track/?id=${tracker.id}`);
      setTrackerName('');
      setSelectedId(tracker.id);
    } catch (error) {
      console.error(error);
      showToast('Failed to create tracker. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const linkFor = (id: string) => `${appBaseUrl()}/track/?id=${id}`;

  const copyText = async (text: string, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
    } catch {
      window.prompt('Copy this:', text);
    }
  };

  const shareLink = async (url: string, name: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `GeoTracker: ${name}`, text: 'Please share your location with me:', url });
        return;
      } catch {
        // user cancelled – fall through to copy
      }
    }
    void copyText(url, 'Tracking link copied');
  };

  const handleLinkExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractTrackerId(linkInput);
    if (!id) {
      showToast('Enter a valid tracker ID or tracking link');
      return;
    }
    try {
      await claimTrackerInFirebase(id);
      setLinkInput('');
      setSelectedId(id);
      showToast('Tracker linked to your account');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not link tracker');
    }
  };

  const handleDelete = async (tracker: Tracker) => {
    if (!confirm(`Delete "${tracker.name}" and all of its location history? This cannot be undone.`)) return;
    try {
      await deleteTrackerAsync(tracker.id);
      if (selectedId === tracker.id) setSelectedId(null);
      showToast('Tracker deleted');
    } catch {
      showToast('Delete failed — check your Firestore rules');
    }
  };

  const handleClearHistory = async (tracker: Tracker) => {
    if (!confirm(`Clear all location history for "${tracker.name}"?`)) return;
    try {
      await clearTrackerHistoryInFirebase(tracker.id);
      showToast('History cleared');
    } catch {
      showToast('Could not clear history');
    }
  };

  const exportHistory = (format: 'csv' | 'json' | 'gpx') => {
    if (!selected || history.length === 0) return;
    const base = `${slugify(selected.name)}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'csv') download(`${base}.csv`, pointsToCSV(history), 'text/csv');
    else if (format === 'gpx') download(`${base}.gpx`, pointsToGPX(history, selected.name), 'application/gpx+xml');
    else
      download(
        `${base}.json`,
        JSON.stringify(
          { tracker: { id: selected.id, name: selected.name, created: selected.created, device: selected.device }, stats, points: history },
          null,
          2,
        ),
        'application/json',
      );
  };

  const enableAlerts = async () => {
    unlockAudio();
    const p = await requestNotificationPermission();
    setNotifPermission(p);
    if (p === 'granted') showToast('Alerts enabled');
  };

  const handleLogout = async () => {
    stopAlarm();
    await logout().catch(() => undefined);
    router.push('/login');
  };

  const selectTracker = (id: string) => {
    unlockAudio();
    setSelectedId((cur) => (cur === id ? null : id));
    setFitKey((k) => k + 1);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (authLoading || (loading && !permissionError)) {
    return (
      <div className="page-center">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  const historyNewestFirst = [...history].reverse();
  const selectedStatus = selected ? getTrackerStatus(selected, now) : null;

  return (
    <div className={styles.page} onPointerDown={unlockAudio}>
      <AppHeader
        userName={user?.displayName || user?.email || 'Guest'}
        onSignOut={handleLogout}
        actions={
          notifPermission !== 'granted' && notifPermission !== 'unsupported' ? (
            <button type="button" onClick={enableAlerts} className="btn btn-secondary btn-sm">
              <Bell size={15} aria-hidden="true" />
              <span className={styles.hideSm}>Enable alerts</span>
            </button>
          ) : null
        }
      />

      {sosTrackers.length > 0 && (
        <div className={styles.sosStack}>
          {sosTrackers.map((t) => (
            <div key={t.id} className={styles.sosBanner} role="alert">
              <div className={styles.sosIcon}>
                <Siren size={20} aria-hidden="true" />
              </div>
              <div className={styles.sosText}>
                <strong>SOS from {t.name}</strong>
                <span>
                  Sent {formatFixAge(t.sos?.triggeredAt, now)}
                  {typeof t.sos?.latitude === 'number' && typeof t.sos?.longitude === 'number'
                    ? ` · ${t.sos.latitude.toFixed(5)}, ${t.sos.longitude.toFixed(5)}`
                    : ' · location unavailable'}
                </span>
              </div>
              <div className={styles.sosActions}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setSelectedId(t.id);
                    setFitKey((k) => k + 1);
                  }}
                >
                  <Crosshair size={14} aria-hidden="true" /> Show on map
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMuted((m) => !m)}>
                  {muted ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
                  {muted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => acknowledgeSos(t.id).catch(() => showToast('Could not acknowledge'))}
                >
                  <Check size={14} aria-hidden="true" /> Acknowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <main className={styles.content}>
        <div className={styles.pageHead}>
          <div>
            <h1>Dashboard</h1>
            <p className="muted">Everyone sharing their location with you, in real time.</p>
          </div>
          <Link href="/download" className="btn btn-secondary btn-sm">
            <Smartphone size={14} aria-hidden="true" /> Get the app
          </Link>
        </div>

        <section className={styles.summary} aria-label="Overview">
          <SummaryCard icon={MapPin} label="Trackers" value={summary.total} />
          <SummaryCard icon={Activity} label="Live now" value={summary.live} tone="success" />
          <SummaryCard icon={Siren} label="SOS alerts" value={summary.sos} tone={summary.sos ? 'danger' : undefined} />
          <SummaryCard
            icon={BatteryLow}
            label="Low battery"
            value={summary.lowBattery}
            tone={summary.lowBattery ? 'warning' : undefined}
          />
        </section>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">New tracker</h2>
              </div>
              <div className="card-body">
                <form onSubmit={handleCreateTracker} className={styles.inlineForm}>
                  <label htmlFor="trackerName" className="sr-only">
                    Tracker name
                  </label>
                  <input
                    id="trackerName"
                    value={trackerName}
                    onChange={(e) => setTrackerName(e.target.value)}
                    placeholder="Name, e.g. Mum's phone"
                    maxLength={80}
                    className="input"
                  />
                  <button type="submit" className="btn" disabled={creating}>
                    <Plus size={16} aria-hidden="true" />
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </form>
                {generatedUrl && (
                  <div className={styles.generatedLink}>
                    <p className={styles.generatedTitle}>
                      <CheckCircle2 size={16} aria-hidden="true" /> Link ready — send it to the person who will share
                      their location.
                    </p>
                    <div className={styles.linkText}>{generatedUrl}</div>
                    <div className={styles.row}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => copyText(generatedUrl, 'Tracking link copied')}
                      >
                        <Copy size={14} aria-hidden="true" /> Copy
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => shareLink(generatedUrl, 'tracker')}>
                        <Share2 size={14} aria-hidden="true" /> Share
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setQr({ url: generatedUrl, title: 'New tracking link' })}
                      >
                        <QrCode size={14} aria-hidden="true" /> QR code
                      </button>
                    </div>
                  </div>
                )}
                <details className={`disclosure ${styles.linkExisting}`}>
                  <summary>
                    <Link2 size={14} aria-hidden="true" /> Add an existing tracker by ID or link
                  </summary>
                  <form onSubmit={handleLinkExisting} className={styles.inlineForm}>
                    <label htmlFor="linkInput" className="sr-only">
                      Tracker ID or link
                    </label>
                    <input
                      id="linkInput"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="track_… or tracking link"
                      className="input"
                    />
                    <button type="submit" className="btn btn-secondary">
                      Add
                    </button>
                  </form>
                </details>
              </div>
            </section>

            <section className={`card ${styles.listCard}`}>
              <div className="card-header">
                <h2 className="card-title">
                  Trackers <span className={styles.count}>{trackers.length}</span>
                </h2>
              </div>
              {trackers.length > 3 && (
                <div className={styles.searchWrap}>
                  <Search size={15} className={styles.searchIcon} aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, ID or device"
                    aria-label="Search trackers"
                    className={`input ${styles.search}`}
                  />
                </div>
              )}

              {permissionError ? (
                <div className={styles.emptyState}>
                  <AlertTriangle size={22} aria-hidden="true" />
                  <p>Couldn&apos;t load your trackers.</p>
                  <p className="muted">Deploy the latest firestore.rules (see FIREBASE_SETUP.md), then retry.</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRetryKey((k) => k + 1)}>
                    <RotateCw size={14} aria-hidden="true" /> Retry
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className={styles.emptyState}>
                  <MapPin size={22} aria-hidden="true" />
                  <p>{trackers.length === 0 ? 'No trackers yet' : 'No matches'}</p>
                  <p className="muted">
                    {trackers.length === 0
                      ? 'Create one above and send the link to the person you want to see.'
                      : 'Try a different search.'}
                  </p>
                </div>
              ) : (
                <ul className={styles.trackerList}>
                  {filtered.map((t) => {
                    const status = getTrackerStatus(t, now);
                    const battery = classifyBattery(t.battery?.level, t.battery?.charging);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`${styles.trackerItem} ${t.id === selectedId ? styles.selected : ''} ${status === 'sos' ? styles.sosItem : ''}`}
                          onClick={() => selectTracker(t.id)}
                          aria-pressed={t.id === selectedId}
                        >
                          <span className={`${styles.avatar} ${styles[`avatar_${status}`] ?? ''}`} aria-hidden="true">
                            {t.name.trim().charAt(0).toUpperCase() || '?'}
                          </span>
                          <span className={styles.trackerBody}>
                            <span className={styles.trackerTop}>
                              <span className={styles.trackerName}>{t.name}</span>
                              <StatusBadge status={status} />
                            </span>
                            <span className={styles.trackerMeta}>
                              <span>
                                <Clock size={12} aria-hidden="true" /> {formatFixAge(t.lastSeen, now)}
                              </span>
                              {t.battery && (
                                <span className={styles[`battery_${battery}`]}>
                                  {t.battery.charging ? (
                                    <BatteryCharging size={12} aria-hidden="true" />
                                  ) : (
                                    <Battery size={12} aria-hidden="true" />
                                  )}{' '}
                                  {Math.round(t.battery.level * 100)}%
                                </span>
                              )}
                              {t.device && (
                                <span>
                                  <Smartphone size={12} aria-hidden="true" /> {t.device.os}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>

          <section className={styles.main}>
            <div className={styles.mapCard}>
              <LiveMap
                markers={markers}
                trail={selected ? history : undefined}
                followId={selected?.id ?? null}
                fitKey={fitKey}
                onMarkerClick={(id) => setSelectedId(id)}
                height="min(58vh, 540px)"
              />
            </div>

            {selected && selectedStatus ? (
              <section className="card" aria-labelledby="detail-title">
                <div className={styles.detailHeader}>
                  <div className={styles.detailTitle}>
                    <div className={styles.titleRow}>
                      <h2 id="detail-title">{selected.name}</h2>
                      <StatusBadge status={selectedStatus} />
                    </div>
                    <button
                      type="button"
                      className={styles.trackerId}
                      onClick={() => copyText(selected.id, 'Tracker ID copied')}
                      title="Copy tracker ID"
                    >
                      {selected.id}
                      <Copy size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyText(linkFor(selected.id), 'Tracking link copied')}
                    >
                      <Copy size={14} aria-hidden="true" /> Copy link
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => shareLink(linkFor(selected.id), selected.name)}
                    >
                      <Share2 size={14} aria-hidden="true" /> Share
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setQr({ url: linkFor(selected.id), title: selected.name })}
                    >
                      <QrCode size={14} aria-hidden="true" /> QR code
                    </button>
                    {selected.lastLocation && (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`https://www.google.com/maps?q=${selected.lastLocation.latitude},${selected.lastLocation.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" /> Google Maps
                      </a>
                    )}
                  </div>
                </div>

                <div className={styles.tabs} role="tablist" aria-label="Tracker details">
                  {(
                    [
                      ['overview', 'Overview'],
                      ['messages', 'Messages'],
                      ['history', `History (${history.length})`],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      id={`tab-${id}`}
                      aria-selected={tab === id}
                      aria-controls={`panel-${id}`}
                      className={styles.tab}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="card-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                  {tab === 'overview' && (
                    <>
                      <div className={styles.statsGrid}>
                        <Stat label="Last seen" value={formatFixAge(selected.lastSeen, now)} />
                        <Stat
                          label="Accuracy"
                          value={selected.lastLocation ? `±${Math.round(selected.lastLocation.accuracy)} m` : '—'}
                        />
                        <Stat
                          label="Battery"
                          value={
                            selected.battery
                              ? `${Math.round(selected.battery.level * 100)}%${selected.battery.charging ? ' · charging' : ''}`
                              : '—'
                          }
                        />
                        <Stat label="Motion" value={selected.motion ? capitalize(selected.motion) : '—'} />
                        <Stat label="Distance" value={formatDistance(stats.distanceMeters)} />
                        <Stat label="Duration" value={formatDuration(stats.durationMs)} />
                        <Stat label="Avg speed" value={`${stats.avgSpeedKmh.toFixed(1)} km/h`} />
                        <Stat label="Max speed" value={`${stats.maxSpeedKmh.toFixed(1)} km/h`} />
                      </div>

                      <h3 className={styles.sectionTitle}>Device</h3>
                      <dl className={styles.dl}>
                        <dt>Device</dt>
                        <dd>{selected.device ? `${selected.device.os} · ${selected.device.browser}` : '—'}</dd>
                        <dt>Screen</dt>
                        <dd>{selected.device?.screen ?? '—'}</dd>
                        <dt>IP address</dt>
                        <dd className="mono">{selected.ip ?? '—'}</dd>
                        <dt>Created</dt>
                        <dd>{new Date(selected.created).toLocaleDateString()}</dd>
                      </dl>

                      <h3 className={styles.sectionTitle}>Data</h3>
                      <div className={styles.dataRow}>
                        <div className={styles.row}>
                          <span className="muted">Export {history.length} points</span>
                          {(['csv', 'json', 'gpx'] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={!history.length}
                              onClick={() => exportHistory(f)}
                            >
                              <Download size={14} aria-hidden="true" /> {f.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <div className={styles.row}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleClearHistory(selected)}>
                            <Eraser size={14} aria-hidden="true" /> Clear history
                          </button>
                          <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(selected)}>
                            <Trash2 size={14} aria-hidden="true" /> Delete tracker
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {tab === 'messages' && (
                    <ChatPanel
                      trackingId={selected.id}
                      role="owner"
                      senderName={user?.displayName || 'Owner'}
                      onIncoming={(m) => notify(`💬 ${selected.name}`, m.text, `chat-${selected.id}`)}
                    />
                  )}

                  {tab === 'history' && (
                    <>
                      {pointsError && <p className="muted">History unavailable — deploy the latest firestore.rules.</p>}
                      {history.length === 0 ? (
                        <div className={styles.emptyState}>
                          <Route size={22} aria-hidden="true" />
                          <p>No locations yet</p>
                          <p className="muted">Share the tracking link to start receiving updates.</p>
                        </div>
                      ) : (
                        <>
                          <div className={styles.tableWrap}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th scope="col">Time</th>
                                  <th scope="col">Latitude</th>
                                  <th scope="col">Longitude</th>
                                  <th scope="col">Accuracy</th>
                                  <th scope="col">Speed</th>
                                  <th scope="col">
                                    <span className="sr-only">Map</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {historyNewestFirst.slice(0, historyShown).map((p) => (
                                  <tr key={`${p.timestamp}-${p.latitude}-${p.longitude}`}>
                                    <td>{new Date(p.timestamp).toLocaleString()}</td>
                                    <td className="mono">{p.latitude.toFixed(6)}</td>
                                    <td className="mono">{p.longitude.toFixed(6)}</td>
                                    <td>±{Math.round(p.accuracy)} m</td>
                                    <td>{typeof p.speed === 'number' ? `${(p.speed * 3.6).toFixed(1)} km/h` : '—'}</td>
                                    <td>
                                      <a
                                        href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.mapLink}
                                      >
                                        Map <ExternalLink size={12} aria-hidden="true" />
                                      </a>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {historyShown < history.length && (
                            <button
                              type="button"
                              className={`btn btn-secondary btn-sm ${styles.more}`}
                              onClick={() => setHistoryShown((n) => n + HISTORY_PAGE)}
                            >
                              Show more ({history.length - historyShown} remaining)
                            </button>
                          )}
                          {points.length >= TRACKING_CONFIG.historyLimit && (
                            <p className="muted">Showing the latest {TRACKING_CONFIG.historyLimit} points.</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </section>
            ) : (
              <section className={`card ${styles.emptyState} ${styles.selectHint}`}>
                <MousePointerClick size={22} aria-hidden="true" />
                <p>Select a tracker</p>
                <p className="muted">See its trail, statistics, messages and history.</p>
              </section>
            )}
          </section>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {qr && <QrCodeDialog url={qr.url} title={qr.title} onClose={() => setQr(null)} />}
    </div>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={`card ${styles.summaryCard} ${tone ? styles[`tone_${tone}`] : ''}`}>
      <span className={styles.summaryIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div>
        <div className={styles.summaryValue}>{value}</div>
        <div className={styles.summaryLabel}>{label}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
