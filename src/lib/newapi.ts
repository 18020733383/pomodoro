import type { AiSettings, DdlEvent, PomodoroRecord } from '../types'
import { formatDateTime, formatDurationSec } from './time'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return 'https://x666.me'
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export async function requestChatContent(args: {
  settings: AiSettings
  messages: ChatMessage[]
  temperature?: number
  extraBody?: Record<string, unknown>
}) {
  const baseUrl = normalizeBaseUrl(args.settings.baseUrl)
  const url = `${baseUrl}/v1/chat/completions`
  const apiKey = (args.settings.apiKey ?? '').trim()
  if (!apiKey) throw new Error('缺少 API Key')

  const body = {
    model: args.settings.model,
    messages: args.messages,
    temperature: args.temperature ?? 0.7,
    ...(args.extraBody ?? {}),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as unknown
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data ? JSON.stringify((data as { error: unknown }).error) : JSON.stringify(data)
    throw new Error(msg)
  }

  const choice0 = (data as { choices?: Array<{ message?: unknown }> }).choices?.[0]
  const msg = (choice0?.message ?? {}) as {
    content?: unknown
    tool_calls?: Array<{ function?: { arguments?: unknown } }>
  }
  const content = typeof msg.content === 'string' ? msg.content : ''
  if (content.trim()) return content

  const toolArgs = msg.tool_calls?.[0]?.function?.arguments
  if (typeof toolArgs === 'string' && toolArgs.trim()) return toolArgs

  return JSON.stringify(data)
}

export function buildMentorPrompt(records: PomodoroRecord[], ddlEvents: DdlEvent[]): ChatMessage[] {
  const max = 60
  const rows = records.slice(0, max)

  const ddlMax = 40
  const ddlRows = ddlEvents
    .slice(0, ddlMax)
    .slice()
    .sort((a, b) => (a.ddlAt ?? '').localeCompare(b.ddlAt ?? ''))

  const ddlTableLines =
    ddlRows.length === 0
      ? ['（暂无）']
      : [
          '# | 标题 | DDL | 状态',
          ...ddlRows.map((e, idx) => {
            const status = e.status === 'not_started' ? '还没到' : e.status === 'ongoing' ? '进行中' : '已结束'
            return `${idx + 1} | ${e.title} | ${formatDateTime(e.ddlAt)} | ${status}`
          }),
        ]
  const tableLines = [
    '# | 名称 | 定时器 | 开始日期与时间 | 停止日期与时间',
    ...rows.map((r, idx) => {
      const stop = r.stoppedAt ? formatDateTime(r.stoppedAt) : '（进行中）'
      return `${idx + 1} | ${r.eventName} | ${formatDurationSec(r.durationSec)} | ${formatDateTime(r.startedAt)} | ${stop}`
    }),
  ]

  const prompt = [
    '你是一个毒舌但负责的导师。',
    '你要根据我的番茄钟记录，评价我的时间表是否像个人类。',
    '要求：',
    '1) 先用 1-2 句话非常毒舌地总结。',
    '2) 再给 5 条具体可执行建议，每条不超过 20 个字。',
    '3) 最后给一个 1 小时内可完成的行动清单（带时间）。',
    '',
    '我的 DDL 事件如下（需要考虑它们对时间规划的压力与优先级）：',
    ...ddlTableLines,
    '',
    '我的番茄钟记录如下：',
    ...tableLines,
  ].join('\n')

  return [
    { role: 'system', content: '你是严格的导师，表达直接，不讲废话。所有输出必须用中文。' },
    { role: 'user', content: prompt },
  ]
}

export async function requestMentorReview(args: { settings: AiSettings; records: PomodoroRecord[]; ddlEvents: DdlEvent[] }) {
  return requestChatContent({ settings: args.settings, messages: buildMentorPrompt(args.records, args.ddlEvents), temperature: 0.7 })
}
