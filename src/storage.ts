import type { ApiConfig, DailyMetric, PendingRequest, SessionRecord } from './types'

const CONFIG_KEY = 'attention-lab-config'
const QUEUE_KEY = 'attention-lab-queue'
const HISTORY_KEY = 'attention-lab-history'

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export const loadConfig = (): ApiConfig => readJson(CONFIG_KEY, { endpoint: '', token: '' })
export const saveConfig = (config: ApiConfig): void => localStorage.setItem(CONFIG_KEY, JSON.stringify(config))

export const loadQueue = (): PendingRequest[] => readJson(QUEUE_KEY, [])
export const saveQueue = (queue: PendingRequest[]): void => localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))

export function enqueue(action: string, payload: unknown): PendingRequest {
  const item = { id: crypto.randomUUID(), action, payload, queuedAt: new Date().toISOString() }
  saveQueue([...loadQueue(), item])
  return item
}

export function saveLocalSession(session: SessionRecord): void {
  const history = readJson<SessionRecord[]>(HISTORY_KEY, [])
  localStorage.setItem(HISTORY_KEY, JSON.stringify([...history.filter((item) => item.session_id !== session.session_id), session]))
}

export const loadLocalHistory = (): SessionRecord[] => readJson(HISTORY_KEY, [])

export function localDailyMetrics(): DailyMetric[] {
  return loadLocalHistory()
    .slice(-14)
    .map((session) => ({
      date: session.date,
      training_minutes: session.duration,
      threshold: session.threshold,
      success_rate: session.success_rate,
      max_interval: session.max_interval,
    }))
}
