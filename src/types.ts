export type PomodoroEvent = {
  name: string
  createdAt: string
}

export type PomodoroRecord = {
  id: string
  eventName: string
  durationSec: number
  startedAt: string
  stoppedAt?: string
  endedBy: 'finished' | 'stopped'
}

export type ActiveSession = {
  recordId: string
  eventName: string
  durationSec: number
  startedAt: string
  endsAt: string
}

export type AlarmState = {
  recordId: string
  eventName: string
  body: string
  triggeredAt: string
}

export type AiSettings = {
  baseUrl: string
  model: string
  apiKey?: string
}

export type AppSettings = {
  defaultDurationSec: number
  enableSpeech: boolean
  enableBeep: boolean
  enableBuzzerMp3: boolean
  ai: AiSettings
}

export type HardwareParameter = {
  label: string
  value: number
  unit: string
  note: string
}

export type HardwareChartPoint = {
  t: string
  value: number
}

export type HardwareReport = {
  title: string
  summary: string
  pseudoCode: string
  parameters: HardwareParameter[]
  chartTitle: string
  chartPoints: HardwareChartPoint[]
  interpretation: string
  createdAt: string
}

export type HardwareCall = {
  id: string
  timestamp: number
  sourceRecordsCount: number
  report: HardwareReport
}
