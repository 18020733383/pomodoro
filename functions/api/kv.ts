import type { D1Database, PagesFunction, Response as WorkersResponse } from '@cloudflare/workers-types'

type Env = {
  DB: D1Database
}

function json(value: unknown, init?: ResponseInit): WorkersResponse {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(value), { ...init, headers }) as unknown as WorkersResponse
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const clientId = request.headers.get('x-client-id')?.trim()
  if (!clientId) return json({ error: 'missing_client_id' }, { status: 400 })

  const url = new URL(request.url)

  if (request.method === 'GET') {
    const key = url.searchParams.get('key')?.trim()
    if (!key) return json({ error: 'missing_key' }, { status: 400 })

    const row = await env.DB.prepare('SELECT v, updated_at FROM kv WHERE client_id = ?1 AND k = ?2')
      .bind(clientId, key)
      .first<{ v: string; updated_at: number }>()

    if (!row) return json({ found: false })

    try {
      return json({ found: true, value: JSON.parse(row.v) as unknown, updatedAt: row.updated_at })
    } catch {
      return json({ found: true, value: null, updatedAt: row.updated_at })
    }
  }

  if (request.method === 'PUT') {
    const body = (await request.json().catch(() => null)) as null | { key?: unknown; value?: unknown }
    const key = typeof body?.key === 'string' ? body.key.trim() : ''
    if (!key) return json({ error: 'missing_key' }, { status: 400 })

    const now = Date.now()
    const v = JSON.stringify(body?.value ?? null)
    await env.DB.prepare(
      'INSERT INTO kv (client_id, k, v, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (client_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at',
    )
      .bind(clientId, key, v, now)
      .run()

    return json({ ok: true, updatedAt: now })
  }

  return json({ error: 'method_not_allowed' }, { status: 405 })
}
