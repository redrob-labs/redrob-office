/**
 * Slide-show tab actions extracted from App.tsx: starting shows,
 * presenter view, custom shows, rehearsal timings, and hiding slides.
 * Functions take the ActionCtx built fresh per call.
 */
import type { ActionCtx } from './action-context'
import { showSetup, type CustomShow } from './slideshow-utils'
import { t } from './i18n/locale'
import type { AddNarrationOp } from '../shared/ipc'
import { FIT_WIDTH } from './app-constants'
import { NarrationSession, encodeWav, toBase64, type SegmentRecorder } from './narration'

/** Instant black curtain under the upcoming show (body::after overlay): painted on the
 *  very next frame after the click, it hides the React mount + window-snap latency.
 *  SlideShowView lifts it once the show is revealed (and on unmount, for early exits). */
export function dropShowCurtain(): void {
  document.body.classList.add('show-curtain')
}
export function liftShowCurtain(): void {
  document.body.classList.remove('show-curtain')
}

let showStarting = false

export async function startSlideShow(ctx: ActionCtx, fromStart: boolean): Promise<void> {
  if (ctx.slides.length === 0 || ctx.slideShow || ctx.presenter || showStarting) return
  dropShowCurtain()
  ctx.setEditing(null)
  ctx.setCtxMenu(null)
  // From start: jump to the first unhidden slide (if all hidden, still start at slide 1)
  const first = ctx.slides.findIndex((s) => !s.hidden)
  const plain = { startAt: fromStart ? Math.max(0, first) : ctx.current }
  showStarting = true
  try {
    // Set Up Show: slide range, loop, kiosk and saved timings (older preloads play plainly)
    const [settings, times] = await Promise.all([
      window.slidesApi.getShowSettings?.().catch(() => null) ?? null,
      window.slidesApi.getAdvanceTimes?.().catch(() => null) ?? null,
    ])
    if (!settings) {
      ctx.setSlideShow(plain)
      return
    }
    const setup = showSetup(settings, times ?? [], ctx.slides, fromStart, ctx.current)
    ctx.setSlideShow(setup)
  } finally {
    showStarting = false
  }
}

export function exitSlideShow(ctx: ActionCtx, lastIndex: number): void {
  ctx.setSlideShow(null)
  ctx.setCurrent(lastIndex)
  // a narration show writes its takes once it ends (no-op otherwise)
  void finishNarration(ctx)
}

/** Update the custom show list overwrite-style and persist */
export function updateCustomShows(ctx: ActionCtx, shows: CustomShow[]): void {
  ctx.setCustomShows(shows)
  if (ctx.path) {
    try {
      localStorage.setItem(`ai-slides-custom-shows:${ctx.path}`, JSON.stringify(shows))
    } catch {
      // Degrade to memory-only when localStorage is full/unavailable
    }
  }
}

/** Play a custom show: only its included slides (filtering out-of-range indexes stale after deletions) */
export function playCustomShow(ctx: ActionCtx, show: CustomShow): void {
  if (ctx.slideShow || ctx.presenter) return
  const order = show.slideIndices.filter((i) => i >= 0 && i < ctx.slides.length)
  if (order.length === 0) {
    ctx.setStatus(t('appStatusCustomShowEmpty'))
    return
  }
  dropShowCurtain()
  ctx.setEditing(null)
  ctx.setCtxMenu(null)
  ctx.setCustomShowDlgOpen(false)
  ctx.setSlideShow({ startAt: order[0]!, customOrder: order })
}

/** Rehearsal timing: show from the start and record each slide's dwell time */
export function startRehearseShow(ctx: ActionCtx): void {
  if (ctx.slides.length === 0 || ctx.slideShow || ctx.presenter) return
  dropShowCurtain()
  ctx.setEditing(null)
  ctx.setCtxMenu(null)
  const first = ctx.slides.findIndex((s) => !s.hidden)
  ctx.setSlideShow({ startAt: Math.max(0, first), rehearse: true })
}

/** Rehearsal ended: stash per-slide seconds; after exiting the show, prompt "save?" */
export function onRehearseDone(ctx: ActionCtx, perPageSec: number[]): void {
  if (perPageSec.some((s) => s > 0)) ctx.setPendingRehearse(perPageSec)
}

/** Save rehearsal timings: write each slide's dwell seconds as auto-advance times (<p:transition advTm>, milliseconds) */
export async function saveRehearseTimings(ctx: ActionCtx): Promise<void> {
  if (!ctx.pendingRehearse) return
  const times = ctx.pendingRehearse
    .map((sec, i) => ({ slideIndex: i, ms: sec * 1000 }))
    .filter((t) => t.ms > 0)
  ctx.setPendingRehearse(null)
  const ok = await window.slidesApi.setAdvanceTimes({ times })
  if (ok) {
    ctx.setDirty(true)
    ctx.setStatus(t('appStatusRehearseSaved', { count: times.length }))
  }
}

// ── Record narration ─────────────────────────────────────────────────────────────

let narration: { stream: MediaStream; session: NarrationSession } | null = null

/** Record narration: ask for the microphone, then run the show from the start with the timer bar */
export async function startNarration(ctx: ActionCtx): Promise<void> {
  if (ctx.slides.length === 0 || ctx.slideShow || ctx.presenter || narration) return
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  } catch {
    ctx.setStatus(t('narrationMicDenied'))
    return
  }
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
  narration = {
    stream,
    session: new NarrationSession(() => {
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const seg: SegmentRecorder = {
        ondataavailable: null,
        onstop: null,
        start: () => rec.start(),
        stop: () => {
          if (rec.state !== 'inactive') rec.stop()
        },
      }
      rec.ondataavailable = (e) => seg.ondataavailable?.({ data: e.data })
      rec.onstop = () => seg.onstop?.()
      return seg
    }),
  }
  dropShowCurtain()
  ctx.setEditing(null)
  ctx.setCtxMenu(null)
  const first = ctx.slides.findIndex((s) => !s.hidden)
  ctx.setSlideShow({ startAt: Math.max(0, first), rehearse: true, narrate: true })
  ctx.setStatus(t('narrationRecording'))
}

/** the show turned to a slide: its narration segment starts */
export function narrationSlideShown(index: number): void {
  narration?.session.switchTo(index)
}

/** The narration show ended: encode each slide's take as WAV and write clips and timings in one step */
export async function finishNarration(ctx: ActionCtx): Promise<void> {
  const active = narration
  narration = null
  if (!active) return
  let takes: Awaited<ReturnType<NarrationSession['finish']>> = []
  try {
    takes = await active.session.finish()
  } finally {
    active.stream.getTracks().forEach((track) => track.stop())
  }
  if (takes.length === 0) {
    ctx.setStatus(t('narrationNothing'))
    return
  }
  const audio = new AudioContext()
  const items: AddNarrationOp['items'] = []
  let failed = 0
  try {
    for (const take of takes) {
      try {
        const decoded = await audio.decodeAudioData(await take.blob.arrayBuffer())
        items.push({ slideIndex: take.slideIndex, base64: toBase64(encodeWav(decoded)), ext: 'wav', ms: take.ms })
      } catch {
        failed++
      }
    }
  } finally {
    void audio.close()
  }
  const slides = items.length ? await window.slidesApi.addNarration?.({ items, fitWidthPx: FIT_WIDTH }) : null
  if (slides) {
    ctx.setSlides(slides)
    ctx.setDirty(true)
    ctx.setStatus(failed ? t('narrationFailed', { count: failed }) : t('narrationSaved', { count: items.length }))
  } else {
    ctx.setStatus(t('narrationFailed', { count: takes.length }))
  }
}

/** Presenter view (single-window version, entry aligned with the show) */
export function startPresenterView(ctx: ActionCtx, fromStart: boolean): void {
  if (ctx.slides.length === 0 || ctx.slideShow || ctx.presenter) return
  dropShowCurtain()
  ctx.setEditing(null)
  ctx.setCtxMenu(null)
  const first = ctx.slides.findIndex((s) => !s.hidden)
  ctx.setPresenter({ startAt: fromStart ? Math.max(0, first) : ctx.current })
}

export function exitPresenterView(ctx: ActionCtx, lastIndex: number): void {
  ctx.setPresenter(null)
  ctx.setCurrent(lastIndex)
}

/** "Switch to normal show" inside presenter view: seamlessly turns into a full-screen show in this window */
export function switchPresenterToShow(ctx: ActionCtx, lastIndex: number): void {
  ctx.setPresenter(null)
  ctx.setCurrent(lastIndex)
  ctx.setSlideShow({ startAt: lastIndex })
}

export async function toggleHidden(ctx: ActionCtx, index: number): Promise<void> {
  const s = ctx.slides[index]
  if (!s) return
  const updated = await window.slidesApi.setSlideHidden({
    slideIndex: index,
    hidden: !s.hidden,
  })
  if (updated) {
    ctx.applySlide(index, updated)
    ctx.setStatus(
      updated.hidden
        ? t('appStatusSlideHidden', { page: index + 1 })
        : t('appStatusSlideUnhidden', { page: index + 1 }),
    )
  }
}
