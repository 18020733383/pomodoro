import { useEffect, useRef } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
}

export function useWakeLock(enabled: boolean) {
  const lockRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) return
    const wakeLockAny = navigator.wakeLock as unknown as { request?: (type: 'screen') => Promise<WakeLockSentinelLike> } | undefined
    const request = wakeLockAny?.request
    if (!request) return

    let cancelled = false

    const acquire = async () => {
      try {
        const sentinel = await request('screen')
        if (cancelled) {
          await sentinel.release()
          return
        }
        lockRef.current = sentinel
      } catch {
        lockRef.current = null
      }
    }

    void acquire()

    return () => {
      cancelled = true
      const current = lockRef.current
      lockRef.current = null
      if (current && !current.released) void current.release()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const wakeLockAny = navigator.wakeLock as unknown as { request?: (type: 'screen') => Promise<WakeLockSentinelLike> } | undefined
    const request = wakeLockAny?.request
    if (!request) return

    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      void request('screen')
        .then((sentinel) => {
          lockRef.current = sentinel
        })
        .catch(() => {})
    }

    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled])
}
