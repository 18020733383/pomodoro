import { useCallback, useEffect, useRef, useState } from 'react'

async function kvGet(key: string): Promise<{ found: true; value: unknown } | { found: false }> {
  const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
    method: 'GET',
  })
  if (!res.ok) throw new Error(`kv_get_failed_${res.status}`)
  return (await res.json()) as { found: true; value: unknown } | { found: false }
}

async function kvPut(key: string, value: unknown): Promise<void> {
  const res = await fetch('/api/kv', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
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

  useEffect(() => {
    valueRef.current = value
  }, [value])

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

  useEffect(() => {
    const handleBeforeUnload = () => {
      const serialized = JSON.stringify(valueRef.current)
      if (serialized !== lastSentRef.current) {
        void fetch('/api/kv', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
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
