/**
 * Record narration: the microphone is recorded in one segment per slide while
 * the show runs (a revisited slide keeps its latest take), and each segment is
 * turned into 16-bit mono WAV, which PowerPoint plays as well as this app.
 */

/** what a decoded clip needs to offer (AudioBuffer's shape, so tests need no Web Audio) */
export interface PcmSource {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

/** narration is speech: 22.05 kHz mono keeps it clear at about 2.6 MB a minute */
export const NARRATION_RATE = 22050

/** Mix down to mono, resample linearly and write a 16-bit PCM WAV file. */
export function encodeWav(src: PcmSource, targetRate = NARRATION_RATE): Uint8Array {
  const channels = Math.max(1, src.numberOfChannels)
  const mono = new Float32Array(src.length)
  for (let c = 0; c < channels; c++) {
    const data = src.getChannelData(c)
    for (let i = 0; i < src.length; i++) mono[i]! += (data[i] ?? 0) / channels
  }
  const rate = Math.min(targetRate, src.sampleRate) || targetRate
  const ratio = src.sampleRate / rate
  const frames = Math.max(0, Math.floor(src.length / ratio))
  const out = new Uint8Array(44 + frames * 2)
  const view = new DataView(out.buffer)
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + frames * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, frames * 2, true)
  for (let i = 0; i < frames; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, src.length - 1)
    const f = pos - i0
    const s = Math.max(-1, Math.min(1, (mono[i0] ?? 0) * (1 - f) + (mono[i1] ?? 0) * f))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return out
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(s)
}

/** the minimal MediaRecorder surface used here (structural, for tests) */
export interface SegmentRecorder {
  start(): void
  stop(): void
  ondataavailable: ((e: { data: Blob }) => void) | null
  onstop: (() => void) | null
}

/**
 * One recording segment per slide. switchTo() closes the running segment
 * and starts the next; finish() closes the last and hands back the latest
 * take for each slide with how long it ran.
 */
export class NarrationSession {
  private current: { slide: number; startedAt: number; done: Promise<Blob> } | null = null
  private readonly takes = new Map<number, { blob: Promise<Blob>; ms: number }>()

  constructor(
    private readonly makeRecorder: () => SegmentRecorder,
    private readonly now: () => number = () => Date.now(),
  ) {}

  switchTo(slide: number): void {
    if (this.current?.slide === slide) return
    this.close()
    const rec = this.makeRecorder()
    const chunks: Blob[] = []
    const done = new Promise<Blob>((resolve) => {
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => resolve(new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' }))
    })
    rec.start()
    this.current = { slide, startedAt: this.now(), done }
    this.stopCurrent = () => rec.stop()
  }

  private stopCurrent: (() => void) | null = null

  private close(): void {
    if (!this.current) return
    const { slide, startedAt, done } = this.current
    this.stopCurrent?.()
    this.stopCurrent = null
    this.takes.set(slide, { blob: done, ms: Math.max(0, this.now() - startedAt) })
    this.current = null
  }

  /** the latest take per slide (slides visited for under half a second are dropped) */
  async finish(): Promise<Array<{ slideIndex: number; blob: Blob; ms: number }>> {
    this.close()
    const out: Array<{ slideIndex: number; blob: Blob; ms: number }> = []
    for (const [slideIndex, take] of [...this.takes.entries()].sort((a, b) => a[0] - b[0])) {
      if (take.ms < 500) continue
      const blob = await take.blob
      if (blob.size > 0) out.push({ slideIndex, blob, ms: take.ms })
    }
    return out
  }
}
