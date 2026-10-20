export function playMessageTone(): void {
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return
  const audio = new Context()
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = 740
  gain.gain.setValueAtTime(0.0001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.05, audio.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.22)
  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start()
  oscillator.stop(audio.currentTime + 0.24)
  oscillator.onended = () => void audio.close()
}

// Two quiet sine notes, a fifth apart. Peak stays well under a speaking voice.
export const NOTICE_CHIME = {
  peakGain: 0.028,
  notes: [
    { frequency: 523.25, start: 0, duration: 0.32, gain: 0.028 },
    { frequency: 783.99, start: 0.1, duration: 0.34, gain: 0.018 },
  ],
} as const

let sharedAudio: AudioContext | null = null
let chimeArmed = false

function audioContext(): AudioContext | null {
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  if (sharedAudio && sharedAudio.state !== 'closed') return sharedAudio
  try {
    sharedAudio = new Context()
    return sharedAudio
  } catch {
    return null
  }
}

function scheduleChime(audio: AudioContext): void {
  const now = audio.currentTime
  for (const note of NOTICE_CHIME.notes) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = note.frequency
    const start = now + note.start
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(start)
    osc.stop(start + note.duration + 0.02)
  }
}

// A click or keypress lets later toasts play after the browser's autoplay block.
export function armNoticeChime(): void {
  if (chimeArmed || typeof window === 'undefined') return
  chimeArmed = true
  const resume = () => {
    const audio = audioContext()
    if (audio && audio.state === 'suspended') void audio.resume().catch(() => undefined)
  }
  window.addEventListener('pointerdown', resume)
  window.addEventListener('keydown', resume)
}

export function playNoticeChime(): void {
  try {
    armNoticeChime()
    const audio = audioContext()
    if (!audio) return
    if (audio.state === 'suspended') {
      void audio.resume().then(() => {
        if (audio.state === 'running') scheduleChime(audio)
      }).catch(() => undefined)
      return
    }
    scheduleChime(audio)
  } catch {
    // Autoplay or a missing audio device. The toast still shows.
  }
}

export async function desktopNotice(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body })
  } catch {
    // Some browsers block the constructor outside a gesture. The in-app toast still shows.
  }
}
