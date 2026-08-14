import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callApi, queueOrSend, REQUEST_TIMEOUT_MS } from '../src/api'
import { loadQueue } from '../src/storage'

const config = { endpoint: 'https://script.google.com/macros/s/example/exec', token: 'private-token' }

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('local-first synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => vi.useRealTimers())

  it('persists a request before the network responds and removes it after success', async () => {
    let complete: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { complete = resolve })))

    const syncing = queueOrSend(config, 'round', { round: 1 })
    expect(loadQueue()).toHaveLength(1)

    complete!(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(syncing).resolves.toBe(true)
    expect(loadQueue()).toHaveLength(0)
  })

  it('keeps a failed request queued for a later retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(queueOrSend(config, 'session', { rounds: 1 })).resolves.toBe(false)
    expect(loadQueue()).toHaveLength(1)
  })

  it('stops a stalled request after the synchronization timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    const syncing = callApi(config, 'dashboard', {})
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

    await expect(syncing).resolves.toEqual({ ok: false, error: '同步逾時' })
  })
})
