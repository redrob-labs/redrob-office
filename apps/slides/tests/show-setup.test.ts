import { describe, expect, it } from 'vitest'
import { nextPosition, showSetup } from '../src/renderer/slideshow-utils'
import { NarrationSession, encodeWav, type SegmentRecorder } from '../src/renderer/narration'

const base = { type: 'speaker' as const, loop: false, useTimings: true, showNarration: true, range: { kind: 'all' as const } }
const deck = (n: number, hidden: number[] = []) => Array.from({ length: n }, (_, i) => ({ hidden: hidden.includes(i) }))

describe('showSetup', () => {
  it('plays a slide range from the start, skipping hidden slides', () => {
    const r = showSetup({ ...base, range: { kind: 'slides', from: 2, to: 4 } }, [], deck(5, [2]), true, 0)
    expect(r.startAt).toBe(1)
    expect(r.customOrder).toEqual([1, 3])
  })

  it('ignores the range for a show from the current slide', () => {
    const r = showSetup({ ...base, range: { kind: 'slides', from: 2, to: 3 } }, [], deck(5), false, 4)
    expect(r).toMatchObject({ startAt: 4 })
    expect(r.customOrder).toBeUndefined()
  })

  it('uses timings only when asked, and a kiosk always loops on timings', () => {
    const times = [1000, null]
    expect(showSetup({ ...base, useTimings: false }, times, deck(2), true, 0).playback).toEqual({
      loop: false,
      kiosk: false,
      advanceMs: null,
      showNarration: true,
    })
    expect(showSetup({ ...base, type: 'kiosk', useTimings: false }, times, deck(2), true, 0).playback).toEqual({
      loop: true,
      kiosk: true,
      advanceMs: times,
      showNarration: true,
    })
  })

  it('wraps to the first slide only when looping', () => {
    expect(nextPosition(0, 3, false)).toBe(1)
    expect(nextPosition(2, 3, false)).toBe('end')
    expect(nextPosition(2, 3, true)).toBe(0)
    expect(nextPosition(0, 0, true)).toBe('end')
  })
})

describe('narration', () => {
  it('writes a 16-bit mono WAV, mixed down and resampled', () => {
    const left = new Float32Array(44100).fill(0.5)
    const right = new Float32Array(44100).fill(-0.5)
    const wav = encodeWav({ sampleRate: 44100, numberOfChannels: 2, length: 44100, getChannelData: (c) => (c ? right : left) })
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(22050)
    expect(view.getUint32(40, true)).toBe(22050 * 2)
    expect(view.getInt16(44, true)).toBe(0)
  })

  it('keeps the latest take per slide with its duration', async () => {
    let clock = 0
    const made: SegmentRecorder[] = []
    const session = new NarrationSession(() => {
      const rec: SegmentRecorder = {
        ondataavailable: null,
        onstop: null,
        start() {},
        stop() {
          rec.ondataavailable?.({ data: new Blob([`take${made.indexOf(rec)}`]) })
          rec.onstop?.()
        },
      }
      made.push(rec)
      return rec
    }, () => clock)
    session.switchTo(0)
    clock = 2000
    session.switchTo(1)
    clock = 2200 // a glance at slide 2: dropped
    session.switchTo(0)
    clock = 5200
    const takes = await session.finish()
    expect(takes.map((t) => [t.slideIndex, t.ms])).toEqual([[0, 3000]])
    expect(await takes[0]!.blob.text()).toBe('take2')
  })
})
