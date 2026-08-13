import { describe, expect, it } from 'vitest'
import { nextInterval, warmupInterval } from '../src/adaptive'

describe('closed-loop adaptive staircase', () => {
  it('raises interval after two successes', () => expect(nextInterval(30, ['Success', 'Success'])).toBe(33))
  it('lowers interval after two lapses', () => expect(nextInterval(30, ['Lapse', 'Lapse'])).toBe(27))
  it('keeps interval for a mixed pair', () => expect(nextInterval(30, ['Success', 'Lapse'])).toBe(30))
  it('starts at 80 percent of previous threshold', () => expect(warmupInterval(100)).toBe(80))
  it('uses 20 seconds for the first training day', () => expect(warmupInterval()).toBe(20))
})
