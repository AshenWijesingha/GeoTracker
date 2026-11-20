'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/lib/theme';
import styles from './ThemeToggle.module.css';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/** Segmented Light / Dark / System switch. */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className={styles.group} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          title={`${label} theme`}
          className={styles.option}
          onClick={() => setPreference(value)}
        >
          <Icon size={15} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
