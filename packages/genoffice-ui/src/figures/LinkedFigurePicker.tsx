import { useState, type ReactElement } from 'react'
import { Button } from '../kit'
import { Dialog } from '../Dialog'

/** One fact the picker offers, already formatted by the caller. */
export interface FigureChoice {
  id: string
  label: string
  /** the value as it reads, e.g. ₩3.86bn */
  value: string
  /** source file name and cell, e.g. "Q3.xlsx, Summary!C2" */
  source: string
  /** the fact has a dependent sentence that can be inserted instead */
  hasSentence: boolean
}

/** Linked-figure copy for Slides and Markdown; English is the master and the only selectable language. */
export const FIGURE_STRINGS = {
  title: 'Insert linked figure',
  cancel: 'Cancel',
  insertValue: 'Insert the value',
  insertSentence: 'Insert the sentence',
  empty: 'There are no linked figures on this computer yet. Link a cell in a sheet first.',
  tool: 'Insert linked figure',
  saveFirst: 'Save the file first, then insert linked figures.',
  failed: 'The linked figure could not be recorded. It will be on the next save.',
  updated: 'Linked figures updated to what this file keeps',
} as const

export interface LinkedFigurePickerStrings {
  title: string
  cancel: string
  insertValue: string
  insertSentence: string
  empty: string
}

/** Pick a fact from the linked-figure index and insert it as its value or its sentence. */
export function LinkedFigurePicker({
  choices,
  strings,
  allowSentence = true,
  onInsert,
  onClose,
}: {
  choices: readonly FigureChoice[]
  strings: LinkedFigurePickerStrings
  /** false where the editor places only values */
  allowSentence?: boolean
  onInsert: (fact: string, part: 'figures' | 'sentence') => void
  onClose: () => void
}): ReactElement {
  const [picked, setPicked] = useState<string | null>(choices[0]?.id ?? null)
  const choice = choices.find((c) => c.id === picked)
  return (
    <Dialog
      title={strings.title}
      closeLabel={strings.cancel}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {strings.cancel}
          </Button>
          {allowSentence && choice?.hasSentence ? (
            <Button size="sm" variant="secondary" onClick={() => onInsert(choice.id, 'sentence')}>
              {strings.insertSentence}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" disabled={!choice} onClick={() => choice && onInsert(choice.id, 'figures')}>
            {strings.insertValue}
          </Button>
        </>
      }
    >
      {choices.length === 0 ? (
        <p>{strings.empty}</p>
      ) : (
        <ul className="go-figpick" role="listbox" aria-label={strings.title}>
          {choices.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={picked === c.id}
              tabIndex={0}
              className={`go-figpick__o${picked === c.id ? ' is-on' : ''}`}
              onClick={() => setPicked(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPicked(c.id)
                }
              }}
            >
              <b>{c.label}</b>
              <span>{c.value}</span>
              <span className="go-figpick__src">{c.source}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
