export interface ChimeNote {
  delay: number
  duration: number
  frequency: number
}

export const ROUND_COMPLETE_CHIME: ChimeNote[] = [
  { delay: 0, duration: 0.2, frequency: 659.25 },
  { delay: 0.18, duration: 0.22, frequency: 783.99 },
  { delay: 0.38, duration: 0.42, frequency: 1046.5 },
]

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext
  if (!AudioContextClass) return null
  audioContext ??= new AudioContextClass()
  return audioContext
}

export async function prepareRoundCompleteSound(): Promise<boolean> {
  try {
    const context = getAudioContext()
    if (!context) return false
    if (context.state === 'suspended') await context.resume()
    return context.state === 'running'
  } catch {
    return false
  }
}

export async function playRoundCompleteSound(): Promise<boolean> {
  const ready = await prepareRoundCompleteSound()
  const context = audioContext
  if (!ready || !context) return false

  const baseTime = context.currentTime + 0.02
  ROUND_COMPLETE_CHIME.forEach((note) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startsAt = baseTime + note.delay
    const endsAt = startsAt + note.duration

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(note.frequency, startsAt)
    gain.gain.setValueAtTime(0.0001, startsAt)
    gain.gain.exponentialRampToValueAtTime(0.16, startsAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startsAt)
    oscillator.stop(endsAt + 0.03)
  })

  return true
}
