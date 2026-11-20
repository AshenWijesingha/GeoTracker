import styles from './Brand.module.css';

/** GeoTracker logo mark + wordmark. */
export default function Brand({ size = 28, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <span className={styles.brand}>
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="var(--accent)" />
        <path
          d="M256 104c-66 0-118 52-118 117 0 88 118 199 118 199s118-111 118-199c0-65-52-117-118-117z"
          fill="#fff"
        />
        <circle cx="256" cy="222" r="46" fill="var(--accent)" />
      </svg>
      {showName && <span className={styles.name}>GeoTracker</span>}
    </span>
  );
}
