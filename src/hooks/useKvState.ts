import { useEffect, useRef, useState } from 'react'
import { loadJson, saveJson, uuid } from '../lib/storage'

const CLIENT_ID_KEY = 'pomodoro:clientId'

export function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY)
  if (existing) return existing
  const id = uuid()
  localStorage.setItem(CLIENT_ID_KEY, id)
  return id
}

async function kvGet(key: string): Promise<{ found: true; value: unknown } | { found: false }> {
  const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { 'x-client-id': getClientId() },
  })
  if (!res.ok) throw new Error(`kv_get_failed_${res.status}`)
  return (await res.json()) as { found: true; value: unknown } | { found: false }
}

async function kvPut(key: string, value: unknown): Promise<void> {
  const res = await fetch('/api/kv', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-client-id': getClientId() },
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
        if (!remote.found) return
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
