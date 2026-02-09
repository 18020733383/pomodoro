import { useCallback, useEffect, useRef, useState } from 'react'
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
  const timeoutRef = useRef<number | null>(null)
  const valueRef = useRef<T>(value)

  // 更新 ref 以便在异步闭包中使用最新值
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // 使用 useCallback 避免在 useEffect 中引起不必要的重新执行
  const syncToCloud = useCallback(async (v: T) => {
    const serialized = JSON.stringify(v)
    if (serialized === lastSentRef.current) return
    try {
      await kvPut(key, v)
      lastSentRef.current = serialized
    } catch (err) {
      console.error(`Failed to save ${key}:`, err)
    }
  }, [key])

  // 暴露一个可以立即同步的方法
  const setValueWrapped = useCallback((newValue: T | ((prev: T) => T), immediate = false) => {
    const nextValue = typeof newValue === 'function' 
      ? (newValue as (prev: T) => T)(valueRef.current)
      : newValue
    
    setValue(nextValue)

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (immediate) {
      void syncToCloud(nextValue)
    }
  }, [syncToCloud])

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
          valueRef.current = v
        } else {
          // 如果云端没有数据，也不要在这里写入初始值，避免覆盖其他端的同步
          // 只有在用户第一次操作修改时，才会触发同步
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // 监听值变化并同步到云端（带防抖）
  useEffect(() => {
    if (loading) return
    
    const serialized = JSON.stringify(value)
    if (serialized === lastSentRef.current) return

    timeoutRef.current = window.setTimeout(() => {
      void syncToCloud(value)
    }, 500)

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [key, value, loading, syncToCloud])

  // 页面关闭前的兜底
  useEffect(() => {
    const handleBeforeUnload = () => {
      const serialized = JSON.stringify(valueRef.current)
      if (serialized !== lastSentRef.current) {
        // 使用 fetch keepalive 确保在页面关闭时也能发送请求
        const id = ensureClientId()
        void fetch('/api/kv', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-client-id': id },
          body: JSON.stringify({ key, value: valueRef.current }),
          keepalive: true,
        })
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [key])

  return [value, setValueWrapped, loading] as const
}
