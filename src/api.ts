import { enqueue, loadQueue, saveQueue } from './storage'
import type { ApiConfig, DailyMetric } from './types'

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function callApi<T>(config: ApiConfig, action: string, payload: unknown): Promise<ApiResponse<T>> {
  if (!config.endpoint || !config.token) return { ok: false, error: '尚未設定 Google Apps Script' }
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: config.token, payload }),
    })
    const result = (await response.json()) as ApiResponse<T>
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`)
    return result
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '同步失敗' }
  }
}

export async function queueOrSend(config: ApiConfig, action: string, payload: unknown): Promise<boolean> {
  const result = await callApi(config, action, payload)
  if (result.ok) return true
  enqueue(action, payload)
  return false
}

export async function flushQueue(config: ApiConfig): Promise<number> {
  const pending = loadQueue()
  const remaining = []
  let sent = 0
  for (const item of pending) {
    const result = await callApi(config, item.action, item.payload)
    if (result.ok) sent += 1
    else remaining.push(item)
  }
  saveQueue(remaining)
  return sent
}

export async function fetchDashboard(config: ApiConfig): Promise<DailyMetric[]> {
  const result = await callApi<DailyMetric[]>(config, 'dashboard', {})
  return result.ok && result.data ? result.data : []
}
