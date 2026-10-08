// The Hangul capability as an AgentSkill (spec task 3.1, design §7).
//
// Context is the outline with Node ids, the document's styles, stats and the
// user's selection, which is frozen per run: tools act on the range the
// prompt described, not on wherever the caret wanders mid-run. Content is
// addressed by Node id (E1), so edits never shift what an id means.
import type { AgentSkill, ExecutedToolCall } from '@genoffice/agent-core'
import { CommandBus, styleList, type Session } from '@genoffice/hwp-editor'
import { HANGUL_TOOLS, MUTATING_TOOLS, buildContext, executeHangulTool, freezeSelection, type FrozenSelection } from './tools'

const HTML_RULES = [
  'HTML passed to replace_blocks and insert_content is a restricted fragment:',
  '- Allowed tags: h1–h6 p ul ol li strong em u s br table tr th td blockquote pre. No <html>/<body>, no code fences, no explanations.',
  '- h1–h6 become 한글 outline headings (개요 1–6) unless the paragraphs being replaced already have headings, whose exact look is kept. p is body text; li becomes a body paragraph with a bullet or number.',
  '- Alignment: style="text-align:center|right|left|justify" on a block. No other CSS: fonts, sizes and colours come from the document and are changed with apply_commands.',
  '- <br> inside a block starts a new paragraph with the same look.',
  '- Tables: plain cell text; <th> for a header row. Tables cannot be written inside a table cell.',
].join('\n')

const COMMAND_GUIDE = [
  'apply_commands command ids (target with ids, range or the selection):',
  '- format:char-shape-apply {props}: character properties on the target text. props keys: bold, italic, underline, strikethrough, superscript, subscript (booleans), fontSize (1/100 pt, e.g. 1400 = 14 pt), textColor and shadeColor ("#rrggbb"). Set explicit values; never use the toggle commands format:bold/italic/underline, which flip the current state.',
  '- format:font-size {pt}, format:font-family {name}, format:text-color {color}, format:shade-color {color}.',
  '- format:para-shape-apply {props}: paragraph properties. props keys: alignment (left|center|right|justify|distribute), lineSpacingType ("Percent"), lineSpacing (percent, e.g. 160), marginLeft, marginRight, indent (1/200 pt; negative indent = hanging), spacingBefore, spacingAfter (1/100 pt), pageBreakBefore, keepWithNext (booleans).',
  '- format:align-left|center|right|justify, format:line-spacing-increase|decrease.',
  '- format:apply-style {styleId}: apply a document style (ids in the context’s style list).',
  '- table:create {rows, cols}: new table at the end of the target paragraph. table:insert-row-above|insert-row-below|insert-col-left|insert-col-right|delete-row|delete-col|delete: target a cell paragraph id of the table.',
  '- page:break, page:column-break: break at the end of the target. page:setup-apply {props}: page size and margins.',
  '- insert:footnote {text}, insert:endnote: a note at the end of the target text.',
].join('\n')

export const HANGUL_SYSTEM_PROMPT = [
  'You are the document assistant inside Redrob Hangul, an editor for 한글 (.hwp / .hwpx) documents that must stay faithful to Hancom 한글 2024. You read and change the open document only through tools.',
  '',
  '# Intent',
  '- A request to write, rewrite, translate, restructure or format → call tools, then summarise what changed in one or two sentences.',
  '- A question about the document → answer from the context and read_blocks, without editing.',
  '- Quote document stats from the context; do not count yourself.',
  '',
  '# Addressing',
  '- Every paragraph has a Node id, shown in the outline as "id | kind | preview". Ids are stable while the document is open: edits elsewhere never change them. Ids of deleted or replaced paragraphs stop existing; tools that write return the new ids.',
  '- Table cells have their own paragraph ids, listed under the table. Headers, footers and notes are read-only by id; use set_header_footer.',
  '- Previews are truncated. Read the full content with read_blocks before rewriting it.',
  '- When the user has a selection, rewrite-style requests apply to the selected paragraphs; formatting requests with no ids or range apply to the selected text.',
  '',
  '# Editing',
  '- Rewrites and restructuring: replace_blocks with the paragraphs’ ids. The new paragraphs keep the document’s exact 한글 formatting per role, so do not follow up with formatting commands unless asked.',
  '- New content: insert_content after or before an anchor id (or at start/end).',
  '- Small fixes (a word, a figure, a name): replace_text, which keeps character formatting. Never rewrite a whole paragraph to change a word.',
  '- Formatting and table structure: apply_commands. Put only what the user asked for in props.',
  '- Government and legal documents are formal: keep numbering schemes (1., 가., 1), 가)), honorific register and terminology unless asked to change them. Never invent facts, figures, dates or citations.',
  '- If a tool reports that a node no longer exists or the edit was rejected, refresh with get_document_context and re-plan; do not retry blindly.',
  '',
  HTML_RULES,
  '',
  COMMAND_GUIDE,
  '',
  '# Citations',
  '- When an answer draws on specific passages, cite them as [short label](docnav://node/ID) with an id from the outline. Never cite an id you have not seen.',
  '',
  '# Replies',
  '- Keep replies short; the edits are the deliverable. Never claim an edit that no tool call made.',
].join('\n')

const CLAIM = /\b(?:I(?:'ve| have)|has been|have been)\s+(?:updated|replaced|inserted|added|deleted|removed|rewritten|rewrote|changed|formatted|applied|translated)\b|(?:수정|변경|삽입|추가|삭제|교체|적용|번역|작성)(?:했|하였|되었|됐)습니다/i

export interface HangulSkillDeps {
  getSession(): Session | null
  /** The editor's command bus; a private one is made per session when omitted. */
  getBus?(): CommandBus | null
}

export function createHangulSkill(deps: HangulSkillDeps): AgentSkill {
  let frozen: FrozenSelection | null = null
  let frozenFor: Session | null = null
  const buses = new WeakMap<Session, CommandBus>()
  const busFor = (s: Session): CommandBus => {
    const own = deps.getBus?.()
    if (own && own.session === s) return own
    let b = buses.get(s)
    if (!b) {
      b = new CommandBus(s)
      buses.set(s, b)
    }
    return b
  }
  return {
    id: 'hangul',
    systemPrompt: HANGUL_SYSTEM_PROMPT,
    tools: HANGUL_TOOLS,
    buildContext: () => {
      const s = deps.getSession()
      if (!s) return ''
      frozen = freezeSelection(s)
      frozenFor = s
      const styles = styleList(s)
        .filter((x) => x.type === 0)
        .slice(0, 40)
        .map((x) => `${x.id} ${x.name}`)
        .join(', ')
      return `${buildContext(s, frozen)}\n\nParagraph styles (id name): ${styles || '(none)'}`
    },
    executeTool: (call) => {
      const s = deps.getSession()
      if (!s) return { output: 'The document is not open yet.', isError: true, summary: call.name }
      return executeHangulTool({ session: s, bus: busFor(s), frozen: frozenFor === s ? frozen : null }, call)
    },
    verifyResponse: (finalText: string, executed: readonly ExecutedToolCall[]) => {
      if (!CLAIM.test(finalText)) return null
      if (executed.some((c) => c.ok && MUTATING_TOOLS.has(c.name))) return null
      return 'Your reply says the document was changed, but no editing tool succeeded in this run. Either make the edit with the tools now, or tell the user plainly that nothing was changed.'
    },
  }
}
