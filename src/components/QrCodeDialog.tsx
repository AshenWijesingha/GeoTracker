'use client';

// Shows a link as a QR code so it can be opened on another phone by pointing
// its camera at the screen, or scanned by the GeoTracker Android app to pair
// it with a tracker. The QR code is rendered locally (no third-party service
// ever sees the link) and can be downloaded as a PNG or printed.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';
import styles from './QrCodeDialog.module.css';

interface Props {
  url: string;
  title?: string;
  hint?: string;
  onClose: () => void;
}

const DEFAULT_HINT =
  'Scan with a phone camera to open the link, or with the GeoTracker Android app to pair the device.';

export default function QrCodeDialog({ url, title = 'Tracking link', hint = DEFAULT_HINT, onClose }: Props) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setError('Could not create a QR code for this link.'));
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 1024 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `geotracker-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'link'}-qr.png`;
      a.click();
    } catch {
      setError('Could not save the QR code.');
    }
  };

  // Print just the QR code and link, in a window of their own.
  const print = () => {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) {
      setError('Allow pop-ups to print the QR code.');
      return;
    }
    const escape = (text: string) =>
      text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    win.document.write(
      `<!doctype html><title>${escape(title)}</title>` +
        '<body style="font-family:sans-serif;text-align:center;padding:24px">' +
        `<h2>${escape(title)}</h2><div style="width:320px;margin:0 auto">${svg}</div>` +
        `<p style="font-family:monospace;font-size:11px;word-break:break-all">${escape(url)}</p></body>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="qr-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.hint}>{hint}</p>
        {error ? (
          <div className="status error" role="alert">
            {error}
          </div>
        ) : svg ? (
          <div
            className={styles.qr}
            role="img"
            aria-label={`QR code for ${url}`}
            // Markup is generated locally by the qrcode library from the URL.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="spinner" />
        )}
        <div className={styles.url}>{url}</div>
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={download} disabled={!svg}>
            <Download size={14} aria-hidden="true" /> Save PNG
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={print} disabled={!svg}>
            <Printer size={14} aria-hidden="true" /> Print
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose} ref={closeRef}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
