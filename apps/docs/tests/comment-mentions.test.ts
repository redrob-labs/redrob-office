/**
 * @vitest-environment jsdom
 *
 * @mentions in comments: the rules, the combobox, and @Redrob answering in the thread.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MentionTextarea } from '../src/renderer/comments/MentionTextarea'
import {
  applyMention,
  commentPeople,
  filterPeople,
  mentionPeople,
  mentionQuery,
  mentionsIn,
  mentionsRedrob,
  redrobCommentPrompt,
} from '../src/renderer/comments/mentions'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const PEOPLE = mentionPeople([{ author: 'Jae Gardner' }], ['Seunghyun Seok', 'Jae Gardner', 'AI Assistant'], 'Felix Kim')

describe('mention rules', () => {
  it('opens on "@" at a word start, not inside an e-mail address', () => {
    expect(mentionQuery('Ask @ja', 7)).toEqual({ start: 4, query: 'ja' })
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQuery('mail felix@redrob.ai', 20)).toBeNull()
    expect(mentionQuery('@Jae Ga', 7)).toEqual({ start: 0, query: 'Jae Ga' })
    expect(mentionQuery('@Jae Gardner and', 16)).toBeNull()
  })

  it('lists Redrob first, then people whose name or any word starts with the query', () => {
    expect(PEOPLE.map((p) => p.name)).toEqual(['Redrob', 'Jae Gardner', 'Seunghyun Seok', 'AI Assistant', 'Felix Kim'])
    expect(filterPeople(PEOPLE, '').map((p) => p.name)[0]).toBe('Redrob')
    expect(filterPeople(PEOPLE, 'gar').map((p) => p.name)).toEqual(['Jae Gardner'])
    expect(filterPeople(PEOPLE, 'zz')).toEqual([])
  })

  it('writes "@Name " in place of what was typed', () => {
    const q = mentionQuery('Ask @ja today', 7)!
    expect(applyMention('Ask @ja today', q, 7, 'Jae Gardner')).toEqual({ text: 'Ask @Jae Gardner today', caret: 17 })
  })

  it('finds who a comment mentions, longest name first', () => {
    const people = [{ name: 'Jae' }, { name: 'Jae Gardner' }, { name: 'Redrob', redrob: true }]
    expect(mentionsIn('@Jae Gardner can you check?', people).map((p) => p.name)).toEqual(['Jae Gardner'])
    expect(mentionsRedrob('@Redrob, is clause 8 standard?')).toBe(true)
    expect(mentionsRedrob('Redrobbed')).toBe(false)
    expect(mentionsRedrob('ask @Redrobot')).toBe(false)
  })

  it('records only the people who wrote comments', () => {
    expect(commentPeople([{ author: 'Jae' }, { author: 'Jae' }, { author: 'AI Assistant' }, { author: 'Redrob' }, { author: ' ' }])).toEqual([
      { author: 'Jae' },
    ])
  })

  it('asks Redrob to answer in the thread without editing', () => {
    const p = redrobCommentPrompt('7', '@Redrob is two years standard?')
    expect(p).toContain('reply_comment, parentId 7')
    expect(p).toContain('Do not change the document')
  })
})

describe('MentionTextarea', () => {
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

  function Harness({ onSubmit }: { onSubmit: () => void }) {
    const [v, setV] = useState('')
    return createElement(MentionTextarea, {
      value: v,
      onChange: setV,
      people: PEOPLE,
      onSubmit,
      listLabel: 'People to mention',
      redrobHint: 'answers in this thread',
    })
  }

  const type = (ta: HTMLTextAreaElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setter.call(ta, value)
      ta.setSelectionRange(value.length, value.length)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const key = (ta: HTMLTextAreaElement, k: string, extra: KeyboardEventInit = {}) =>
    act(() => {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))
    })

  it('is a combobox whose list filters as you type and picks with the keyboard', () => {
    const onSubmit = vi.fn()
    act(() => root.render(createElement(Harness, { onSubmit })))
    const ta = host.querySelector('textarea')!
    const list = host.querySelector('[role="listbox"]') as HTMLElement
    expect(ta.getAttribute('role')).toBe('combobox')
    expect(list.hidden).toBe(true)

    type(ta, 'Hi @se')
    expect(list.hidden).toBe(false)
    expect(ta.getAttribute('aria-expanded')).toBe('true')
    const options = [...list.querySelectorAll('[role="option"]')]
    expect(options.map((o) => o.textContent)).toEqual(['@Seunghyun Seok'])
    expect(ta.getAttribute('aria-activedescendant')).toBe(options[0]!.id)

    key(ta, 'Enter')
    expect(ta.value).toBe('Hi @Seunghyun Seok ')
    expect(onSubmit).not.toHaveBeenCalled()

    key(ta, 'Enter', { ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('Escape closes the list without clearing the text', () => {
    act(() => root.render(createElement(Harness, { onSubmit: vi.fn() })))
    const ta = host.querySelector('textarea')!
    type(ta, '@')
    const list = host.querySelector('[role="listbox"]') as HTMLElement
    expect(list.querySelector('.is-redrob')?.textContent).toContain('answers in this thread')
    key(ta, 'Escape')
    expect(list.hidden).toBe(true)
    expect(ta.value).toBe('@')
  })
})
