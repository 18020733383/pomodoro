import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pickToxicLine, startAlarmLoop } from '../lib/alarm'
import { nowIso, uuid } from '../lib/storage'
import { msUntil } from '../lib/time'
import type { ActiveSession, AlarmState, AppSettings, PomodoroEvent, PomodoroRecord } from '../types'
import { useKvState } from './useKvState'

const STORAGE = {
  settings: 'pomodoro:settings',
  events: 'pomodoro:events',
  records: 'pomodoro:records',
  active: 'pomodoro:active',
  alarm: 'pomodoro:alarm',
} as const

const defaultSettings: AppSettings = {
  defaultDurationSec: 25 * 60,
  enableSpeech: true,
  enableBeep: true,
  enableBuzzerMp3: true,
  ai: {
    baseUrl: 'https://x666.me',
    model: 'gemini-3-flash-preview',
  },
}

const defaultEvents: PomodoroEvent[] = [{ name: '摸鱼', createdAt: nowIso() }]

function normalizeEvents(raw: PomodoroEvent[]): PomodoroEvent[] {
  const map = new Map<string, PomodoroEvent>()
  for (const e of raw) {
    const name = (e?.name ?? '').trim()
    if (!name) continue
    if (!map.has(name)) map.set(name, { name, createdAt: e?.createdAt ?? nowIso() })
  }
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export { normalizeEvents }

export function usePomodoro() {
  const [settings, setSettings] = useKvState<AppSettings>(STORAGE.settings, defaultSettings)
  const [events, setEvents] = useKvState<PomodoroEvent[]>(STORAGE.events, defaultEvents)
  const [records, setRecords] = useKvState<PomodoroRecord[]>(STORAGE.records, [])
  const [active, setActive] = useKvState<ActiveSession | null>(STORAGE.active, null)
  const [alarm, setAlarm] = useKvState<AlarmState | null>(STORAGE.alarm, null)

  const [nowMs, setNowMs] = useState(() => Date.now())
  const finishingRef = useRef(false)
  const alarmLoopRef = useRef<ReturnType<typeof startAlarmLoop> | null>(null)

  useEffect(() => {
    setSettings((prev) => ({
      ...defaultSettings,
      ...prev,
      ai: { ...defaultSettings.ai, ...prev.ai },
      enableBuzzerMp3: prev.enableBuzzerMp3 ?? defaultSettings.enableBuzzerMp3,
    }))
  }, [setSettings])

  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [active])

  useEffect(() => {
    const current = alarmLoopRef.current
    alarmLoopRef.current = null
    if (current) current.stop()

    if (!alarm) return
    const loop = startAlarmLoop({
      title: '番茄钟到点了',
      body: alarm.body,
      vibrate: true,
      mp3: settings.enableBuzzerMp3,
      beep: settings.enableBeep && !settings.enableBuzzerMp3,
      speech: settings.enableSpeech,
    })
    alarmLoopRef.current = loop
    return () => {
      const l = alarmLoopRef.current
      alarmLoopRef.current = null
      if (l) l.stop()
    }
  }, [alarm, settings.enableBeep, settings.enableBuzzerMp3, settings.enableSpeech])

  const remainingMs = useMemo(() => {
    if (!active) return 0
    return active.endsAt ? new Date(active.endsAt).getTime() - nowMs : 0
  }, [active, nowMs])

  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
  const isRunning = Boolean(active && remainingMs > 0)

  const addEvent = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setEvents((prev) => normalizeEvents([...prev, { name: trimmed, createdAt: nowIso() }]))
  }, [setEvents])

  const removeEvent = useCallback((name: string) => {
    setEvents((prev) => prev.filter((e) => e.name !== name))
  }, [setEvents])

  const start = useCallback(async (eventName: string, durationSec: number) => {
    if (active || alarm) return
    finishingRef.current = false

    const startedAt = nowIso()
    const endsAt = new Date(Date.now() + durationSec * 1000).toISOString()
    const recordId = uuid()

    const record: PomodoroRecord = {
      id: recordId,
      eventName,
      durationSec,
      startedAt,
      endedBy: 'finished',
    }

    setRecords((prev) => [record, ...prev])
    setActive({
      recordId,
      eventName,
      durationSec,
      startedAt,
      endsAt,
    })
  }, [active, alarm, setActive, setRecords])

  const stop = useCallback(() => {
    if (!active) return
    const stoppedAt = nowIso()
    const recordId = active.recordId

    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId && !r.stoppedAt
          ? {
              ...r,
              stoppedAt,
              endedBy: 'stopped',
            }
          : r,
      ),
    )
    setActive(null)
  }, [active, setActive, setRecords])

  const finish = useCallback(async (finishedAtIso?: string) => {
    if (!active) return
    if (finishingRef.current) return
    finishingRef.current = true

    const recordId = active.recordId
    const stoppedAt = finishedAtIso ?? nowIso()
    const eventName = active.eventName

    setRecords((prev) =>
      prev.map((r) => (r.id === recordId && !r.stoppedAt ? { ...r, stoppedAt, endedBy: 'finished' } : r)),
    )
    setActive(null)

    const body = pickToxicLine(eventName)
    setAlarm({
      recordId,
      eventName,
      body,
      triggeredAt: nowIso(),
    })
  }, [active, setActive, setAlarm, setRecords])

  const acknowledgeAlarm = useCallback(() => {
    const current = alarmLoopRef.current
    alarmLoopRef.current = null
    if (current) current.stop()
    setAlarm(null)
  }, [setAlarm])

  const replayAlarm = useCallback(async () => {
    const loop = alarmLoopRef.current
    if (!loop) return false
    return loop.replay()
  }, [])

  const deleteRecord = useCallback(
    (id: string) => {
      if (active?.recordId === id) return
      setRecords((prev) => prev.filter((r) => r.id !== id))
      if (alarm?.recordId === id) acknowledgeAlarm()
    },
    [acknowledgeAlarm, active?.recordId, alarm?.recordId, setRecords],
  )

  const clearRecords = useCallback(() => {
    if (active) return
    setRecords([])
    if (alarm) acknowledgeAlarm()
  }, [acknowledgeAlarm, active, alarm, setRecords])

  useEffect(() => {
    if (!active) return
    const ms = msUntil(active.endsAt)
    const t = window.setTimeout(() => {
      void finish(active.endsAt)
    }, Math.max(0, ms))
    return () => window.clearTimeout(t)
  }, [active, finish])

  useEffect(() => {
    if (!active) return
    const ms = msUntil(active.endsAt)
    if (ms <= 0) {
      void finish(active.endsAt)
    }
  }, [active, finish, nowMs])

  useEffect(() => {
    if (!active) return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'default') return
    void Notification.requestPermission()
  }, [active])

  useEffect(() => {
    setEvents((prev) => normalizeEvents(prev))
  }, [setEvents])

  return {
    settings,
    setSettings,
    events,
    setEvents,
    addEvent,
    removeEvent,
    records,
    setRecords,
    active,
    setActive,
    alarm,
    setAlarm,
    remainingSec,
    isRunning,
    start,
    stop,
    finish,
    acknowledgeAlarm,
    replayAlarm,
    deleteRecord,
    clearRecords,
  }
}
