import { describe, expect, it } from 'vitest'
import { createPairingPayload, parsePairingHash } from '../src/storage'

describe('mobile pairing', () => {
  it('round-trips a private Apps Script configuration', () => {
    const config = { endpoint: 'https://script.google.com/macros/s/example/exec', token: 'private-token' }
    expect(parsePairingHash(`#setup=${createPairingPayload(config)}`)).toEqual(config)
  })

  it('rejects non-Google or insecure endpoints', () => {
    const config = { endpoint: 'http://example.com/write', token: 'private-token' }
    expect(parsePairingHash(`#setup=${createPairingPayload(config)}`)).toBeNull()
  })
})
