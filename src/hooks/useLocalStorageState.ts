import { useEffect, useState } from 'react'
import { loadJson, saveJson } from '../lib/storage'

export function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => loadJson<T>(key, initialValue))

  useEffect(() => {
    saveJson(key, value)
  }, [key, value])

  return [value, setValue] as const
}
