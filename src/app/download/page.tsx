'use client';

// "Get the app" page: device-aware download of the Android APK (published with
// the site by deploy.yml), home-screen instructions for iPhone, a QR code for
// opening this page on a phone, and a short setup guide.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ExternalLink,
  LayoutDashboard,
  MonitorSmartphone,
  PlusSquare,
  QrCode,
  ScanLine,
  Share,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import Brand from '@/components/ui/Brand';
import ThemeToggle from '@/components/ui/ThemeToggle';
import QrImage from '@/components/ui/QrImage';
import { APK_INFO_PATH, APK_PATH, appBaseUrl, REPO_URL, withBasePath } from '@/lib/paths';
import { usePlatform } from '@/lib/platform';
import styles from './page.module.css';

interface ApkInfo {
  version: string;
  build: number;
  sizeBytes: number;
  sha256: string;
  builtAt: string;
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DownloadPage() {
  const platform = usePlatform();
  const [info, setInfo] = useState<ApkInfo | null>(null);
  const [infoState, setInfoState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    setPageUrl(`${appBaseUrl()}/download/`);
    fetch(withBasePath(APK_INFO_PATH), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ApkInfo) => {
        setInfo(data);
        setInfoState('ok');
      })
      .catch(() => setInfoState('missing'));
  }, []);

  const apkUrl = withBasePath(APK_PATH);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard" aria-label="GeoTracker dashboard" className={styles.brand}>
          <Brand />
        </Link>
        <div className={styles.topActions}>
          <ThemeToggle />
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            <LayoutDashboard size={14} aria-hidden="true" /> Dashboard
          </Link>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.hero}>
          <h1>Get GeoTracker on your phone</h1>
          <p>
            Install the Android app to share location all the time, or use any phone&apos;s browser while the page is open —
            no install needed.
          </p>
        </section>

        <div className={styles.grid}>
          {/* Android */}
          <section className={`card ${styles.option} ${platform === 'android' ? styles.recommended : ''}`}>
            {platform === 'android' && <span className={`badge badge-accent ${styles.flag}`}>Recommended for this phone</span>}
            <div className={styles.optionHead}>
              <span className={styles.optionIcon} aria-hidden="true">
                <Smartphone size={20} />
              </span>
              <div>
                <h2>Android app</h2>
                <p className="muted">Shares all the time — in the background and after restarts. Android 8 or newer.</p>
              </div>
            </div>

            <a href={apkUrl} download="GeoTracker.apk" className="btn btn-lg btn-block">
              <Download size={18} aria-hidden="true" /> Download APK
            </a>
            <p className={styles.meta}>
              {infoState === 'ok' && info
                ? `Version ${info.version} (build ${info.build}) · ${formatSize(info.sizeBytes)} · updated ${new Date(info.builtAt).toLocaleDateString()}`
                : infoState === 'loading'
                  ? 'Checking latest version…'
                  : 'Latest build'}
            </p>
            {infoState === 'missing' && (
              <div className="status warning">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  If the download doesn&apos;t start, get the APK from the{' '}
                  <a href={`${REPO_URL}/actions/workflows/android.yml`} target="_blank" rel="noopener noreferrer">
                    latest Android build
                  </a>
                  .
                </span>
              </div>
            )}

            <ol className={styles.steps}>
              <li>
                <strong>Download</strong> the APK on the Android phone.
              </li>
              <li>
                <strong>Open</strong> the downloaded file. If asked, allow your browser to install apps.
              </li>
              <li>
                <strong>Install.</strong> If Play Protect warns about an unknown app, choose <em>Install anyway</em> — the
                app isn&apos;t on the Play Store.
              </li>
              <li>
                <strong>Turn sharing on</strong> and, when asked, set location to <em>Allow all the time</em> and allow it
                to run without battery restrictions. Sharing then stays on until it&apos;s stopped in the app.
              </li>
            </ol>

            {info?.sha256 && (
              <details className={`disclosure ${styles.checksum}`}>
                <summary>
                  <ShieldCheck size={14} aria-hidden="true" /> Verify the download (SHA-256)
                </summary>
                <code>{info.sha256}</code>
              </details>
            )}
          </section>

          {/* iPhone & other phones */}
          <section className={`card ${styles.option} ${platform === 'ios' ? styles.recommended : ''}`}>
            {platform === 'ios' && <span className={`badge badge-accent ${styles.flag}`}>Recommended for this phone</span>}
            <div className={styles.optionHead}>
              <span className={styles.optionIcon} aria-hidden="true">
                <MonitorSmartphone size={20} />
              </span>
              <div>
                <h2>iPhone and other devices</h2>
                <p className="muted">Works in Safari, Chrome and any modern browser.</p>
              </div>
            </div>
            <ol className={styles.steps}>
              <li>
                <strong>Open the tracking link</strong> you were sent (or scan its QR code with the camera).
              </li>
              <li>
                Tap <Share size={14} className={styles.inlineIcon} aria-label="Share" /> <strong>Share</strong>, then{' '}
                <PlusSquare size={14} className={styles.inlineIcon} aria-hidden="true" /> <strong>Add to Home Screen</strong>{' '}
                to keep GeoTracker one tap away.
              </li>
              <li>
                Tap <strong>Start sharing</strong> and keep the page open. Browsers pause location when the screen is off,
                so turn on <em>Keep screen awake</em>.
              </li>
            </ol>
          </section>

          {/* Desktop: scan to open on phone */}
          {platform !== 'android' && platform !== 'ios' && (
            <section className={`card ${styles.option} ${styles.scan}`}>
              <div className={styles.optionHead}>
                <span className={styles.optionIcon} aria-hidden="true">
                  <QrCode size={20} />
                </span>
                <div>
                  <h2>On a computer?</h2>
                  <p className="muted">Scan with your phone&apos;s camera to open this page there.</p>
                </div>
              </div>
              {pageUrl && <QrImage value={pageUrl} label={`QR code for ${pageUrl}`} className={styles.qr} />}
              <p className={styles.url}>{pageUrl}</p>
            </section>
          )}
        </div>

        <section className={styles.setup} aria-labelledby="setup-title">
          <h2 id="setup-title">Set up in three steps</h2>
          <ol className={styles.setupSteps}>
            <li className="card">
              <span className={styles.stepNum}>1</span>
              <LayoutDashboard size={20} aria-hidden="true" className={styles.stepIcon} />
              <h3>Create a tracker</h3>
              <p className="muted">
                On the <Link href="/dashboard">dashboard</Link>, give it a name such as &quot;Mum&apos;s phone&quot; and
                press <strong>Create</strong>.
              </p>
            </li>
            <li className="card">
              <span className={styles.stepNum}>2</span>
              <ScanLine size={20} aria-hidden="true" className={styles.stepIcon} />
              <h3>Connect the phone</h3>
              <p className="muted">
                In the app tap <strong>Scan QR code</strong> and scan the tracker&apos;s <strong>QR code</strong> from the
                dashboard. Without the app, just open the tracking link on the phone.
              </p>
            </li>
            <li className="card">
              <span className={styles.stepNum}>3</span>
              <ShieldCheck size={20} aria-hidden="true" className={styles.stepIcon} />
              <h3>Start sharing</h3>
              <p className="muted">
                The person taps <strong>Start</strong> and agrees. Their location appears on your dashboard within
                seconds. Turn on <strong>Enable alerts</strong> for SOS and low-battery warnings.
              </p>
            </li>
          </ol>
          <div className={styles.setupFoot}>
            <Link href="/dashboard" className="btn">
              Go to dashboard <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href={`${REPO_URL}#readme`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Host your own copy <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
