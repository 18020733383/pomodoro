import { useEffect, useRef, useState } from 'react'
import { loadJson, saveJson, uuid } from '../lib/storage'

const CLIENT_ID_KEY = 'pomodoro:clientId'

export function getClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || ''
}

export function setClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

export function ensureClientId(): string {
  const existing = getClientId()
  if (existing) return existing
  const id = uuid()
  setClientId(id)
  return id
}

async function kvGet(key: string): Promise<{ found: true; value: unknown } | { found: false }> {
  const id = ensureClientId()
  const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { 'x-client-id': id },
  })
  if (!res.ok) throw new Error(`kv_get_failed_${res.status}`)
  return (await res.json()) as { found: true; value: unknown } | { found: false }
}

async function kvPut(key: string, value: unknown): Promise<void> {
  const id = ensureClientId()
  const res = await fetch('/api/kv', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-client-id': id },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) throw new Error(`kv_put_failed_${res.status}`)
}

export function useKvState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => loadJson<T>(key, initialValue))
  const lastSentRef = useRef<string>('')
  const hydrationDoneRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await kvGet(key)
        if (cancelled) return
        hydrationDoneRef.current = true
        if (!remote.found) {
          // 如果云端没数据，把本地当前数据同步上去
          void kvPut(key, value).catch(() => {})
          return
        }
        const v = remote.value as T
        lastSentRef.current = JSON.stringify(v)
        saveJson(key, v)
        setValue(v)
      } catch {
        hydrationDoneRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    saveJson(key, value)
    const serialized = JSON.stringify(value)
    if (serialized === lastSentRef.current) return

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await kvPut(key, value)
          lastSentRef.current = serialized
        } catch {
          if (!hydrationDoneRef.current) return
        }
      })()
    }, 250)
    return () => window.clearTimeout(t)
  }, [key, value])

  return [value, setValue] as const
}
