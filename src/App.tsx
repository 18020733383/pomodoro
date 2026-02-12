import './App.css'
import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BioKernelPanel } from './components/BioKernelPanel'
import { normalizeEvents, usePomodoro } from './hooks/usePomodoro'
import { useKvState } from './hooks/useKvState'
import { useWakeLock } from './hooks/useWakeLock'
import { clampInt, formatDateTime, formatDurationSec } from './lib/time'
import { requestMentorReview } from './lib/newapi'
import { newHardwareCallId, requestHardwareReport } from './lib/hardwareAi'
import { nowIso, uuid } from './lib/storage'
import type { AppSettings, DdlEvent, DdlStatus, HardwareCall } from './types'
import { warmupAlarm } from './lib/alarm'

function App() {
  const {
    settings,
    setSettings,
    events,
    setEvents,
    addEvent,
    removeEvent,
    records,
    setRecords,
    active,
    setActive,
    alarm,
    setAlarm,
    remainingSec,
    isRunning,
    start,
    stop,
    finish,
    acknowledgeAlarm,
    replayAlarm,
    deleteRecord,
    clearRecords,
    loading: pomodoroLoading,
  } = usePomodoro()

  useWakeLock(Boolean(active))

  const [eventName, setEventName] = useState('摸鱼')
  const [eventDraft, setEventDraft] = useState('')
  const [durationH, setDurationH] = useState(0)
  const [durationM, setDurationM] = useState(25)
  const [durationS, setDurationS] = useState(0)
  const [aiKeyDraft, setAiKeyDraft] = useState('')
  const [aiReview, setAiReview] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string>('')
  const [hwCalls, setHwCalls, hwLoadingState] = useKvState<HardwareCall[]>('pomodoro:hardwareCalls', [])
  const [hwSelectedId, setHwSelectedId] = useState<string>('')
  const [hwLoading, setHwLoading] = useState(false)
  const [hwError, setHwError] = useState<string>('')
  const [ddlEvents, setDdlEvents, ddlLoadingState] = useKvState<DdlEvent[]>('pomodoro:ddlEvents', [])
  const [ddlTitleDraft, setDdlTitleDraft] = useState('')
  const [ddlAtDraft, setDdlAtDraft] = useState('')
  const [ddlStatusDraft, setDdlStatusDraft] = useState<DdlStatus>('not_started')
  const [dataOk, setDataOk] = useState<string>('')
  const [dataError, setDataError] = useState<string>('')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const loading = pomodoroLoading || hwLoadingState || ddlLoadingState

  const toDatetimeLocal = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mi = pad(d.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
  }

  const fromDatetimeLocal = (value: string) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString()
  }

  // 同步 settings 变化到本地 UI 状态
  useEffect(() => {
    if (pomodoroLoading) return
    setDurationH(Math.floor(settings.defaultDurationSec / 3600))
    setDurationM(Math.floor((settings.defaultDurationSec % 3600) / 60))
    setDurationS(settings.defaultDurationSec % 60)
    setAiKeyDraft(settings.ai?.apiKey ?? '')
  }, [settings, pomodoroLoading])

  useEffect(() => {
    if (pomodoroLoading) return
    if (!events.some((e) => e.name === eventName)) {
      setEventName(events[0]?.name ?? '摸鱼')
    }
  }, [eventName, events, pomodoroLoading])



  const durationSec = useMemo(() => {
    const h = clampInt(durationH, 0, 24)
    const m = clampInt(durationM, 0, 59)
    const s = clampInt(durationS, 0, 59)
    const total = h * 3600 + m * 60 + s
    return Math.max(1, total)
  }, [durationH, durationM, durationS])
  const remainingLabel = useMemo(() => formatDurationSec(remainingSec), [remainingSec])

  const runningTitle = alarm ? `响铃中：${alarm.eventName}` : active ? `进行中：${active.eventName}` : '未开始'

  const onStart = async () => {
    const name = (eventName || '未命名').trim()
    setSettings((prev: AppSettings) => ({ ...prev, defaultDurationSec: durationSec }), true)
    await warmupAlarm()
    await start(name, durationSec)
  }

  const onAddEvent = () => {
    const name = eventDraft.trim()
    if (!name) return
    addEvent(name)
    setEventName(name)
    setEventDraft('')
  }

  const toDateOnly = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  const [recordsDay, setRecordsDay] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return toDateOnly(d)
  })

  const recordsDayStartMs = useMemo(() => {
    const d = new Date(`${recordsDay}T00:00:00`)
    return Number.isNaN(d.getTime()) ? 0 : d.getTime()
  }, [recordsDay])

  const recordsDayEndMs = useMemo(() => {
    const d = new Date(recordsDayStartMs)
    d.setDate(d.getDate() + 1)
    return d.getTime()
  }, [recordsDayStartMs])

  const dayRecords = useMemo(() => {
    return records.filter((r) => {
      const t = new Date(r.startedAt).getTime()
      if (Number.isNaN(t)) return false
      return t >= recordsDayStartMs && t < recordsDayEndMs
    })
  }, [records, recordsDayEndMs, recordsDayStartMs])

  const shiftRecordsDay = (deltaDays: number) => {
    const d = new Date(recordsDayStartMs || Date.now())
    d.setDate(d.getDate() + deltaDays)
    d.setHours(0, 0, 0, 0)
    setRecordsDay(toDateOnly(d))
  }

  const selectedHwCall = useMemo(() => {
    if (!hwCalls.length) return null
    if (!hwSelectedId) return hwCalls[0] ?? null
    return hwCalls.find((c) => c.id === hwSelectedId) ?? hwCalls[0] ?? null
  }, [hwCalls, hwSelectedId])

  const onSaveAiKey = () => {
    setSettings((prev: AppSettings) => ({
      ...prev,
      ai: {
        ...(prev.ai ?? { baseUrl: 'https://x666.me', model: 'gemini-3-flash-preview' }),
        apiKey: aiKeyDraft.trim() || undefined,
      },
    }), true)
  }

  const onMentorReview = async () => {
    setAiError('')
    setAiReview('')
    setAiLoading(true)
    try {
      const content = await requestMentorReview({
        settings: { baseUrl: settings.ai?.baseUrl ?? 'https://x666.me', model: settings.ai?.model ?? 'gemini-3-flash-preview', apiKey: aiKeyDraft },
        records: dayRecords,
        ddlEvents,
      })
      setAiReview(content)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiLoading(false)
    }
  }

  const onHardwareTranslate = async () => {
    setHwError('')
    setHwLoading(true)
    try {
      const report = await requestHardwareReport({
        settings: { baseUrl: settings.ai?.baseUrl ?? 'https://x666.me', model: settings.ai?.model ?? 'gemini-3-flash-preview', apiKey: aiKeyDraft },
        records: dayRecords,
      })
      const call: HardwareCall = {
        id: newHardwareCallId(),
        timestamp: Date.now(),
        sourceRecordsCount: dayRecords.length,
        report,
      }
      setHwCalls((prev: HardwareCall[]) => [call, ...prev].slice(0, 20), true)
      setHwSelectedId(call.id)
    } catch (e) {
      setHwError(e instanceof Error ? e.message : String(e))
    } finally {
      setHwLoading(false)
    }
  }

  const downloadJson = (filename: string, value: unknown) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const onExportJson = async () => {
    setDataOk('')
    setDataError('')
    const ts = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const filename = `pomodoro-export-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`
    try {
      const res = await fetch('/api/snapshot', { method: 'GET' })
      if (!res.ok) throw new Error(`snapshot_get_failed_${res.status}`)
      const body = (await res.json()) as unknown
      downloadJson(filename, body)
      setDataOk('已导出 JSON（云端）')
    } catch {
      downloadJson(filename, {
        version: 1,
        exportedAt: ts.toISOString(),
        data: {
          'pomodoro:settings': settings,
          'pomodoro:events': events,
          'pomodoro:records': records,
          'pomodoro:active': active,
          'pomodoro:alarm': alarm,
          'pomodoro:hardwareCalls': hwCalls,
          'pomodoro:ddlEvents': ddlEvents,
        },
      })
      setDataOk('已导出 JSON（本地）')
    }
  }

  const onPickImportFile = () => {
    setDataOk('')
    setDataError('')
    importInputRef.current?.click()
  }

  const importFromJsonText = async (text: string) => {
    const parsed = JSON.parse(text) as unknown
    const raw = (parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : parsed) as unknown
    if (!raw || typeof raw !== 'object') throw new Error('JSON 内容不合法')
    const data = raw as Record<string, unknown>

    const nextSettings = data['pomodoro:settings']
    const nextEvents = data['pomodoro:events']
    const nextRecords = data['pomodoro:records']
    const nextActive = data['pomodoro:active']
    const nextAlarm = data['pomodoro:alarm']
    const nextHwCalls = data['pomodoro:hardwareCalls']
    const nextDdlEvents = data['pomodoro:ddlEvents']

    if (nextSettings !== undefined) setSettings(nextSettings as typeof settings)
    if (nextEvents !== undefined) setEvents(normalizeEvents(Array.isArray(nextEvents) ? (nextEvents as typeof events) : []))
    if (nextRecords !== undefined) setRecords(Array.isArray(nextRecords) ? (nextRecords as typeof records) : [])
    if (nextActive !== undefined) setActive((nextActive as typeof active) ?? null)
    if (nextAlarm !== undefined) setAlarm((nextAlarm as typeof alarm) ?? null)
    if (nextHwCalls !== undefined) setHwCalls(Array.isArray(nextHwCalls) ? (nextHwCalls as typeof hwCalls) : [])
    if (nextDdlEvents !== undefined) setDdlEvents(Array.isArray(nextDdlEvents) ? (nextDdlEvents as typeof ddlEvents) : [])

    const res = await fetch('/api/snapshot', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }),
    })
    if (!res.ok) throw new Error(`snapshot_put_failed_${res.status}`)
  }

  const onImportChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setDataOk('')
    setDataError('')
    try {
      const text = await file.text()
      await importFromJsonText(text)
      setDataOk('已导入 JSON')
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err))
    }
  }

  const onClearAllData = async () => {
    if (!window.confirm('确定要清空云端所有数据吗？此操作不可撤销，且会刷新页面。')) return
    try {
      const res = await fetch('/api/snapshot', {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`delete_failed_${res.status}`)
      window.location.reload()
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err))
    }
  }

  const ddlRows = useMemo(() => {
    const copy = [...ddlEvents]
    copy.sort((a, b) => (a.ddlAt ?? '').localeCompare(b.ddlAt ?? ''))
    return copy
  }, [ddlEvents])

  const onAddDdlEvent = () => {
    const title = ddlTitleDraft.trim()
    const ddlIso = fromDatetimeLocal(ddlAtDraft)
    if (!title || !ddlIso) return
    const item: DdlEvent = { id: uuid(), title, ddlAt: ddlIso, status: ddlStatusDraft, createdAt: nowIso() }
    setDdlEvents((prev: DdlEvent[]) => [item, ...prev], true)
    setDdlTitleDraft('')
    setDdlAtDraft('')
    setDdlStatusDraft('not_started')
  }

  if (loading) {
    return (
      <div className="app loadingContainer">
        <div className="loadingText">同步数据中...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="title">
          <div className="h1">番茄钟</div>
          <div className="sub">{runningTitle}</div>
        </div>
        <div className="status">
          <div className="time">{isRunning ? remainingLabel : formatDurationSec(durationSec)}</div>
          <div className="hint">{isRunning ? '倒计时' : '设定时长'}</div>
        </div>
      </header>

      <section className="panel">
        <div className="row">
          <label className="label">事件</label>
          <select className="control" value={eventName} disabled={Boolean(active)} onChange={(e) => setEventName(e.target.value)}>
            {events.map((e) => (
              <option key={e.name} value={e.name}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <label className="label">新增事件</label>
          <input
            className="control"
            value={eventDraft}
            disabled={Boolean(active)}
            placeholder="比如：写论文 / 刷题 / 摸鱼"
            onChange={(e) => setEventDraft(e.target.value)}
          />
          <button className="btn" disabled={Boolean(active) || !eventDraft.trim()} onClick={onAddEvent}>
            添加
          </button>
        </div>

        <div className="row">
          <label className="label">时长</label>
          <input
            className="control small"
            type="number"
            min={0}
            max={24}
            value={durationH}
            disabled={Boolean(active)}
            onChange={(e) => setDurationH(clampInt(Number(e.target.value), 0, 24))}
          />
          <span className="sep">:</span>
          <input
            className="control small"
            type="number"
            min={0}
            max={59}
            value={durationM}
            disabled={Boolean(active)}
            onChange={(e) => setDurationM(clampInt(Number(e.target.value), 0, 59))}
          />
          <span className="sep">:</span>
          <input
            className="control small"
            type="number"
            min={0}
            max={59}
            value={durationS}
            disabled={Boolean(active)}
            onChange={(e) => setDurationS(clampInt(Number(e.target.value), 0, 59))}
          />
          <button
            className="btn"
            disabled={Boolean(active)}
            onClick={() => {
              setDurationH(0)
              setDurationM(15)
              setDurationS(0)
            }}
          >
            00:15:00
          </button>
          <button
            className="btn"
            disabled={Boolean(active)}
            onClick={() => {
              setDurationH(0)
              setDurationM(25)
              setDurationS(0)
            }}
          >
            00:25:00
          </button>
          <button
            className="btn"
            disabled={Boolean(active)}
            onClick={() => {
              setDurationH(0)
              setDurationM(50)
              setDurationS(0)
            }}
          >
            00:50:00
          </button>
        </div>

        <div className="row">
          <label className="label">响铃</label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.enableBeep}
              onChange={(e) => setSettings((prev: AppSettings) => ({ ...prev, enableBeep: e.target.checked }), true)}
            />
            <span>哔哔声</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.enableBuzzerMp3}
              onChange={(e) => setSettings((prev: AppSettings) => ({ ...prev, enableBuzzerMp3: e.target.checked }), true)}
            />
            <span>猛铃声(buzzer.mp3)</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.enableSpeech}
              onChange={(e) => setSettings((prev: AppSettings) => ({ ...prev, enableSpeech: e.target.checked }), true)}
            />
            <span>语音毒舌</span>
          </label>
        </div>

        <div className="row actions">
          <button className="btn primary" disabled={Boolean(active) || Boolean(alarm)} onClick={onStart}>
            开始
          </button>
          <button className="btn danger" disabled={!active} onClick={stop}>
            停止
          </button>
          <button className="btn" disabled={!active} onClick={() => void finish()}>
            立即结束并响
          </button>
          <button className="btn danger" disabled={!alarm} onClick={acknowledgeAlarm}>
            结束铃声
          </button>
        </div>

        {alarm ? (
          <div className="note alarmNote">
            <div className="alarmTitle">到点了</div>
            <div className="alarmBody">{alarm.body}</div>
            <div className="alarmActions">
              <button className="btn" onClick={() => void replayAlarm()}>
                重新播放
              </button>
              <button className="btn danger" onClick={acknowledgeAlarm}>
                结束
              </button>
            </div>
          </div>
        ) : null}

        <div className="row minor">
          <button className="link" disabled={Boolean(active)} onClick={() => removeEvent(eventName)}>
            删除当前事件
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="tableHeader">
          <div className="h2">事件 DDL</div>
        </div>

        <div className="row">
          <label className="label">新增</label>
          <input className="control" value={ddlTitleDraft} placeholder="比如：论文初稿 / 项目验收" onChange={(e) => setDdlTitleDraft(e.target.value)} />
          <input className="control" type="datetime-local" value={ddlAtDraft} onChange={(e) => setDdlAtDraft(e.target.value)} />
          <select className="control small" value={ddlStatusDraft} onChange={(e) => setDdlStatusDraft(e.target.value as DdlStatus)}>
            <option value="not_started">还没到</option>
            <option value="ongoing">进行中</option>
            <option value="done">已结束</option>
          </select>
          <button className="btn" onClick={onAddDdlEvent} disabled={!ddlTitleDraft.trim() || !ddlAtDraft}>
            添加
          </button>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>标题</th>
                <th>DDL</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {ddlRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    还没有 DDL 事件。
                  </td>
                </tr>
              ) : (
                ddlRows.map((it) => (
                  <tr key={it.id}>
                    <td>{it.title}</td>
                    <td>
                      <input
                        className="control"
                        type="datetime-local"
                        value={toDatetimeLocal(it.ddlAt)}
                        onChange={(e) => {
                          const nextIso = fromDatetimeLocal(e.target.value)
                          if (!nextIso) return
                          setDdlEvents((prev: DdlEvent[]) => prev.map((x) => (x.id === it.id ? { ...x, ddlAt: nextIso } : x)), true)
                        }}
                      />
                    </td>
                    <td>
                      <select
                        className="control small"
                        value={it.status}
                        onChange={(e) => {
                          const next = e.target.value as DdlStatus
                          setDdlEvents((prev: DdlEvent[]) => prev.map((x) => (x.id === it.id ? { ...x, status: next } : x)), true)
                        }}
                      >
                        <option value="not_started">还没到</option>
                        <option value="ongoing">进行中</option>
                        <option value="done">已结束</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn smallBtn" onClick={() => setDdlEvents((prev: DdlEvent[]) => prev.filter((x) => x.id !== it.id), true)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="note">
          当前：{ddlRows.filter((x) => x.status === 'ongoing').length} 进行中 / {ddlRows.filter((x) => x.status === 'not_started').length} 未到 /{' '}
          {ddlRows.filter((x) => x.status === 'done').length} 已结束
        </div>
      </section>

      <section className="panel">
        <div className="tableHeader">
          <div className="h2">记录</div>
          <div className="row actions" style={{ margin: 0 }}>
            <button className="btn" onClick={() => shiftRecordsDay(-1)}>
              ←
            </button>
            <input className="control small" type="date" value={recordsDay} onChange={(e) => setRecordsDay(e.target.value)} />
            <button className="btn" onClick={() => shiftRecordsDay(1)}>
              →
            </button>
          </div>
          <button className="btn" disabled={Boolean(active)} onClick={clearRecords}>
            清空记录
          </button>
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>名称</th>
                <th>定时器</th>
                <th>开始日期与时间</th>
                <th>停止日期与时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {dayRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    当天还没有记录。开始一轮番茄钟，让时间对得起你。
                  </td>
                </tr>
              ) : (
                dayRecords.map((r, idx) => (
                  <tr key={r.id} className={r.stoppedAt ? '' : 'running'}>
                    <td>{idx + 1}</td>
                    <td>{r.eventName}</td>
                    <td>{formatDurationSec(r.durationSec)}</td>
                    <td>{formatDateTime(r.startedAt)}</td>
                    <td>{r.stoppedAt ? formatDateTime(r.stoppedAt) : '—'}</td>
                    <td>
                      <button className="btn smallBtn" disabled={!r.stoppedAt} onClick={() => deleteRecord(r.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="h2">AI 毒舌导师</div>
        <div className="row">
          <label className="label">接口地址</label>
          <input
            className="control"
            value={settings.ai?.baseUrl ?? ''}
            onChange={(e) =>
              setSettings((prev: AppSettings) => ({
                ...prev,
                ai: { ...(prev.ai ?? { baseUrl: 'https://x666.me', model: 'gemini-3-flash-preview' }), baseUrl: e.target.value },
              }), true)
            }
          />
        </div>
        <div className="row">
          <label className="label">模型</label>
          <input
            className="control"
            value={settings.ai?.model ?? ''}
            onChange={(e) =>
              setSettings((prev: AppSettings) => ({
                ...prev,
                ai: { ...(prev.ai ?? { baseUrl: 'https://x666.me', model: 'gemini-3-flash-preview' }), model: e.target.value },
              }), true)
            }
          />
        </div>
        <div className="row">
          <label className="label">API 密钥</label>
          <input className="control" type="password" value={aiKeyDraft} onChange={(e) => setAiKeyDraft(e.target.value)} />
          <button className="btn" onClick={onSaveAiKey} disabled={aiLoading}>
            保存
          </button>
          <button className="btn primary" onClick={() => void onMentorReview()} disabled={aiLoading || !aiKeyDraft.trim()}>
            {aiLoading ? '点评中…' : '生成点评'}
          </button>
        </div>
        {aiError ? (
          <div className="note error">{aiError}</div>
        ) : aiReview ? (
          <pre className="note">{aiReview}</pre>
        ) : (
          <div className="note">会把你最近的番茄钟记录丢给导师，挨骂并拿到可执行建议。</div>
        )}
      </section>

      <section className="panel bioPanel">
        <div className="tableHeader">
          <div className="h2">硬件参数</div>
          <div className="bioActions">
            <select className="control bioSelect" value={hwSelectedId} onChange={(e) => setHwSelectedId(e.target.value)}>
              <option value="">最新</option>
              {hwCalls.map((c) => (
                <option key={c.id} value={c.id}>
                  {new Date(c.timestamp).toLocaleTimeString()} / {c.sourceRecordsCount} 条
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={() => void onHardwareTranslate()} disabled={hwLoading || !aiKeyDraft.trim() || dayRecords.length === 0}>
              {hwLoading ? '编译中…' : '翻译成硬件参数'}
            </button>
          </div>
        </div>

        {hwError ? <div className="note error">{hwError}</div> : null}
        <BioKernelPanel call={selectedHwCall} />
      </section>

      <section className="panel">
        <div className="h2">数据</div>
        <div className="row actions">
          <button className="btn" onClick={onExportJson}>
            导出 JSON
          </button>
          <button className="btn" disabled={Boolean(active) || Boolean(alarm)} onClick={onPickImportFile}>
            导入 JSON
          </button>
          <button className="btn danger" disabled={Boolean(active) || Boolean(alarm)} onClick={onClearAllData}>
            清空所有数据
          </button>
          <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onImportChange} />
        </div>
        {dataError ? <div className="note error">{dataError}</div> : dataOk ? <div className="note">{dataOk}</div> : <div className="note">导入或清空会影响云端数据。</div>}
      </section>
    </div>
  )
}

export default App
