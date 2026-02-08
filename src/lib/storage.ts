export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function uuid(): string {
  const cryptoAny = crypto as unknown as { randomUUID?: () => string }
  if (cryptoAny.randomUUID) return cryptoAny.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
