import { describe, expect, it } from 'vitest'
import {
  CURRENT_SAVE_DIR,
  LEGACY_SAVE_DIR,
  displayParentDir,
  parentDir,
} from '../src/renderer/src/recent-location'

describe('displayParentDir (Location column legacy alias)', () => {
  it('aliases the exact legacy default folder to the current one', () => {
    expect(displayParentDir('/Users/x/Documents/GenOffice/Report.docx')).toBe('Redrob Office')
    expect(displayParentDir('C:\\Users\\x\\Documents\\GenOffice\\Report.docx')).toBe('Redrob Office')
  })

  it('shows the current folder name verbatim', () => {
    expect(displayParentDir('/Users/x/Documents/Redrob Office/Report.docx')).toBe('Redrob Office')
  })

  it('does not rewrite unrelated folders, including ones that merely contain the word', () => {
    expect(displayParentDir('/Users/x/Documents/GenOffice Archive/Report.docx')).toBe(
      'GenOffice Archive',
    )
    expect(displayParentDir('/Users/x/MyGenOffice/Report.docx')).toBe('MyGenOffice')
    expect(displayParentDir('/Users/x/Projects/Report.docx')).toBe('Projects')
  })

  it('only aliases the immediate parent, never a deeper GenOffice path segment', () => {
    // parent is "final", not "GenOffice" -> shown verbatim
    expect(displayParentDir('/Users/x/GenOffice/final/Report.docx')).toBe('final')
  })

  it('degrades gracefully on paths with no parent folder', () => {
    expect(displayParentDir('Report.docx')).toBe('')
  })

  it('preserves the raw parent folder via parentDir (used for the real-path tooltip source)', () => {
    // parentDir stays the truth; the alias is layered on top for display only
    expect(parentDir('/Users/x/Documents/GenOffice/Report.docx')).toBe(LEGACY_SAVE_DIR)
    expect(parentDir('/Users/x/Documents/Redrob Office/Report.docx')).toBe(CURRENT_SAVE_DIR)
  })
})
