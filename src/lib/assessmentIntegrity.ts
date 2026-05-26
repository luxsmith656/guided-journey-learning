export type AssessmentIntegrityLevel =
  | 'open_practice'
  | 'light_protection'
  | 'standard_protection'
  | 'strict_exam_mode';

export type LegacyIntegrityLevel = 'basic' | 'advanced';
export type AssessmentIntegrityInput = AssessmentIntegrityLevel | LegacyIntegrityLevel | null | undefined;

export type AssessmentEndReason = 'submitted' | 'time_expired' | 'warnings' | 'idle' | 'offline';

export type AssessmentAttemptState =
  | 'instructions'
  | 'in_progress'
  | 'warning_blocked'
  | 'offline_buffering'
  | 'auto_submitting'
  | 'submitted'
  | 'auto_submitted_time_expired'
  | 'auto_submitted_warnings'
  | 'auto_submitted_idle'
  | 'auto_submitted_offline'
  | 'flagged_for_review'
  | 'voided_by_admin';

export interface AssessmentWarningLog {
  type: string;
  message: string;
  createdAtMillis: number;
  count: number;
}

export interface AssessmentIntegrityPolicy {
  level: AssessmentIntegrityLevel;
  label: string;
  warningLimit: number;
  idleWarningMs: number;
  idleStopMs: number;
  offlineStopMs: number;
  refreshWarningLimit: number;
  blocksTabSwitch: boolean;
  blocksClipboard: boolean;
  blocksContextMenu: boolean;
  requiresFullscreen: boolean;
  locksAiDuringAttempt: boolean;
  autoSubmitOnWarningLimit: boolean;
}

const minutes = (value: number) => value * 60 * 1000;

const policies: Record<AssessmentIntegrityLevel, AssessmentIntegrityPolicy> = {
  open_practice: {
    level: 'open_practice',
    label: 'Open Practice',
    warningLimit: 999,
    idleWarningMs: minutes(8),
    idleStopMs: minutes(30),
    offlineStopMs: minutes(30),
    refreshWarningLimit: 999,
    blocksTabSwitch: false,
    blocksClipboard: false,
    blocksContextMenu: false,
    requiresFullscreen: false,
    locksAiDuringAttempt: false,
    autoSubmitOnWarningLimit: false,
  },
  light_protection: {
    level: 'light_protection',
    label: 'Light Protection',
    warningLimit: 5,
    idleWarningMs: minutes(5),
    idleStopMs: minutes(15),
    offlineStopMs: minutes(15),
    refreshWarningLimit: 8,
    blocksTabSwitch: true,
    blocksClipboard: true,
    blocksContextMenu: true,
    requiresFullscreen: false,
    locksAiDuringAttempt: true,
    autoSubmitOnWarningLimit: false,
  },
  standard_protection: {
    level: 'standard_protection',
    label: 'Standard Protection',
    warningLimit: 3,
    idleWarningMs: minutes(3),
    idleStopMs: minutes(10),
    offlineStopMs: minutes(10),
    refreshWarningLimit: 5,
    blocksTabSwitch: true,
    blocksClipboard: true,
    blocksContextMenu: true,
    requiresFullscreen: false,
    locksAiDuringAttempt: true,
    autoSubmitOnWarningLimit: true,
  },
  strict_exam_mode: {
    level: 'strict_exam_mode',
    label: 'Strict Exam Mode',
    warningLimit: 3,
    idleWarningMs: minutes(3),
    idleStopMs: minutes(10),
    offlineStopMs: minutes(10),
    refreshWarningLimit: 5,
    blocksTabSwitch: true,
    blocksClipboard: true,
    blocksContextMenu: true,
    requiresFullscreen: true,
    locksAiDuringAttempt: true,
    autoSubmitOnWarningLimit: true,
  },
};

export const normalizeIntegrityLevel = (level: AssessmentIntegrityInput): AssessmentIntegrityLevel => {
  if (level === 'basic') return 'light_protection';
  if (level === 'advanced') return 'standard_protection';
  if (level && level in policies) return level as AssessmentIntegrityLevel;
  return 'standard_protection';
};

export const getIntegrityPolicy = (level: AssessmentIntegrityInput): AssessmentIntegrityPolicy => (
  policies[normalizeIntegrityLevel(level)]
);

export const createIntegrityWarning = (
  type: string,
  message: string,
  count: number,
): AssessmentWarningLog => ({
  type,
  message,
  count,
  createdAtMillis: Date.now(),
});

export const shouldAutoSubmitForWarning = (
  count: number,
  policy: AssessmentIntegrityPolicy,
) => policy.autoSubmitOnWarningLimit && count >= policy.warningLimit;

export const getAttemptStatus = (reason: AssessmentEndReason): AssessmentAttemptState => {
  if (reason === 'time_expired') return 'auto_submitted_time_expired';
  if (reason === 'warnings') return 'auto_submitted_warnings';
  if (reason === 'idle') return 'auto_submitted_idle';
  if (reason === 'offline') return 'auto_submitted_offline';
  return 'submitted';
};
