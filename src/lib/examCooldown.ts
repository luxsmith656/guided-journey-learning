export interface ExamAttemptCooldownInput {
  id?: string;
  type?: string;
  assessmentMode?: string;
  scorePercent?: number;
  status?: string;
  endedReason?: string;
  flaggedForReview?: boolean;
  submittedAt?: any;
  updatedAt?: any;
  startedAt?: any;
  submittedAtMillis?: number;
  updatedAtMillis?: number;
  startedAtMillis?: number;
  expiresAtMillis?: number;
}

export interface ExamCooldown {
  lockedUntilMillis: number;
  reason: 'repeated_integrity_stops' | 'repeated_low_scores';
  message: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const SHORT_PERIOD_MS = 24 * ONE_HOUR_MS;

export function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return Number(value.seconds) * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function attemptTime(attempt: ExamAttemptCooldownInput) {
  return toMillis(attempt.submittedAtMillis) ||
    toMillis(attempt.submittedAt) ||
    toMillis(attempt.updatedAtMillis) ||
    toMillis(attempt.updatedAt) ||
    toMillis(attempt.expiresAtMillis) ||
    toMillis(attempt.startedAtMillis) ||
    toMillis(attempt.startedAt);
}

function isFullMock(attempt: ExamAttemptCooldownInput) {
  return attempt.type === 'mock_exam' || attempt.assessmentMode === 'full_mock';
}

function isForcedStop(attempt: ExamAttemptCooldownInput) {
  return Boolean(attempt.flaggedForReview) ||
    ['warnings', 'idle', 'offline'].includes(String(attempt.endedReason || '')) ||
    ['auto_submitted_warnings', 'auto_submitted_idle', 'auto_submitted_offline', 'flagged_for_review'].includes(String(attempt.status || ''));
}

export function calculateFullMockCooldown(
  attempts: ExamAttemptCooldownInput[],
  now = Date.now(),
): ExamCooldown | null {
  const fullMocks = attempts
    .filter(isFullMock)
    .map((attempt) => ({ ...attempt, endedAtMillis: attemptTime(attempt) }))
    .filter((attempt) => attempt.endedAtMillis > 0)
    .sort((a, b) => b.endedAtMillis - a.endedAtMillis);

  const recentForcedStops = fullMocks.filter((attempt) => (
    isForcedStop(attempt) &&
    now - attempt.endedAtMillis <= SHORT_PERIOD_MS
  ));

  if (recentForcedStops.length >= 5) {
    const lockedUntilMillis = recentForcedStops[0].endedAtMillis + ONE_HOUR_MS;
    if (lockedUntilMillis > now) {
      return {
        lockedUntilMillis,
        reason: 'repeated_integrity_stops',
        message: 'Full mock access is paused after repeated interrupted or flagged attempts. Review first, then try again.',
      };
    }
  }

  const scoredMocks = fullMocks.filter((attempt) => Number.isFinite(Number(attempt.scorePercent)));
  const latestFive = scoredMocks.slice(0, 5);
  if (latestFive.length === 5 && latestFive.every((attempt) => Number(attempt.scorePercent) <= 60)) {
    const lockedUntilMillis = latestFive[0].endedAtMillis + ONE_HOUR_MS;
    if (lockedUntilMillis > now) {
      return {
        lockedUntilMillis,
        reason: 'repeated_low_scores',
        message: 'Full mock access is paused after five low-score simulations. Use reviewers, rationalizations, and the mistake bank before retrying.',
      };
    }
  }

  return null;
}
