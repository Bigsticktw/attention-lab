export type RoundResult = 'Success' | 'Lapse'

export interface RoundRecord {
  timestamp: string
  session_id: string
  round: number
  target_duration: number
  actual_duration: number
  result: RoundResult
  lapse_level: number
  next_duration: number
  session_elapsed: number
}

export interface SessionRecord {
  session_id: string
  date: string
  duration: number
  rounds: number
  success_rate: number
  threshold: number
  max_interval: number
  avg_interval: number
}

export interface DailyMetric {
  date: string
  training_minutes: number
  threshold: number
  success_rate: number
  max_interval: number
  sart_rt_sd?: number | null
}

export interface ApiConfig {
  endpoint: string
  token: string
}

export interface PendingRequest {
  id: string
  action: string
  payload: unknown
  queuedAt: string
}
