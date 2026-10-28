/** Shared labels and colours for suit statuses. */
import type { DiagnosticStatus, RepairStatus } from '../types/jarvis';

export const REPAIR_LABELS: Record<RepairStatus, string> = {
  operational: 'Operational',
  repairing: 'Under repair',
  damaged: 'Damaged',
  offline: 'Offline',
};

export const DIAGNOSTIC_LABELS: Record<DiagnosticStatus, string> = {
  nominal: 'Nominal',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

export const REPAIR_COLORS: Record<RepairStatus, string> = {
  operational: 'var(--color-ok)',
  repairing: 'var(--color-arc-bright)',
  damaged: 'var(--color-crit)',
  offline: 'var(--color-haze)',
};

export const DIAGNOSTIC_COLORS: Record<DiagnosticStatus, string> = {
  nominal: 'var(--color-ok)',
  warning: 'var(--color-warn)',
  critical: 'var(--color-crit)',
  unknown: 'var(--color-haze)',
};
