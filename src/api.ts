import { enqueue, loadQueue, saveQueue } from './storage'
import type { ApiConfig, DailyMetric, PendingRequest } from './types'

export const REQUEST_TIMEOUT_MS = 12_000
const inFlight = new Set<string>()

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function callApi<T>(config: ApiConfig, action: string, payload: unknown): Promise<ApiResponse<T>> {
  if (!config.endpoint || !config.token) return { ok: false, error: '尚未設定 Google Apps Script' }
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: config.token, payload }),
      signal: controller.signal,
    })
    const result = (await response.json()) as ApiResponse<T>
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`)
    return result
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, error: '同步逾時' }
    return { ok: false, error: error instanceof Error ? error.message : '同步失敗' }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function removeQueued(id: string): void {
  saveQueue(loadQueue().filter((item) => item.id !== id))
}

async function sendQueued(config: ApiConfig, item: PendingRequest): Promise<boolean> {
  if (inFlight.has(item.id)) return false
  inFlight.add(item.id)
  try {
    const result = await callApi(config, item.action, item.payload)
    if (!result.ok) return false
    removeQueued(item.id)
    return true
  } finally {
    inFlight.delete(item.id)
  }
}

export async function queueOrSend(config: ApiConfig, action: string, payload: unknown): Promise<boolean> {
  const item = enqueue(action, payload)
  return sendQueued(config, item)
}

export async function flushQueue(config: ApiConfig): Promise<number> {
  const pending = loadQueue()
  let sent = 0
  for (const item of pending) {
    if (await sendQueued(config, item)) sent += 1
  }
  return sent
}

export async function fetchDashboard(config: ApiConfig): Promise<DailyMetric[]> {
  const result = await callApi<DailyMetric[]>(config, 'dashboard', {})
  return result.ok && result.data ? result.data : []
}
