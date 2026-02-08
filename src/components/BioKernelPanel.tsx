import { useMemo, useRef, useState } from 'react'
import type { HardwareCall, HardwareReport } from '../types'

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

type XY = { x: number; y: number }

function smoothSegments(points: XY[], tension = 1): Array<{ cp1: XY; cp2: XY; p: XY }> {
  const segs: Array<{ cp1: XY; cp2: XY; p: XY }> = []
  if (points.length < 2) return segs

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i] ?? points[i - 1]
    const p2 = points[i + 1] ?? points[i]
    const p3 = points[i + 2] ?? p2
    if (!p0 || !p1 || !p2 || !p3) continue

    const cp1: XY = {
      x: p1.x + ((p2.x - p0.x) / 6) * tension,
      y: p1.y + ((p2.y - p0.y) / 6) * tension,
    }
    const cp2: XY = {
      x: p2.x - ((p3.x - p1.x) / 6) * tension,
      y: p2.y - ((p3.y - p1.y) / 6) * tension,
    }
    segs.push({ cp1, cp2, p: p2 })
  }

  return segs
}

function buildSmoothLinePath(points: XY[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  if (!first) return ''
  if (points.length === 1) return `M ${first.x} ${first.y}`
  if (points.length === 2) {
    const second = points[1]
    if (!second) return `M ${first.x} ${first.y}`
    return `M ${first.x} ${first.y} L ${second.x} ${second.y}`
  }

  const segs = smoothSegments(points, 1)
  const d = [`M ${first.x} ${first.y}`]
  for (const s of segs) {
    d.push(`C ${s.cp1.x} ${s.cp1.y}, ${s.cp2.x} ${s.cp2.y}, ${s.p.x} ${s.p.y}`)
  }
  return d.join(' ')
}

function buildSmoothAreaPath(points: XY[], baseY: number): string {
  if (points.length === 0) return ''
  const first = points[0]
  if (!first) return ''
  const last = points[points.length - 1]
  if (!last) return ''

  if (points.length === 1) {
    return `M ${first.x} ${baseY} L ${first.x} ${first.y} L ${first.x} ${baseY} Z`
  }

  if (points.length === 2) {
    return `M ${first.x} ${baseY} L ${first.x} ${first.y} L ${last.x} ${last.y} L ${last.x} ${baseY} Z`
  }

  const segs = smoothSegments(points, 1)
  const d = [`M ${first.x} ${baseY}`, `L ${first.x} ${first.y}`]
  for (const s of segs) {
    d.push(`C ${s.cp1.x} ${s.cp1.y}, ${s.cp2.x} ${s.cp2.y}, ${s.p.x} ${s.p.y}`)
  }
  d.push(`L ${last.x} ${baseY}`, 'Z')
  return d.join(' ')
}

function pickStats(report: HardwareReport) {
  const items = report.parameters.slice(0, 4)
  while (items.length < 4) items.push({ label: '—', value: 0, unit: '', note: '' })
  return items
}

export function BioKernelPanel(props: { call: HardwareCall | null }) {
  const report = props.call?.report
  if (!report) {
    return (
      <div className="bioEmpty">
        <div className="bioMuted">等待硬件翻译指令…</div>
        <div className="bioMutedSmall">点击按钮后，AI 会把你的日程表编译成“硬件参数”。</div>
      </div>
    )
  }

  const callKey = props.call?.id ?? report.createdAt
  return <BioKernelReportView key={callKey} report={report} callKey={callKey} />
}

function BioKernelReportView(props: { report: HardwareReport; callKey: string }) {
  const report = props.report
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const hoverPendingIdxRef = useRef<number | null>(null)
  const hoverIdxRef = useRef<number | null>(null)
  const leaveTimerRef = useRef<number | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  const width = 640
  const height = 200
  const padX = 18
  const padY = 16
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const pts = report.chartPoints
  const computed = useMemo(() => {
    const n = pts.length
    const pointXY = pts.map((p, idx) => {
      const x = padX + (n <= 1 ? 0 : (idx / (n - 1)) * innerW)
      const y = padY + (1 - clamp01(p.value / 100)) * innerH
      return { x, y }
    })
    return {
      n,
      pointXY,
      area: buildSmoothAreaPath(pointXY, padY + innerH),
      line: buildSmoothLinePath(pointXY),
    }
  }, [innerH, innerW, padX, padY, pts])

  const area = computed.area
  const line = computed.line
  const stats = pickStats(report)
  const summaryText = report.summary.trim() ? report.summary : '（无摘要）'
  const pseudoText = report.pseudoCode.trim() ? report.pseudoCode : '（空）'
  const explainText = report.interpretation.trim() ? report.interpretation : '（空）'
  const hoverPoint = typeof hoverIdx === 'number' ? (pts[hoverIdx] ?? null) : null
  const hoverXY = typeof hoverIdx === 'number' ? (computed.pointXY[hoverIdx] ?? null) : null
  const tooltipPlacement = hoverXY && hoverXY.y < 72 ? 'below' : 'above'

  const scheduleHoverIndex = (idx: number | null) => {
    hoverPendingIdxRef.current = idx
    if (hoverRafRef.current) return
    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = null
      setHoverIdx((prev) => {
        const next = hoverPendingIdxRef.current
        hoverPendingIdxRef.current = null
        hoverIdxRef.current = next
        return prev === next ? prev : next
      })
    })
  }

  const onChartMouseMove = (e: React.MouseEvent) => {
    if (!pts.length) return
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    const el = chartRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const x01 = clamp01((e.clientX - rect.left) / w)
    const n = pts.length
    if (n <= 1) {
      scheduleHoverIndex(0)
      return
    }

    const step = 1 / (n - 1)
    const eps = 2 / w
    let idx = hoverIdxRef.current
    if (typeof idx !== 'number') idx = Math.round(x01 * (n - 1))
    idx = Math.max(0, Math.min(n - 1, idx))

    while (idx < n - 1 && x01 > (idx + 0.5) * step + eps) idx++
    while (idx > 0 && x01 < (idx - 0.5) * step - eps) idx--

    scheduleHoverIndex(idx)
  }

  const onChartMouseLeave = () => {
    if (leaveTimerRef.current) return
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null
      scheduleHoverIndex(null)
    }, 140)
  }

  return (
    <div className="bioWrap">
      <div className="bioHeader">
        <div className="bioTitle">
          <span className="bioDot" />
          <span>{report.title}</span>
          <span className="bioBadge">内测</span>
        </div>
        <div className="bioSub">意识-硬件桥接接口</div>
      </div>

      <div className="bioGrid">
        {stats.map((s) => (
          <div key={s.label} className="bioStat">
            <div className="bioStatLabel">{s.label}</div>
            <div className="bioStatValue">
              {s.unit === '%' ? `${s.value}%` : `${s.value}${s.unit}`}
            </div>
            <div className="bioStatNote">{s.note}</div>
          </div>
        ))}
      </div>

      <div className="bioChart">
        <div className="bioChartTitle">{report.chartTitle}</div>
        <div ref={chartRef} className="bioChartCanvas" onMouseMove={onChartMouseMove} onMouseLeave={onChartMouseLeave}>
          <svg viewBox={`0 0 ${width} ${height}`} className="bioSvg" role="img" aria-label={report.chartTitle}>
            <defs>
              <linearGradient id="bioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(34,197,94,0.28)" />
                <stop offset="100%" stopColor="rgba(34,197,94,0)" />
              </linearGradient>
            </defs>

            <g key={props.callKey} className="bioChartAnim">
              <path d={area} fill="url(#bioFill)" className="bioArea" />
              <path d={line} fill="none" className="bioLine" strokeWidth="2" pathLength="1000" />
            </g>

            <g className="bioPoints">
              {computed.pointXY.map((xy, idx) => (
                <g key={`${pts[idx]?.t ?? idx}`}>
                  <circle cx={xy.x} cy={xy.y} r="2.8" className={hoverIdx === idx ? 'bioPoint bioPointOn' : 'bioPoint'} />
                </g>
              ))}
            </g>

            {pts.length > 0 ? (
              <g>
                <text
                  x={padX}
                  y={height - 6}
                  fill="rgba(34,197,94,0.55)"
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                >
                  {pts[0]?.t ?? ''}
                </text>
                <text
                  x={width - padX}
                  y={height - 6}
                  textAnchor="end"
                  fill="rgba(34,197,94,0.55)"
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                >
                  {pts[pts.length - 1]?.t ?? ''}
                </text>
              </g>
            ) : null}
          </svg>

          {hoverPoint && hoverXY ? (
            <div className="bioHoverOverlay">
              <div className="bioHoverLine" style={{ left: `${(hoverXY.x / width) * 100}%` }} />
              <div className="bioHoverDot" style={{ left: `${(hoverXY.x / width) * 100}%`, top: `${(hoverXY.y / height) * 100}%` }} />
            </div>
          ) : null}

          {hoverPoint && hoverXY ? (
            <div
              className={tooltipPlacement === 'below' ? 'bioTooltip bioTooltipBelow' : 'bioTooltip bioTooltipAbove'}
              style={{
                left: `${(hoverXY.x / width) * 100}%`,
                top: `${(hoverXY.y / height) * 100}%`,
              }}
            >
              <div className="bioTooltipTitle">{hoverPoint.t}</div>
              <div className="bioTooltipValue">负载 {hoverPoint.value}%</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bioTerminal">
        <div className="bioTerminalBar">
          <span className="bioLed red" />
          <span className="bioLed yellow" />
          <span className="bioLed green" />
          <span className="bioPath">bio-kernel@localhost:~/compile</span>
        </div>
        <div className="bioTerminalBody">
          <div className="bioSummary">{summaryText}</div>
          <div className="bioTerminalSectionTitle">伪代码编译日志</div>
          <pre className="bioCode">
            <code>{pseudoText}</code>
          </pre>
          <div className="bioTerminalSectionTitle">解释</div>
          <div className="bioExplain">{explainText}</div>
        </div>
      </div>
    </div>
  )
}
