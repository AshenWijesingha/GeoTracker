'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** A QR code for `value`, rendered locally as SVG (nothing is sent to a QR service). */
export default function QrImage({ value, label, className }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(''));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      // Markup is generated locally by the qrcode library.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
