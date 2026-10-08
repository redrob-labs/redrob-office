/**
 * @vitest-environment jsdom
 *
 * The comments rail on a real editor session (spec task 4.2): compose on the
 * selection, reply, resolve, delete, jump to the text, and @Redrob.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Comments, EditorView, Session, type Pos } from '@genoffice/hwp-editor'
import { CommentsRail } from '../src/renderer/next/CommentsRail'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { createHangulSkill } from '../src/renderer/ai/hangul-skill'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true
beforeAll(() => {
  initHwpCoreNode()
  ;(window as unknown as { hangulApi: unknown }).hangulApi = { getLanguage: async () => 'en', onLanguageChanged: () => () => {} }
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })

function editor(): { view: EditorView; comments: Comments } {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  s.text.insert(P(0, 0), '제1조(목적) 이 법은 국민의 권리를 보장한다.')
  const el = document.createElement('div')
  document.body.append(el)
  return { view: new EditorView(el, s, new CommandBus(s), { painter: () => {} }), comments: new Comments(s) }
}

function mount(view: EditorView, comments: Comments, composing = false) {
  const asked: Array<[number, string]> = []
  let rev = 0
  const render = (c: boolean) =>
    root.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(CommentsRail, {
          view,
          comments,
          me: '홍길동',
          revision: rev,
          composing: c,
          onComposingChange: (next: boolean) => act(() => render(next)),
          onChanged: () => {
            rev += 1
            render(false)
          },
          onAskRedrob: (id: number, text: string) => asked.push([id, text]),
          onClose: () => {},
        }),
      }),
    )
  act(() => render(composing))
  return { asked }
}

const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)!
async function type(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('comments rail', () => {
  it('composes a comment on the selection, replies, resolves and deletes', async () => {
    const { view, comments } = editor()
    view.session.select({ anchor: P(0, 10), head: P(0, 12) })
    mount(view, comments, true)
    await type(host.querySelector('textarea')!, '용어 확인 부탁드립니다')
    await act(async () => button('Comment').click())
    const [t] = comments.threads()
    expect(t).toMatchObject({ root: { author: '홍길동', text: '용어 확인 부탁드립니다' }, anchor: { text: '법은' } })
    expect(host.textContent).toContain('용어 확인 부탁드립니다')
    expect(view.session.dirty).toBe(true)

    await act(async () => button('Reply').click())
    await type(host.querySelector('.hangul-comment__reply textarea')!, '확인했습니다')
    await act(async () => (host.querySelector('.hangul-comment__reply .hangul-comments__actions button:last-child') as HTMLButtonElement).click())
    expect(comments.thread(t!.id)!.replies.map((r) => r.text)).toEqual(['확인했습니다'])

    await act(async () => button('Resolve').click())
    expect(comments.thread(t!.id)!.resolved).toBe(true)
    // resolved threads are hidden until Show resolved is on
    expect(host.querySelector('.hangul-comment')).toBeNull()

    comments.resolve(t!.id, false)
    mount(view, comments)
    await act(async () => button('Delete comment and its replies').click())
    expect(comments.threads()).toEqual([])
  })

  it('jumps to the commented text', async () => {
    const { view, comments } = editor()
    comments.add({ anchor: P(0, 10), head: P(0, 12) }, 'a', '메모')
    view.session.select({ anchor: P(0, 0), head: P(0, 0) })
    mount(view, comments)
    await act(async () => (host.querySelector('.hangul-comment__quote') as HTMLButtonElement).click())
    const sel = view.session.selection
    expect(view.session.text.textBetween(sel.anchor, sel.head)).toBe('법은')
  })

  it('asks Redrob when a comment mentions it', async () => {
    const { view, comments } = editor()
    view.session.select({ anchor: P(0, 10), head: P(0, 12) })
    const { asked } = mount(view, comments, true)
    await type(host.querySelector('textarea')!, '@Redrob 이 조문 뜻을 알려 주세요')
    await act(async () => button('Comment').click())
    expect(asked).toHaveLength(1)
    expect(asked[0]![0]).toBe(comments.threads()[0]!.id)
  })
})

describe('AI comment tools', () => {
  it('reads, replies as Redrob and resolves, each one undo step', async () => {
    const { view, comments } = editor()
    const s = view.session
    const id = comments.add({ anchor: P(0, 10), head: P(0, 12) }, '홍길동', '이 표현이 맞나요?')
    const skill = createHangulSkill({ getSession: () => s })
    expect(skill.buildContext!()).toContain(`${id} | on `)
    const run = (name: string, input: Record<string, unknown>) => skill.executeTool({ id: 'x', name, input })
    const read = await run('read_comments', {})
    expect(JSON.parse(read.output)[0]).toMatchObject({ threadId: id, commentedText: '법은', comments: [{ author: '홍길동', text: '이 표현이 맞나요?' }] })
    const seq = s.changeSeq
    expect((await run('reply_comment', { threadId: id, text: '네, 맞습니다.' })).isError).toBeFalsy()
    expect(s.changeSeq).toBe(seq + 1)
    expect(comments.thread(id)!.replies[0]).toMatchObject({ author: 'Redrob', text: '네, 맞습니다.' })
    await run('resolve_comment', { threadId: id })
    expect(comments.thread(id)!.resolved).toBe(true)
    expect((await run('reply_comment', { threadId: 999, text: 'x' })).isError).toBe(true)
  })
})
