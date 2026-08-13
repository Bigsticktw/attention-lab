import { describe, expect, it } from 'vitest'
import { ROUND_COMPLETE_CHIME } from '../src/audio'

describe('round complete chime', () => {
  it('uses an ascending, audible three-note pattern', () => {
    expect(ROUND_COMPLETE_CHIME).toHaveLength(3)
    const frequencies = ROUND_COMPLETE_CHIME.map((note) => note.frequency)
    expect(frequencies).toEqual([...frequencies].sort((a, b) => a - b))
    expect(ROUND_COMPLETE_CHIME.at(-1)!.delay + ROUND_COMPLETE_CHIME.at(-1)!.duration).toBeLessThanOrEqual(1)
  })
})
