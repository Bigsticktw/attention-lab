import { describe, expect, it } from 'vitest'
import { DEFAULT_DURATION_SECONDS, normalizeTrainingDuration, summarizeSession } from '../src/adaptive'
import type { RoundRecord } from '../src/types'

describe('fixed-duration attention training', () => {
  it('uses five minutes as the default duration', () => expect(DEFAULT_DURATION_SECONDS).toBe(300))

  it('keeps a user-selected duration within one and sixty minutes', () => {
    expect(normalizeTrainingDuration(10)).toBe(60)
    expect(normalizeTrainingDuration(12 * 60)).toBe(720)
    expect(normalizeTrainingDuration(90 * 60)).toBe(3600)
    expect(normalizeTrainingDuration(Number.NaN)).toBe(300)
  })

  it('stores the selected duration in legacy summary fields without adapting it', () => {
    const round: RoundRecord = {
      timestamp: '2026-08-20T00:00:00.000Z', session_id: 'session-1', round: 1,
      target_duration: 300, actual_duration: 300, result: 'Lapse', lapse_level: 2,
      next_duration: 300, session_elapsed: 300,
    }
    const summary = summarizeSession('session-1', [round])
    expect(summary).toMatchObject({ rounds: 1, success_rate: 0, threshold: 300, max_interval: 300, avg_interval: 300 })
  })
})
