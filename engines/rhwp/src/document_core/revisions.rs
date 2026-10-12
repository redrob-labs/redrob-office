//! [Redrob E5b] Tracked changes (변경 내용 추적): list, add and remove HWPX
//! revisions on top of E5a, which keeps them through edits and saves.
//!
//! A revision is a pair of zero-width marks in the text (`<hp:insertBegin
//! Id TcId/>` … `<hp:insertEnd Id TcId paraend/>`, or `deleteBegin`/`deleteEnd`)
//! and an entry in the header's `<hh:trackChanges>` table (type, date, author)
//! referenced by `TcId`. The marks are `MarkpenMark`s with `revision` set.
//!
//! The engine only manages marks and table entries. Accepting or rejecting is
//! the editor's: remove the revision, and delete its text when it was a
//! deletion being accepted or an insertion being rejected. Marks are zero-width,
//! so removing them never moves a character index.
//!
//! HWP 5.0 revisions are undocumented (format research, finding 3); this API
//! is for HWPX documents.

use super::hyperlink::HyperlinkTarget;
use super::DocumentCore;
use crate::error::HwpError;
use crate::model::control::Control;
use crate::model::paragraph::{MarkpenMark, Paragraph};

fn invalid(message: &str) -> HwpError {
    HwpError::InvalidField(message.into())
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionInfo {
    /// The mark pair's `Id`.
    pub id: u32,
    /// The header entry's id (`TcId`).
    pub tc_id: u32,
    /// "insert" or "delete".
    pub kind: &'static str,
    pub author: String,
    pub date: String,
    pub target: HyperlinkTarget,
    pub node_id: u64,
    pub start: usize,
    /// Where the revision ends: the same paragraph unless it spans paragraphs.
    pub end_target: HyperlinkTarget,
    pub end_node_id: u64,
    pub end: usize,
    pub text: String,
}

/// One parsed mark: begin or end, insert or delete, Id, TcId.
struct Mark {
    begin: bool,
    kind: &'static str,
    id: u32,
    tc_id: u32,
}

fn attr(xml: &str, name: &str) -> Option<String> {
    let key = format!(" {name}=\"");
    let i = xml.find(&key)? + key.len();
    let j = xml[i..].find('"')? + i;
    Some(xml[i..j].to_string())
}

fn parse_mark(xml: &str) -> Option<Mark> {
    let (begin, kind) = if xml.starts_with("<hp:insertBegin") {
        (true, "insert")
    } else if xml.starts_with("<hp:insertEnd") {
        (false, "insert")
    } else if xml.starts_with("<hp:deleteBegin") {
        (true, "delete")
    } else if xml.starts_with("<hp:deleteEnd") {
        (false, "delete")
    } else {
        return None;
    };
    Some(Mark { begin, kind, id: attr(xml, "Id")?.parse().ok()?, tc_id: attr(xml, "TcId").and_then(|v| v.parse().ok()).unwrap_or(0) })
}

// ── The header tables (kept verbatim in DocInfo.track_changes_xml) ───────

#[derive(Debug, Clone)]
struct Element {
    /// Attributes in their original order.
    attrs: Vec<(String, String)>,
}

impl Element {
    fn get(&self, name: &str) -> Option<&str> {
        self.attrs.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
    fn render(&self, tag: &str) -> String {
        let mut out = format!("<hh:{tag}");
        for (k, v) in &self.attrs {
            out.push_str(&format!(" {k}=\"{v}\""));
        }
        out.push_str("/>");
        out
    }
}

fn elements(xml: &str, tag: &str) -> Vec<Element> {
    let open = format!("<hh:{tag} ");
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find(&open) {
        let tail = &rest[i + open.len()..];
        let Some(end) = tail.find('>') else { break };
        let body = tail[..end].trim_end_matches('/');
        let mut attrs = Vec::new();
        let mut b = body;
        while let Some(eq) = b.find("=\"") {
            let name = b[..eq].trim().to_string();
            let after = &b[eq + 2..];
            let Some(q) = after.find('"') else { break };
            attrs.push((name, after[..q].to_string()));
            b = &after[q + 1..];
        }
        out.push(Element { attrs });
        rest = &tail[end..];
    }
    out
}

fn escape(v: &str) -> String {
    v.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn unescape(v: &str) -> String {
    v.replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

struct Tables {
    changes: Vec<Element>,
    authors: Vec<Element>,
}

impl Tables {
    fn read(xml: Option<&str>) -> Self {
        let xml = xml.unwrap_or("");
        Tables { changes: elements(xml, "trackChange"), authors: elements(xml, "trackChangeAuthor") }
    }
    fn render(&self) -> Option<String> {
        if self.changes.is_empty() && self.authors.is_empty() {
            return None;
        }
        let mut out = format!("<hh:trackChanges itemCnt=\"{}\">", self.changes.len());
        for c in &self.changes {
            out.push_str(&c.render("trackChange"));
        }
        out.push_str("</hh:trackChanges>");
        out.push_str(&format!("<hh:trackChangeAuthors itemCnt=\"{}\">", self.authors.len()));
        for a in &self.authors {
            out.push_str(&a.render("trackChangeAuthor"));
        }
        out.push_str("</hh:trackChangeAuthors>");
        Some(out)
    }
    fn author_name(&self, author_id: &str) -> String {
        self.authors.iter().find(|a| a.get("id") == Some(author_id)).and_then(|a| a.get("name")).map(unescape).unwrap_or_default()
    }
    fn change(&self, tc_id: u32) -> Option<&Element> {
        self.changes.iter().find(|c| c.get("id").and_then(|v| v.parse().ok()) == Some(tc_id))
    }
    fn next_id(list: &[Element]) -> u32 {
        list.iter().filter_map(|e| e.get("id")?.parse::<u32>().ok()).max().unwrap_or(0) + 1
    }
    fn author_id(&mut self, name: &str) -> String {
        if let Some(a) = self.authors.iter().find(|a| a.get("name").map(unescape).as_deref() == Some(name)) {
            return a.get("id").unwrap_or("1").to_string();
        }
        const COLORS: [&str; 6] = ["#FF0000", "#0000FF", "#008000", "#800080", "#FF8000", "#008080"];
        let id = Self::next_id(&self.authors);
        let color = COLORS[(self.authors.len()) % COLORS.len()];
        self.authors.push(Element {
            attrs: vec![("name".into(), escape(name)), ("mark".into(), "1".into()), ("color".into(), color.into()), ("id".into(), id.to_string())],
        });
        id.to_string()
    }
}

// ── Walking paragraphs (body and table cells) ───────────────────────────

struct Visit<'a> {
    para: &'a Paragraph,
    target: HyperlinkTarget,
}

fn paragraphs(doc: &crate::model::document::Document) -> Vec<Visit<'_>> {
    fn walk<'a>(ps: &'a [Paragraph], section: usize, host: Option<(usize, Vec<(usize, usize, usize)>)>, out: &mut Vec<Visit<'a>>) {
        for (i, p) in ps.iter().enumerate() {
            let target = match &host {
                None => HyperlinkTarget::body(section, i),
                Some((h, prefix)) => {
                    let mut path = prefix.clone();
                    if let Some(last) = path.last_mut() {
                        last.2 = i;
                    }
                    HyperlinkTarget { section, para: *h, cell_path: path }
                }
            };
            out.push(Visit { para: p, target: target.clone() });
            for (ci, c) in p.controls.iter().enumerate() {
                if let Control::Table(t) = c {
                    for (cell_idx, cell) in t.cells.iter().enumerate() {
                        let mut prefix = target.cell_path.clone();
                        prefix.push((ci, cell_idx, 0));
                        let host_para = target.para;
                        walk(&cell.paragraphs, section, Some((host_para, prefix)), out);
                    }
                }
            }
        }
    }
    let mut out = Vec::new();
    for (si, s) in doc.sections.iter().enumerate() {
        walk(&s.paragraphs, si, None, &mut out);
    }
    out
}

fn visible(p: &Paragraph, from: usize, to: usize) -> String {
    p.text.chars().skip(from).take(to.saturating_sub(from)).filter(|c| *c == '\t' || !c.is_control()).collect()
}

impl DocumentCore {
    /// Every revision, in document order.
    pub fn list_revisions_native(&mut self) -> Vec<RevisionInfo> {
        self.ensure_node_ids();
        let tables = Tables::read(self.document.doc_info.track_changes_xml.as_deref());
        let visits = paragraphs(&self.document);
        let mut open: Vec<(Mark, usize, usize)> = Vec::new(); // (mark, visit index, char)
        let mut out = Vec::new();
        for (vi, v) in visits.iter().enumerate() {
            for m in &v.para.markpen_marks {
                let Some(xml) = &m.revision else { continue };
                let Some(mark) = parse_mark(xml) else { continue };
                if mark.begin {
                    open.push((mark, vi, m.char_idx));
                    continue;
                }
                let Some(pos) = open.iter().rposition(|(b, _, _)| b.id == mark.id && b.kind == mark.kind) else { continue };
                let (b, svi, start) = open.remove(pos);
                let sv = &visits[svi];
                let text = if svi == vi {
                    visible(v.para, start, m.char_idx)
                } else {
                    let mut t = visible(sv.para, start, sv.para.text.chars().count());
                    for mid in &visits[svi + 1..vi] {
                        if mid.target.cell_path.len() == sv.target.cell_path.len() {
                            t.push('\n');
                            t.push_str(&visible(mid.para, 0, mid.para.text.chars().count()));
                        }
                    }
                    t.push('\n');
                    t.push_str(&visible(v.para, 0, m.char_idx));
                    t
                };
                let entry = tables.change(b.tc_id);
                out.push(RevisionInfo {
                    id: b.id,
                    tc_id: b.tc_id,
                    kind: b.kind,
                    author: entry.and_then(|e| e.get("authorID")).map(|a| tables.author_name(a)).unwrap_or_default(),
                    date: entry.and_then(|e| e.get("date")).unwrap_or("").to_string(),
                    target: sv.target.clone(),
                    node_id: sv.para.node_id,
                    start,
                    end_target: v.target.clone(),
                    end_node_id: v.para.node_id,
                    end: m.char_idx,
                    text,
                });
            }
        }
        out
    }

    fn revision_paragraph_mut(&mut self, target: &HyperlinkTarget) -> Result<&mut Paragraph, HwpError> {
        if target.cell_path.is_empty() {
            self.document.sections.get_mut(target.section).and_then(|s| s.paragraphs.get_mut(target.para)).ok_or_else(|| invalid("문단 인덱스 초과"))
        } else {
            self.get_cell_paragraph_mut_by_path(target.section, target.para, &target.cell_path)
        }
    }

    /// Mark existing text `[start, end)` of one paragraph as an insertion or a
    /// deletion by `author` at `date` (ISO 8601, from the caller: WASM has no clock).
    /// Returns the revision's mark Id.
    pub fn add_revision_native(&mut self, target: &HyperlinkTarget, start: usize, end: usize, kind: &str, author: &str, date: &str) -> Result<u32, HwpError> {
        let (begin_tag, end_tag, tc_type) = match kind {
            "insert" => ("insertBegin", "insertEnd", "Insert"),
            "delete" => ("deleteBegin", "deleteEnd", "Delete"),
            _ => return Err(invalid("kind must be insert or delete")),
        };
        let len = self.hyperlink_paragraph(target)?.text.chars().count();
        if start >= end || end > len {
            return Err(invalid("변경 추적은 문단 안의 비어 있지 않은 범위가 필요합니다"));
        }
        let mut tables = Tables::read(self.document.doc_info.track_changes_xml.as_deref());
        let author_id = tables.author_id(author.trim());
        let tc_id = Tables::next_id(&tables.changes);
        tables.changes.push(Element {
            attrs: vec![
                ("type".into(), tc_type.into()),
                ("date".into(), escape(date)),
                ("authorID".into(), author_id),
                ("hide".into(), "0".into()),
                ("id".into(), tc_id.to_string()),
            ],
        });
        let id = self.list_revisions_native().iter().map(|r| r.id).max().unwrap_or(0).max(self.max_revision_mark_id()) + 1;
        let p = self.revision_paragraph_mut(target)?;
        let begin = MarkpenMark { char_idx: start, color: None, utf16_pos: None, revision: Some(format!("<hp:{begin_tag} Id=\"{id}\" TcId=\"{tc_id}\"/>")) };
        let finish = MarkpenMark { char_idx: end, color: None, utf16_pos: None, revision: Some(format!("<hp:{end_tag} Id=\"{id}\" TcId=\"{tc_id}\" paraend=\"0\"/>")) };
        // Begin goes after marks already at `start` (a revision ending there);
        // end goes before marks at `end` (a revision starting there).
        let bi = p.markpen_marks.iter().position(|m| m.char_idx > start).unwrap_or(p.markpen_marks.len());
        p.markpen_marks.insert(bi, begin);
        let ei = p.markpen_marks.iter().enumerate().position(|(i, m)| i > bi && m.char_idx >= end).unwrap_or(p.markpen_marks.len());
        p.markpen_marks.insert(ei, finish);
        self.document.doc_info.track_changes_xml = tables.render();
        self.after_revision_change(target.section);
        Ok(id)
    }

    fn max_revision_mark_id(&self) -> u32 {
        paragraphs(&self.document)
            .iter()
            .flat_map(|v| v.para.markpen_marks.iter())
            .filter_map(|m| parse_mark(m.revision.as_deref()?))
            .map(|m| m.id)
            .max()
            .unwrap_or(0)
    }

    /// Remove a revision's marks and its table entry. The text stays.
    pub fn remove_revision_native(&mut self, id: u32) -> Result<(), HwpError> {
        let rev = self.list_revisions_native().into_iter().find(|r| r.id == id).ok_or_else(|| invalid("변경 내용을 찾을 수 없습니다"))?;
        for target in [&rev.target, &rev.end_target] {
            let p = self.revision_paragraph_mut(target)?;
            p.markpen_marks.retain(|m| !m.revision.as_deref().and_then(parse_mark).is_some_and(|x| x.id == id && x.kind == rev.kind));
        }
        let still_used = paragraphs(&self.document)
            .iter()
            .flat_map(|v| v.para.markpen_marks.iter())
            .filter_map(|m| parse_mark(m.revision.as_deref()?))
            .any(|m| m.tc_id == rev.tc_id);
        if !still_used {
            let mut tables = Tables::read(self.document.doc_info.track_changes_xml.as_deref());
            tables.changes.retain(|c| c.get("id").and_then(|v| v.parse().ok()) != Some(rev.tc_id));
            self.document.doc_info.track_changes_xml = if tables.changes.is_empty() { None } else { tables.render() };
        }
        self.after_revision_change(rev.target.section);
        if rev.end_target.section != rev.target.section {
            self.after_revision_change(rev.end_target.section);
        }
        Ok(())
    }

    fn after_revision_change(&mut self, section: usize) {
        self.document.sections[section].raw_stream = None;
        self.document.doc_info.raw_stream_dirty = true;
        self.mark_section_dirty(section);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_marks_and_tables() {
        let m = parse_mark(r#"<hp:deleteEnd Id="2" TcId="5" paraend="0"/>"#).unwrap();
        assert!(!m.begin && m.kind == "delete" && m.id == 2 && m.tc_id == 5);
        let mut t = Tables::read(Some(r##"<hh:trackChanges itemCnt="1"><hh:trackChange type="Insert" date="d" authorID="1" hide="0" id="1"/></hh:trackChanges><hh:trackChangeAuthors itemCnt="1"><hh:trackChangeAuthor name="검토자" mark="1" color="#FF0000" id="1"/></hh:trackChangeAuthors>"##));
        assert_eq!(t.author_name("1"), "검토자");
        assert_eq!(t.author_id("검토자"), "1");
        assert_eq!(t.author_id("새 사람"), "2");
        assert!(t.render().unwrap().contains(r##"<hh:trackChangeAuthor name="새 사람" mark="1" color="#0000FF" id="2"/>"##));
    }
}
