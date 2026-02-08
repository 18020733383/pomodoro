import type { AiSettings, HardwareReport, PomodoroRecord } from '../types'
import { uuid } from './storage'
import { formatDateTime, formatDurationSec } from './time'
import { requestChatContent } from './newapi'

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue }

function safeJsonParse(raw: string): JsonValue | null {
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as JsonValue
      } catch {
        return null
      }
    }
    return null
  }
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clamp01_100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function firstObject(root: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = root[k]
    if (isPlainObject(v)) return v
  }
  return null
}

function firstString(root: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const k of keys) {
    const v = root[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return fallback
}

function firstArray(root: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = root[k]
    if (Array.isArray(v)) return v
  }
  return []
}

export function buildHardwarePrompt(records: PomodoroRecord[]) {
  const max = 60
  const rows = records.slice(0, max)

  const tableLines = [
    '# | 名称 | 定时器 | 开始日期与时间 | 停止日期与时间 | 结束方式',
    ...rows.map((r, idx) => {
      const stop = r.stoppedAt ? formatDateTime(r.stoppedAt) : '（进行中）'
      return `${idx + 1} | ${r.eventName} | ${formatDurationSec(r.durationSec)} | ${formatDateTime(r.startedAt)} | ${stop} | ${r.endedBy}`
    }),
  ]

  const system = [
    '你是一个名为“Bio-Kernel OS”的意识到硬件接口翻译器。',
    '你要把我的番茄钟记录编译成：硬件参数 + 折线图 + 伪代码编译日志 + 解释。',
    '输出必须是严格 JSON，且只能输出 JSON（不要 Markdown，不要多余文字）。',
    '语言要求：所有可读文本必须用中文（title/summary/chartTitle/parameters.label/parameters.note/interpretation 必须中文）。',
    '非空要求：上述字段不得为空字符串；pseudoCode 必须至少 12 行。',
    '数值要求：所有百分比范围 0-100；chartPoints.value 也是 0-100。',
    'parameters 必须给 4-8 个参数，每个都有 label/value/unit/note；unit 允许为空但不建议。',
    'chartPoints 必须给 12-24 个点，t 用 HH:MM:SS。',
    'pseudoCode 用你自创的伪语言，模块名可以像 Metabolism/NeuralNetwork/Cardiovascular/Endocrine，但日志内容必须中文。',
    '严格按下面结构输出（字段名大小写一致）：',
    '{',
    '  "title": "中文标题",',
    '  "summary": "中文摘要",',
    '  "chartTitle": "中文图标题",',
    '  "parameters": [{"label":"中文","value":0,"unit":"%","note":"中文"}],',
    '  "chartPoints": [{"t":"09:30:05","value":0}],',
    '  "pseudoCode": "多行字符串，每行像编译日志/伪代码调用",',
    '  "interpretation": "中文解释（6-10 句）",',
    '  "createdAt": "ISO8601"',
    '}',
  ].join('\n')

  const user = ['我的番茄钟记录如下：', ...tableLines].join('\n')

  return {
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
  }
}

export async function requestHardwareReport(args: { settings: AiSettings; records: PomodoroRecord[] }): Promise<HardwareReport> {
  const { messages } = buildHardwarePrompt(args.records)

  const raw = await requestChatContent({
    settings: args.settings,
    messages,
    temperature: 0.6,
    extraBody: { response_format: { type: 'json_object' } },
  })

  const parsed = safeJsonParse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const rawTrimmed = raw.trim()
    return {
      title: 'BIO-KERNEL OS / 翻译失败',
      summary: rawTrimmed ? '模型没有返回可解析的 JSON。' : '模型返回了空内容。',
      pseudoCode: rawTrimmed ? rawTrimmed : '（空）',
      parameters: [],
      chartTitle: '硬件指标波动',
      chartPoints: [],
      interpretation: '请点击一次按钮重试，或换一个模型/接口。',
      createdAt: new Date().toISOString(),
    }
  }

  const obj = parsed as Record<string, unknown>
  const source = firstObject(obj, ['report', 'data', 'result']) ?? obj

  const parametersRaw = firstArray(source, ['parameters', 'params', 'parameterList'])
  const parameters = parametersRaw
    .map((p) => {
      const po = (p ?? {}) as Record<string, unknown>
      return {
        label: asString(po.label ?? po.name, '参数'),
        value: clamp01_100(asNumber(po.value, 0)),
        unit: asString(po.unit, ''),
        note: asString(po.note ?? po.desc, ''),
      }
    })
    .filter((p) => Boolean(p.label.trim()))

  const pointsRaw = firstArray(source, ['chartPoints', 'points', 'series'])
  const chartPoints = pointsRaw
    .map((pt) => {
      const po = (pt ?? {}) as Record<string, unknown>
      return {
        t: asString(po.t ?? po.time, ''),
        value: clamp01_100(asNumber(po.value, 0)),
      }
    })
    .filter((p) => Boolean(p.t))

  const pseudoCode = firstString(source, ['pseudoCode', 'pseudocode', 'pseudo_code', 'pseudo', 'compileLog', 'log', 'code'], '')
  const interpretation = firstString(source, ['interpretation', 'explain', 'explanation', 'analysis', 'comment', 'notes'], '')

  return {
    title: firstString(source, ['title', 'name'], 'BIO-KERNEL OS / 意识-硬件桥接'),
    summary: firstString(source, ['summary', 'overview', 'digest', 'intro'], '（无摘要）'),
    pseudoCode: pseudoCode.trim() ? pseudoCode : '（模型没有提供伪代码编译日志）',
    parameters,
    chartTitle: firstString(source, ['chartTitle', 'chart_name', 'chart'], '硬件指标波动'),
    chartPoints,
    interpretation: interpretation.trim() ? interpretation : '（模型没有提供解释）',
    createdAt: firstString(source, ['createdAt', 'timestamp', 'time'], new Date().toISOString()),
  }
}

export function newHardwareCallId(): string {
  return `hw-${uuid()}`
}
