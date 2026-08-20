import type { RoundRecord, SessionRecord } from './types'

export const DEFAULT_DURATION_SECONDS = 5 * 60
export const MIN_DURATION_SECONDS = 60
export const MAX_DURATION_SECONDS = 60 * 60

export function normalizeTrainingDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION_SECONDS
  return Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, Math.round(seconds)))
}

export function summarizeSession(sessionId: string, rounds: RoundRecord[]): SessionRecord {
  const successes = rounds.filter((round) => round.result === 'Success').length
  const intervals = rounds.map((round) => round.target_duration)
  const successRate = rounds.length ? successes / rounds.length : 0
  // Keep the legacy Sheet fields populated for backwards compatibility. In the
  // fixed-duration flow, `threshold` means the selected session duration.
  const threshold = rounds.at(-1)?.target_duration ?? DEFAULT_DURATION_SECONDS

  return {
    session_id: sessionId,
    date: new Date().toLocaleDateString('sv-SE'),
    duration: intervals.length ? rounds.reduce((sum, round) => sum + round.actual_duration, 0) / 60 : 0,
    rounds: rounds.length,
    success_rate: successRate,
    threshold,
    max_interval: intervals.length ? Math.max(...intervals) : 0,
    avg_interval: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0,
  }
}
