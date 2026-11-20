'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
import { getTrackerStatus, mergeHistory, STATUS_LABEL, type TrackerLiveStatus } from '@/lib/tracker-status';
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

function statusClass(status: TrackerLiveStatus) {
  return styles[`status_${status}`] ?? '';
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
          t.battery ? ` · 🔋${Math.round(t.battery.level * 100)}%` : ''
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
      <div className={styles.dashboardBg}>
        <div className={styles.center}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  const historyNewestFirst = [...history].reverse();

  return (
    <div className={styles.dashboardBg} onPointerDown={unlockAudio}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1>🎯 Command Center</h1>
            <p className={styles.subtitle}>Real-time tracking dashboard</p>
          </div>
          <nav className={styles.headerActions} aria-label="Main">
            <span className={styles.userInfo}>👤 {user?.displayName || user?.email || 'Guest'}</span>
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
              <button type="button" onClick={enableAlerts} className={styles.navLink}>
                🔔 Enable alerts
              </button>
            )}
            <Link href="/tracker" className={styles.navLink}>
              📡 Quick Track
            </Link>
            <Link href="/users" className={styles.navLink}>
              👥 Users
            </Link>
            <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
              ⏻ Sign out
            </button>
          </nav>
        </div>
      </header>

      {sosTrackers.map((t) => (
        <div key={t.id} className={styles.sosBanner} role="alert">
          <div>
            <strong>🚨 SOS — {t.name}</strong>
            <span>
              {' '}
              triggered {formatFixAge(t.sos?.triggeredAt, now)}
              {typeof t.sos?.latitude === 'number' && typeof t.sos?.longitude === 'number'
                ? ` at ${t.sos.latitude.toFixed(5)}, ${t.sos.longitude.toFixed(5)}`
                : ' (location unavailable)'}
            </span>
          </div>
          <div className={styles.sosActions}>
            <button type="button" onClick={() => { setSelectedId(t.id); setFitKey((k) => k + 1); }}>
              Show on map
            </button>
            <button type="button" onClick={() => setMuted((m) => !m)}>{muted ? '🔈 Unmute' : '🔇 Mute'}</button>
            <button type="button" className={styles.ackBtn} onClick={() => acknowledgeSos(t.id).catch(() => showToast('Could not acknowledge'))}>
              Acknowledge
            </button>
          </div>
        </div>
      ))}

      <section className={styles.summary} aria-label="Overview">
        <SummaryCard label="Trackers" value={summary.total} />
        <SummaryCard label="Live now" value={summary.live} tone="ok" />
        <SummaryCard label="SOS" value={summary.sos} tone={summary.sos ? 'danger' : undefined} />
        <SummaryCard label="Low battery" value={summary.lowBattery} tone={summary.lowBattery ? 'warning' : undefined} />
      </section>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <section className={styles.card}>
            <h2>New tracker</h2>
            <form onSubmit={handleCreateTracker} className={styles.inlineForm}>
              <label htmlFor="trackerName" className="sr-only">Tracker name</label>
              <input
                id="trackerName"
                value={trackerName}
                onChange={(e) => setTrackerName(e.target.value)}
                placeholder="e.g. Family trip, Delivery van"
                maxLength={80}
                className={styles.input}
              />
              <button type="submit" className="btn" disabled={creating}>
                {creating ? '…' : 'Create'}
              </button>
            </form>
            {generatedUrl && (
              <div className={styles.generatedLink}>
                <p>✓ Link ready — send it to the person who will share their location:</p>
                <div className={styles.linkText}>{generatedUrl}</div>
                <div className={styles.row}>
                  <button type="button" className="btn btn-secondary" onClick={() => copyText(generatedUrl, 'Tracking link copied')}>
                    📋 Copy
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => shareLink(generatedUrl, 'tracker')}>
                    📤 Share
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setQr({ url: generatedUrl, title: 'New tracking link' })}>
                    ▦ QR code
                  </button>
                </div>
              </div>
            )}
            <details className={styles.linkExisting}>
              <summary>Link an existing tracker (Quick Track ID or link)</summary>
              <form onSubmit={handleLinkExisting} className={styles.inlineForm}>
                <label htmlFor="linkInput" className="sr-only">Tracker ID or link</label>
                <input
                  id="linkInput"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="track_… or https://…/track/?id=…"
                  className={styles.input}
                />
                <button type="submit" className="btn btn-secondary">Link</button>
              </form>
            </details>
          </section>

          <section className={styles.card}>
            <div className={styles.listHeader}>
              <h2>Trackers ({trackers.length})</h2>
              {trackers.length > 3 && (
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search trackers"
                  className={`${styles.input} ${styles.search}`}
                />
              )}
            </div>

            {permissionError ? (
              <div className={styles.emptyState}>
                <p>⚠️ Unable to read trackers: insufficient permissions.</p>
                <p className={styles.muted}>Deploy the latest firestore.rules (see FIREBASE_SETUP.md).</p>
                <button type="button" className="btn" onClick={() => setRetryKey((k) => k + 1)}>🔄 Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <p>{trackers.length === 0 ? '📡 No trackers yet. Create your first one above.' : 'No trackers match your search.'}</p>
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
                        <div className={styles.trackerTop}>
                          <span className={styles.trackerName}>{t.name}</span>
                          <span className={`${styles.statusPill} ${statusClass(status)}`}>{STATUS_LABEL[status]}</span>
                        </div>
                        <div className={styles.trackerMeta}>
                          <span>⏱ {formatFixAge(t.lastSeen, now)}</span>
                          <span>📍 {t.locationCount ?? 0}</span>
                          {t.battery && (
                            <span className={styles[`battery_${battery}`]}>
                              🔋 {Math.round(t.battery.level * 100)}%{t.battery.charging ? '⚡' : ''}
                            </span>
                          )}
                          {t.device && <span>💻 {t.device.os}</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>

        <main className={styles.main}>
          <LiveMap
            markers={markers}
            trail={selected ? history : undefined}
            followId={selected?.id ?? null}
            fitKey={fitKey}
            onMarkerClick={(id) => setSelectedId(id)}
            height="min(60vh, 520px)"
          />

          {selected ? (
            <section className={styles.card} aria-labelledby="detail-title">
              <div className={styles.detailHeader}>
                <div>
                  <h2 id="detail-title">{selected.name}</h2>
                  <div className={styles.trackerId}>ID: {selected.id}</div>
                </div>
                <span className={`${styles.statusPill} ${statusClass(getTrackerStatus(selected, now))}`}>
                  {STATUS_LABEL[getTrackerStatus(selected, now)]}
                </span>
              </div>

              <div className={styles.statsGrid}>
                <Stat label="Last seen" value={formatFixAge(selected.lastSeen, now)} />
                <Stat label="Accuracy" value={selected.lastLocation ? `±${Math.round(selected.lastLocation.accuracy)} m` : '—'} />
                <Stat
                  label="Battery"
                  value={selected.battery ? `${Math.round(selected.battery.level * 100)}%${selected.battery.charging ? ' ⚡' : ''}` : 'N/A'}
                />
                <Stat label="Motion" value={selected.motion ?? '—'} />
                <Stat label="Distance" value={formatDistance(stats.distanceMeters)} />
                <Stat label="Duration" value={formatDuration(stats.durationMs)} />
                <Stat label="Avg speed" value={`${stats.avgSpeedKmh.toFixed(1)} km/h`} />
                <Stat label="Max speed" value={`${stats.maxSpeedKmh.toFixed(1)} km/h`} />
                <Stat label="Device" value={selected.device ? `${selected.device.os} · ${selected.device.browser}` : '—'} />
                <Stat label="Screen" value={selected.device?.screen ?? '—'} />
                <Stat label="IP address" value={selected.ip ?? '—'} />
                <Stat label="Created" value={new Date(selected.created).toLocaleDateString()} />
              </div>

              <div className={styles.row}>
                <button type="button" className="btn btn-secondary" onClick={() => copyText(linkFor(selected.id), 'Tracking link copied')}>
                  📋 Copy link
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => shareLink(linkFor(selected.id), selected.name)}>
                  📤 Share
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setQr({ url: linkFor(selected.id), title: selected.name })}>
                  ▦ QR code
                </button>
                {selected.lastLocation && (
                  <a
                    className="btn btn-success"
                    href={`https://www.google.com/maps?q=${selected.lastLocation.latitude},${selected.lastLocation.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🗺️ Google Maps
                  </a>
                )}
              </div>

              <div className={styles.row}>
                <span className={styles.muted}>Export {history.length} points:</span>
                <button type="button" className={styles.smallBtn} disabled={!history.length} onClick={() => exportHistory('csv')}>CSV</button>
                <button type="button" className={styles.smallBtn} disabled={!history.length} onClick={() => exportHistory('json')}>JSON</button>
                <button type="button" className={styles.smallBtn} disabled={!history.length} onClick={() => exportHistory('gpx')}>GPX</button>
                <span className={styles.spacer} />
                <button type="button" className={styles.smallBtn} onClick={() => handleClearHistory(selected)}>Clear history</button>
                <button type="button" className={`${styles.smallBtn} ${styles.danger}`} onClick={() => handleDelete(selected)}>Delete</button>
              </div>

              <h3 className={styles.sectionTitle}>💬 Messages</h3>
              <ChatPanel
                trackingId={selected.id}
                role="owner"
                senderName={user?.displayName || 'Owner'}
                onIncoming={(m) => notify(`💬 ${selected.name}`, m.text, `chat-${selected.id}`)}
              />

              <h3 className={styles.sectionTitle}>📋 Location history</h3>
              {pointsError && <p className={styles.muted}>History unavailable — deploy the latest firestore.rules.</p>}
              {history.length === 0 ? (
                <p className={styles.muted}>No locations yet. Share the tracking link to start receiving updates.</p>
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
                          <th scope="col"><span className="sr-only">Map</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyNewestFirst.slice(0, historyShown).map((p) => (
                          <tr key={`${p.timestamp}-${p.latitude}-${p.longitude}`}>
                            <td>{new Date(p.timestamp).toLocaleString()}</td>
                            <td>{p.latitude.toFixed(6)}</td>
                            <td>{p.longitude.toFixed(6)}</td>
                            <td>±{Math.round(p.accuracy)} m</td>
                            <td>{typeof p.speed === 'number' ? `${(p.speed * 3.6).toFixed(1)} km/h` : '—'}</td>
                            <td>
                              <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noopener noreferrer">
                                Map ↗
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {historyShown < history.length && (
                    <button type="button" className={styles.smallBtn} onClick={() => setHistoryShown((n) => n + HISTORY_PAGE)}>
                      Show more ({history.length - historyShown} remaining)
                    </button>
                  )}
                  {points.length >= TRACKING_CONFIG.historyLimit && (
                    <p className={styles.muted}>Showing the latest {TRACKING_CONFIG.historyLimit} points.</p>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className={`${styles.card} ${styles.emptyState}`}>
              <p>Select a tracker to see its trail, statistics, chat and history.</p>
            </section>
          )}
        </main>
      </div>

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}

      {qr && <QrCodeDialog url={qr.url} title={qr.title} onClose={() => setQr(null)} />}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warning' | 'danger' }) {
  return (
    <div className={`${styles.summaryCard} ${tone ? styles[`tone_${tone}`] : ''}`}>
      <div className={styles.summaryValue}>{value}</div>
      <div className={styles.summaryLabel}>{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}
