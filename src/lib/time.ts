export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function formatDurationSec(totalSec: number): string {
  const sec = clampInt(totalSec, 0, 24 * 60 * 60)
  const hh = Math.floor(sec / 3600)
  const mm = Math.floor((sec % 3600) / 60)
  const ss = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

export function formatDateTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  const d = dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const t = dt.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${d} - ${t}`
}

export function msUntil(isoEndsAt: string): number {
  const endsAt = new Date(isoEndsAt).getTime()
  if (Number.isNaN(endsAt)) return 0
  return endsAt - Date.now()
}
