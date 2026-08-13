import type { RoundRecord, RoundResult, SessionRecord } from './types'

export const MIN_INTERVAL = 10
export const MAX_INTERVAL = 600

export function clampInterval(seconds: number): number {
  return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Math.round(seconds)))
}

export function nextInterval(current: number, recentResults: RoundResult[]): number {
  if (recentResults.length < 2) return clampInterval(current)
  const pair = recentResults.slice(-2)
  if (pair.every((result) => result === 'Success')) return clampInterval(current * 1.1)
  if (pair.every((result) => result === 'Lapse')) return clampInterval(current * 0.9)
  return clampInterval(current)
}

export function warmupInterval(previousThreshold?: number): number {
  return clampInterval(previousThreshold ? previousThreshold * 0.8 : 20)
}

export function summarizeSession(sessionId: string, rounds: RoundRecord[], startedAt: number): SessionRecord {
  const successes = rounds.filter((round) => round.result === 'Success').length
  const intervals = rounds.map((round) => round.target_duration)
  const successRate = rounds.length ? successes / rounds.length : 0
  const candidates = [...rounds]
    .sort((a, b) => Math.abs((a.result === 'Success' ? 1 : 0) - 0.7) - Math.abs((b.result === 'Success' ? 1 : 0) - 0.7))
  const threshold = candidates[0]?.target_duration ?? 20

  return {
    session_id: sessionId,
    date: new Date().toLocaleDateString('sv-SE'),
    duration: Math.max(0, (Date.now() - startedAt) / 60000),
    rounds: rounds.length,
    success_rate: successRate,
    threshold,
    max_interval: intervals.length ? Math.max(...intervals) : 0,
    avg_interval: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0,
  }
}
