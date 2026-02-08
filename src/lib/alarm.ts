export type AlarmOptions = {
  title: string
  body: string
  vibrate?: boolean
  beep?: boolean
  speech?: boolean
}

export type AlarmLoopOptions = AlarmOptions & {
  mp3?: boolean
}

export type AlarmLoopHandle = {
  stop: () => void
  replay: () => Promise<boolean>
  isPlaying: () => boolean
}

export async function ensureAlarmPermissions(): Promise<void> {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'default') return
  try {
    await Notification.requestPermission()
  } catch {
    return
  }
}

let sharedAudioContext: AudioContext | null = null

function getAudioContextCtor(): typeof AudioContext | undefined {
  const ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return ctor
}

async function getOrCreateAudioContext(): Promise<AudioContext | null> {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return null
  if (sharedAudioContext) return sharedAudioContext
  try {
    const ctx = new Ctor()
    sharedAudioContext = ctx
    window.addEventListener(
      'pagehide',
      () => {
        const current = sharedAudioContext
        sharedAudioContext = null
        if (current && current.state !== 'closed') void current.close()
      },
      { once: true },
    )
    await ctx.resume()
    return ctx
  } catch {
    sharedAudioContext = null
    return null
  }
}

async function warmupAudio(): Promise<void> {
  try {
    const ctx = await getOrCreateAudioContext()
    if (!ctx) return
    const gain = ctx.createGain()
    gain.gain.value = 0.001
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 880
    osc.connect(gain)
    const startAt = ctx.currentTime + 0.01
    osc.start(startAt)
    osc.stop(startAt + 0.03)
    await new Promise((r) => setTimeout(r, 70))
  } catch {
    return
  }
}

let sharedBuzzerAudio: HTMLAudioElement | null = null

function getOrCreateBuzzerAudio(): HTMLAudioElement | null {
  if (sharedBuzzerAudio) return sharedBuzzerAudio
  try {
    const audio = new Audio('/buzzer.mp3')
    audio.preload = 'auto'
    audio.loop = true
    audio.volume = 1
    audio.muted = false
    ;(audio as unknown as { playsInline?: boolean }).playsInline = true
    sharedBuzzerAudio = audio
    window.addEventListener(
      'pagehide',
      () => {
        const current = sharedBuzzerAudio
        sharedBuzzerAudio = null
        if (current) {
          current.pause()
          current.currentTime = 0
        }
      },
      { once: true },
    )
    return audio
  } catch {
    sharedBuzzerAudio = null
    return null
  }
}

async function tryPlayBuzzerLoop(): Promise<boolean> {
  const audio = getOrCreateBuzzerAudio()
  if (!audio) return false
  try {
    audio.loop = true
    await audio.play()
    return true
  } catch {
    return false
  }
}

function stopBuzzer(): void {
  const audio = sharedBuzzerAudio
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}

async function warmupBuzzer(): Promise<void> {
  const audio = getOrCreateBuzzerAudio()
  if (!audio) return
  const prevMuted = audio.muted
  const prevVolume = audio.volume
  audio.muted = true
  audio.volume = 0
  try {
    await audio.play()
    await new Promise((r) => setTimeout(r, 50))
  } catch {
    return
  } finally {
    audio.pause()
    audio.currentTime = 0
    audio.muted = prevMuted
    audio.volume = prevVolume
  }
}

export async function warmupAlarm(): Promise<void> {
  await Promise.allSettled([ensureAlarmPermissions(), warmupAudio(), warmupBuzzer()])
}

function maybeVibrate(): void {
  if (!('vibrate' in navigator)) return
  navigator.vibrate([250, 150, 250, 150, 400])
}

async function showNotification(title: string, body: string): Promise<void> {
  if (!('Notification' in window)) return
  await ensureAlarmPermissions()
  if (Notification.permission !== 'granted') return

  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) {
    await reg.showNotification(title, {
      body,
      tag: 'pomodoro-alarm',
    })
    return
  }

  new Notification(title, { body, tag: 'pomodoro-alarm' })
}

async function playBeep(): Promise<void> {
  const ctx = await getOrCreateAudioContext()
  if (!ctx) return
  await ctx.resume()

  const gain = ctx.createGain()
  gain.gain.value = 0.08
  gain.connect(ctx.destination)

  const beepOnce = (freq: number, durationMs: number, when: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    osc.start(when)
    osc.stop(when + durationMs / 1000)
  }

  const startAt = ctx.currentTime + 0.02
  beepOnce(880, 180, startAt)
  beepOnce(880, 180, startAt + 0.35)
  beepOnce(660, 450, startAt + 0.8)

  await new Promise((r) => setTimeout(r, 1600))
}

function speak(text: string): void {
  if (!('speechSynthesis' in window)) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'zh-CN'
  utter.rate = 1.05
  utter.pitch = 1
  utter.volume = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

export async function triggerAlarm(options: AlarmOptions): Promise<void> {
  if (options.vibrate) maybeVibrate()
  await showNotification(options.title, options.body)

  const speechText = options.body

  const results = await Promise.allSettled([
    options.beep ? playBeep() : Promise.resolve(),
    options.speech ? Promise.resolve().then(() => speak(speechText)) : Promise.resolve(),
  ])

  const allOkOrSkipped = results.every((r) => r.status === 'fulfilled')
  if (!allOkOrSkipped && Notification.permission !== 'granted' && document.visibilityState === 'visible') {
    window.alert(`${options.title}\n\n${options.body}`)
  }
}

export function startAlarmLoop(options: AlarmLoopOptions): AlarmLoopHandle {
  let stopped = false
  let vibrateTimer: number | undefined
  let beepTimer: number | undefined
  let hasStartedAudio = false

  const startOnce = async (): Promise<void> => {
    if (stopped) return
    if (options.vibrate) maybeVibrate()
    await showNotification(options.title, options.body)
    if (options.speech) speak(options.body)

    if (options.mp3) {
      hasStartedAudio = await tryPlayBuzzerLoop()
      return
    }

    if (options.beep) {
      await playBeep()
      hasStartedAudio = true
    }
  }

  void startOnce()

  if (options.vibrate) {
    vibrateTimer = window.setInterval(() => {
      if (stopped) return
      maybeVibrate()
    }, 5000)
  }

  if (!options.mp3 && options.beep) {
    beepTimer = window.setInterval(() => {
      if (stopped) return
      void playBeep()
    }, 2400)
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    if (vibrateTimer) window.clearInterval(vibrateTimer)
    if (beepTimer) window.clearInterval(beepTimer)
    stopBuzzer()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  const replay = async () => {
    if (stopped) return false
    if (options.mp3) {
      const ok = await tryPlayBuzzerLoop()
      hasStartedAudio = hasStartedAudio || ok
      return ok
    }
    if (options.beep) {
      await playBeep()
      hasStartedAudio = true
      return true
    }
    return false
  }

  const isPlaying = () => {
    if (options.mp3) return Boolean(sharedBuzzerAudio && !sharedBuzzerAudio.paused)
    return hasStartedAudio
  }

  return { stop, replay, isPlaying }
}

export function pickToxicLine(eventName: string): string {
  const lines = [
    `别装忙了，「${eventName}」时间到了。`,
    `时间到。你刚才的效率，配得上你的焦虑吗？`,
    `「${eventName}」结束。别自我感动，下一轮继续。`,
    `到点了。拖延不是休息，是慢性自残。`,
    `「${eventName}」时间到。别刷手机了，收工。`,
  ]
  return lines[Math.floor(Math.random() * lines.length)] ?? `「${eventName}」时间到了。`
}
