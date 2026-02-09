import { useEffect, useRef, useState } from 'react'
import { uuid } from '../lib/storage'

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
  const [value, setValue] = useState<T>(initialValue)
  const [loading, setLoading] = useState(true)
  const lastSentRef = useRef<string>('')
  const isFirstMountRef = useRef(true)

  // 仅在挂载时从云端同步一次
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await kvGet(key)
        if (cancelled) return
        if (remote.found) {
          const v = remote.value as T
          lastSentRef.current = JSON.stringify(v)
          setValue(v)
        } else {
          // 如果云端没数据，初始化一个
          await kvPut(key, initialValue)
          lastSentRef.current = JSON.stringify(initialValue)
        }
      } catch (err) {
        console.error(`Failed to fetch ${key}:`, err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  // 监听值变化并同步到云端
  useEffect(() => {
    // 如果正在加载，不保存（防止初始值覆盖云端）
    if (loading) return
    
    const serialized = JSON.stringify(value)
    // 如果值没变，不发送
    if (serialized === lastSentRef.current) return

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await kvPut(key, value)
          lastSentRef.current = serialized
        } catch (err) {
          console.error(`Failed to save ${key}:`, err)
        }
      })()
    }, 500) // 增加防抖时间到 500ms
    return () => window.clearTimeout(t)
  }, [key, value, loading])

  return [value, setValue, loading] as const
}
