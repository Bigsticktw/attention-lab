import type { ApiConfig, DailyMetric, PendingRequest, SessionRecord } from './types'

const CONFIG_KEY = 'attention-lab-config'
const QUEUE_KEY = 'attention-lab-queue'
const HISTORY_KEY = 'attention-lab-history'
const SOUND_KEY = 'attention-lab-sound-enabled'

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

export const loadSoundEnabled = (): boolean => localStorage.getItem(SOUND_KEY) !== 'false'
export const saveSoundEnabled = (enabled: boolean): void => localStorage.setItem(SOUND_KEY, String(enabled))

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export function createPairingPayload(config: ApiConfig): string {
  return encodeBase64Url(JSON.stringify(config))
}

export function parsePairingHash(hash: string): ApiConfig | null {
  const prefix = '#setup='
  if (!hash.startsWith(prefix)) return null
  try {
    const parsed = JSON.parse(decodeBase64Url(hash.slice(prefix.length))) as Partial<ApiConfig>
    if (typeof parsed.endpoint !== 'string' || typeof parsed.token !== 'string') return null
    const endpoint = new URL(parsed.endpoint)
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' || !parsed.token) return null
    return { endpoint: endpoint.toString(), token: parsed.token }
  } catch {
    return null
  }
}

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
