import type { TrackerLiveStatus } from '@/lib/tracker-status';
import { STATUS_LABEL } from '@/lib/tracker-status';

const VARIANT: Record<TrackerLiveStatus, string> = {
  live: 'badge-success',
  sos: 'badge-danger',
  paused: 'badge-warning',
  stopped: '',
  offline: '',
  waiting: 'badge-accent',
};

/** Coloured status pill for a tracker. */
export default function StatusBadge({ status }: { status: TrackerLiveStatus }) {
  return <span className={`badge badge-dot ${VARIANT[status]}`}>{STATUS_LABEL[status]}</span>;
}
