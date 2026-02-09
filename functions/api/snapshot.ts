import type { D1Database, PagesFunction, Response as WorkersResponse } from '@cloudflare/workers-types'

type Env = {
  DB: D1Database
}

function json(value: unknown, init?: ResponseInit): WorkersResponse {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(value), { ...init, headers }) as unknown as WorkersResponse
}

type Snapshot = {
  version: number
  exportedAt: string
  data: Record<string, unknown>
}

function normalizeSnapshot(input: unknown): Snapshot {
  const obj = (input && typeof input === 'object' ? input : null) as null | Record<string, unknown>
  const rawData = (obj?.data && typeof obj.data === 'object' ? obj.data : obj) as unknown
  const data = (rawData && typeof rawData === 'object' ? rawData : {}) as Record<string, unknown>
  return { version: typeof obj?.version === 'number' ? obj.version : 1, exportedAt: new Date().toISOString(), data }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const clientId = 'default'

  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT k, v, updated_at FROM kv WHERE client_id = ?1 ORDER BY k')
      .bind(clientId)
      .all<{ k: string; v: string; updated_at: number }>()

    const data: Record<string, unknown> = {}
    for (const r of rows.results ?? []) {
      try {
        data[r.k] = JSON.parse(r.v) as unknown
      } catch {
        data[r.k] = null
      }
    }

    return json({ version: 1, exportedAt: new Date().toISOString(), data })
  }

  if (request.method === 'PUT') {
    const incoming = normalizeSnapshot(await request.json().catch(() => null))
    const now = Date.now()

    const entries = Object.entries(incoming.data).filter(([k]) => typeof k === 'string' && k.trim())
    const stmts = entries.map(([k, v]) =>
      env.DB.prepare(
        'INSERT INTO kv (client_id, k, v, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (client_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at',
      ).bind(clientId, k, JSON.stringify(v ?? null), now),
    )
    if (stmts.length) await env.DB.batch(stmts)

    return json({ ok: true, updatedAt: now, count: stmts.length })
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM kv WHERE client_id = ?1').bind(clientId).run()
    return json({ ok: true })
  }

  return json({ error: 'method_not_allowed' }, { status: 405 })
}
