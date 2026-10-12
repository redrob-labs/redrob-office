//! [Redrob E4] Memos (한글 메모, the comments of the format): list, add, edit and
//! remove, for HWP 5.0 and HWPX, on top of the model the engine already had
//! (`Field.memo_index`, `Field.memo_paragraphs`).
//!
//! A memo is a field over the annotated text whose body is a list of paragraphs.
//! HWPX writes it as `<hp:fieldBegin type="MEMO">` with parameters and a
//! `subList`; HWP 5.0 as a field with a `MEMO/<shape>/<number>/<id>/<id>/<author>/\;;`
//! command and a MEMO_LIST tail at the end of the section. 한글 has no replies:
//! a reply is another memo over the same range (format research, finding 2).
//!
//! Offsets are Unicode scalar indexes in the paragraph, `[start, end)`, as in
//! the hyperlink API this follows.

use super::hyperlink::HyperlinkTarget;
use super::DocumentCore;
use crate::error::HwpError;
use crate::model::control::{Control, Field, FieldType, Parameter, ParameterList};
use crate::model::event::DocumentEvent;
use crate::model::paragraph::{CharShapeRef, FieldRange, Paragraph};
use crate::parser::tags;

/// 한글's "no memo shape" reference.
const NO_MEMO_SHAPE: &str = "65535";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoInfo {
    pub field_id: u32,
    /// 한글's memo number (`Number`, the MEMO_LIST index); memos on one range share none.
    pub number: u32,
    pub author: String,
    /// The memo body, paragraphs joined with "\n".
    pub body: String,
    pub target: HyperlinkTarget,
    /// Session Node id of the annotated paragraph.
    pub node_id: u64,
    pub start: usize,
    pub end: usize,
    /// The annotated text.
    pub text: String,
}

fn invalid(message: &str) -> HwpError {
    HwpError::InvalidField(message.into())
}

pub(crate) fn is_memo(f: &Field) -> bool {
    f.field_type == FieldType::Memo || f.command.starts_with("MEMO/")
}

fn command_token(f: &Field, i: usize) -> Option<&str> {
    f.command.split('/').nth(i)
}

fn memo_number(f: &Field) -> u32 {
    if f.memo_index != 0 {
        return f.memo_index;
    }
    command_token(f, 2).and_then(|t| t.parse().ok()).unwrap_or(0)
}

fn memo_author(f: &Field) -> String {
    for item in &f.parameters.items {
        if let Parameter::String { name: Some(n), value, .. } = item {
            if n == "Author" {
                return value.clone();
            }
        }
    }
    command_token(f, 5).unwrap_or("").to_string()
}

fn body_text(f: &Field) -> String {
    f.memo_paragraphs
        .iter()
        .map(super::node_ids::visible_text)
        .collect::<Vec<_>>()
        .join("\n")
}

/// A memo author or body must not break the `/`-separated HWP 5.0 command.
fn clean_author(author: &str) -> String {
    author.replace(['/', '\\', ';'], " ").trim().chars().take(64).collect()
}

/// Body paragraphs for memo text, in the template's shapes (first memo body, if any).
fn body_paragraphs(text: &str, template: Option<&Paragraph>) -> Vec<Paragraph> {
    text.split('\n')
        .map(|line| {
            let mut p = match template {
                Some(t) => Paragraph::new_empty_like(t),
                None => Paragraph::new_empty(),
            };
            if p.char_shapes.is_empty() {
                p.char_shapes.push(CharShapeRef { start_pos: 0, char_shape_id: 0 });
            }
            if !line.is_empty() {
                p.insert_text_at(0, line);
            }
            p
        })
        .collect()
}

impl DocumentCore {
    /// Every memo in the document, body and table cells, in document order.
    pub fn list_memos_native(&mut self) -> Vec<MemoInfo> {
        self.ensure_node_ids();
        let mut out = Vec::new();
        fn visit(paragraphs: &[Paragraph], section: usize, host: Option<(usize, &[(usize, usize, usize)])>, out: &mut Vec<MemoInfo>) {
            for (i, p) in paragraphs.iter().enumerate() {
                let (para, path): (usize, Vec<(usize, usize, usize)>) = match host {
                    None => (i, Vec::new()),
                    Some((h, prefix)) => {
                        let mut v = prefix.to_vec();
                        if let Some(last) = v.last_mut() {
                            last.2 = i;
                        }
                        (h, v)
                    }
                };
                for r in &p.field_ranges {
                    let Some(Control::Field(f)) = p.controls.get(r.control_idx) else { continue };
                    if !is_memo(f) {
                        continue;
                    }
                    out.push(MemoInfo {
                        field_id: f.field_id,
                        number: memo_number(f),
                        author: memo_author(f),
                        body: body_text(f),
                        target: HyperlinkTarget { section, para, cell_path: path.clone() },
                        node_id: p.node_id,
                        start: r.start_char_idx,
                        end: r.end_char_idx,
                        text: p.text.chars().skip(r.start_char_idx).take(r.end_char_idx.saturating_sub(r.start_char_idx)).collect(),
                    });
                }
                for (ci, c) in p.controls.iter().enumerate() {
                    if let Control::Table(t) = c {
                        for (cell_idx, cell) in t.cells.iter().enumerate() {
                            let mut prefix = path.clone();
                            prefix.push((ci, cell_idx, 0));
                            visit(&cell.paragraphs, section, Some((para, &prefix)), out);
                        }
                    }
                }
            }
        }
        for (si, s) in self.document.sections.iter().enumerate() {
            visit(&s.paragraphs, si, None, &mut out);
        }
        out
    }

    fn next_memo_number(&mut self) -> u32 {
        self.list_memos_native().iter().map(|m| m.number).max().unwrap_or(0) + 1
    }

    /// Add a memo over `[start, end)` of the target paragraph. Returns its field id.
    ///
    /// Written the way 한글 2024 writes a memo it creates: HWPX `type="MEMO"` with
    /// Command, ID, Number, Author and MemoShapeIDRef parameters and the body as a
    /// subList; HWP 5.0 a `%%me` field and a MEMO_LIST entry.
    pub fn add_memo_native(&mut self, target: &HyperlinkTarget, start: usize, end: usize, author: &str, body: &str) -> Result<u32, HwpError> {
        let number = self.next_memo_number();
        let author = clean_author(author);
        let template = self.first_memo_body_paragraph();
        let field_id = self.insert_range_field_native(target, start, end, |field_id| {
            let command = format!("MEMO/{NO_MEMO_SHAPE}/{number}/{field_id}/{field_id}/{author}/\\;;");
            let s = |n: &str, v: String| Parameter::String { name: Some(n.into()), value: v, preserve_space: false };
            let i = |n: &str, v: i64| Parameter::Integer { name: Some(n.into()), value: v };
            Field {
                field_type: FieldType::Memo,
                ctrl_id: tags::FIELD_MEMO,
                field_id,
                memo_index: number,
                memo_paragraphs: body_paragraphs(body, template.as_ref()),
                parameters: ParameterList {
                    name: Some(String::new()),
                    items: vec![
                        i("Prop", 0),
                        s("Command", command.clone()),
                        s("ID", format!("memo{number}")),
                        i("Number", number as i64),
                        s("Author", author.clone()),
                        s("MemoShapeIDRef", NO_MEMO_SHAPE.into()),
                    ],
                },
                command,
                ..Default::default()
            }
        })?;
        Ok(field_id)
    }

    /// Replace a memo's body. Its range, number and author stay.
    pub fn set_memo_body_native(&mut self, field_id: u32, body: &str) -> Result<(), HwpError> {
        let template = self.first_memo_body_paragraph();
        let (target, _) = self.memo_location(field_id)?;
        let field = self.memo_field_mut(&target, field_id)?;
        let template = field.memo_paragraphs.first().cloned().or(template);
        field.memo_paragraphs = body_paragraphs(body, template.as_ref());
        // The verbatim parameter cache describes the old field; parameters still carry Author and Number.
        self.after_memo_change(&target, field_id);
        Ok(())
    }

    /// The Redrob comment-metadata part (thread state 한글 has no slot for).
    pub fn set_redrob_comments_native(&mut self, json: &str) {
        self.document.redrob_comments = (!json.is_empty()).then(|| json.as_bytes().to_vec());
    }

    /// Remove a memo; the annotated text stays.
    pub fn remove_memo_native(&mut self, field_id: u32) -> Result<(), HwpError> {
        let (target, _) = self.memo_location(field_id)?;
        self.remove_range_field_native(&target, field_id)
    }

    fn memo_location(&mut self, field_id: u32) -> Result<(HyperlinkTarget, MemoInfo), HwpError> {
        self.list_memos_native()
            .into_iter()
            .find(|m| m.field_id == field_id)
            .map(|m| (m.target.clone(), m))
            .ok_or_else(|| invalid("메모를 찾을 수 없습니다"))
    }

    fn memo_field_mut(&mut self, target: &HyperlinkTarget, field_id: u32) -> Result<&mut Field, HwpError> {
        let p = if target.cell_path.is_empty() {
            self.document
                .sections
                .get_mut(target.section)
                .and_then(|s| s.paragraphs.get_mut(target.para))
                .ok_or_else(|| invalid("문단 인덱스 초과"))?
        } else {
            self.get_cell_paragraph_mut_by_path(target.section, target.para, &target.cell_path)?
        };
        p.controls
            .iter_mut()
            .find_map(|c| match c {
                Control::Field(f) if is_memo(f) && f.field_id == field_id => Some(f),
                _ => None,
            })
            .ok_or_else(|| invalid("메모를 찾을 수 없습니다"))
    }

    fn first_memo_body_paragraph(&mut self) -> Option<Paragraph> {
        fn find(paragraphs: &[Paragraph]) -> Option<Paragraph> {
            for p in paragraphs {
                for c in &p.controls {
                    match c {
                        Control::Field(f) if is_memo(f) => {
                            if let Some(b) = f.memo_paragraphs.first() {
                                return Some(b.clone());
                            }
                        }
                        Control::Table(t) => {
                            for cell in &t.cells {
                                if let Some(b) = find(&cell.paragraphs) {
                                    return Some(b);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            None
        }
        self.document.sections.iter().find_map(|s| find(&s.paragraphs))
    }

    fn after_memo_change(&mut self, target: &HyperlinkTarget, field_id: u32) {
        self.document.sections[target.section].raw_stream = None;
        self.mark_section_dirty(target.section);
        self.event_log.push(DocumentEvent::HyperlinkChanged {
            section: target.section,
            para: target.para,
            cell_path: target.cell_path.clone(),
            field_id,
        });
    }

    /// Add a field over a single-paragraph range: the 8-unit begin and end markers,
    /// the control and its range. Shared by memos (and hyperlinks' rules: no overlap
    /// with another field, non-empty range).
    fn insert_range_field_native(&mut self, target: &HyperlinkTarget, start: usize, end: usize, make: impl FnOnce(u32) -> Field) -> Result<u32, HwpError> {
        let candidate = self.hyperlink_paragraph(target)?.clone();
        let len = candidate.text.chars().count();
        if start >= end || end > len {
            return Err(invalid("메모는 문단 안의 비어 있지 않은 범위가 필요합니다"));
        }
        if candidate.char_offsets.len() != len {
            return Err(invalid("이 문단에는 메모를 달 수 없습니다"));
        }
        let mut max_id = 0;
        for s in &self.document.sections {
            for p in &s.paragraphs {
                super::queries::field_query::collect_max_field_id(p, &mut max_id);
            }
        }
        let field_id = max_id.checked_add(1).ok_or_else(|| invalid("필드 ID 공간이 소진되었습니다"))?;
        let field = make(field_id);
        let mut candidate = candidate;
        let positions = candidate.control_text_positions();
        let insert_idx = candidate
            .controls
            .iter()
            .enumerate()
            .position(|(idx, _)| candidate.field_ranges.iter().find(|r| r.control_idx == idx).map_or(positions[idx], |r| r.start_char_idx) > start)
            .unwrap_or(candidate.controls.len());
        let end_raw = raw_boundary(&candidate, end);
        let start_raw = raw_boundary(&candidate, start);
        shift_axis(&mut candidate, end_raw, 8)?;
        shift_axis(&mut candidate, start_raw, 8)?;
        for r in &mut candidate.field_ranges {
            if r.control_idx >= insert_idx {
                r.control_idx += 1;
            }
        }
        candidate.controls.insert(insert_idx, Control::Field(field));
        candidate.ctrl_data_records.resize(candidate.controls.len() - 1, None);
        candidate.ctrl_data_records.insert(insert_idx, None);
        candidate.field_ranges.push(FieldRange { start_char_idx: start, end_char_idx: end, control_idx: insert_idx, ..Default::default() });
        candidate.field_ranges.sort_by_key(|r| (r.start_char_idx, r.control_idx));
        self.commit_field_paragraph(target, candidate, field_id)?;
        Ok(field_id)
    }

    fn remove_range_field_native(&mut self, target: &HyperlinkTarget, field_id: u32) -> Result<(), HwpError> {
        let mut candidate = self.hyperlink_paragraph(target)?.clone();
        let (range_idx, ctrl_idx) = candidate
            .field_ranges
            .iter()
            .enumerate()
            .find_map(|(i, r)| match candidate.controls.get(r.control_idx) {
                Some(Control::Field(f)) if f.field_id == field_id => Some((i, r.control_idx)),
                _ => None,
            })
            .ok_or_else(|| invalid("메모를 찾을 수 없습니다"))?;
        let range = candidate.field_ranges[range_idx].clone();
        let end_raw = raw_boundary(&candidate, range.end_char_idx);
        let start_raw = if range.start_char_idx == range.end_char_idx {
            end_raw.checked_sub(8).ok_or_else(|| invalid("빈 필드 마커 좌표 오류"))?
        } else {
            raw_boundary(&candidate, range.start_char_idx)
        };
        if start_raw < 8 || end_raw.saturating_sub(start_raw) < 8 {
            return Err(invalid("필드 마커 좌표가 올바르지 않습니다"));
        }
        shift_axis(&mut candidate, end_raw, -8)?;
        shift_axis(&mut candidate, start_raw, -8)?;
        candidate.field_ranges.remove(range_idx);
        candidate.controls.remove(ctrl_idx);
        if ctrl_idx < candidate.ctrl_data_records.len() {
            candidate.ctrl_data_records.remove(ctrl_idx);
        }
        for r in &mut candidate.field_ranges {
            if r.control_idx > ctrl_idx {
                r.control_idx -= 1;
            }
        }
        self.commit_field_paragraph(target, candidate, field_id)
    }

    fn commit_field_paragraph(&mut self, target: &HyperlinkTarget, candidate: Paragraph, field_id: u32) -> Result<(), HwpError> {
        let section = target.section;
        let para = target.para;
        if target.cell_path.is_empty() {
            let slot = self.document.sections.get_mut(section).and_then(|s| s.paragraphs.get_mut(para)).ok_or_else(|| invalid("문단 인덱스 초과"))?;
            *slot = candidate;
            self.reflow_paragraph(section, para);
            self.recompose_paragraph(section, para);
        } else {
            *self.get_cell_paragraph_mut_by_path(section, para, &target.cell_path)? = candidate;
            let path = target.cell_path.clone();
            let inner = path.last().unwrap().2;
            self.reflow_cell_paragraph_by_path(section, para, &path, inner);
            self.recalculate_cell_paragraph_vpos_by_path(section, para, &path, inner, None);
            self.mark_cell_control_dirty(section, para, path[0].0);
        }
        self.after_memo_change(target, field_id);
        self.paginate_if_needed();
        self.invalidate_page_tree_cache();
        Ok(())
    }
}

fn raw_boundary(p: &Paragraph, offset: usize) -> u32 {
    p.char_offsets.get(offset).copied().unwrap_or(p.char_count.saturating_sub(1))
}

/// Insert or remove an 8-unit marker and move every raw UTF-16 reference with it
/// (same rule as the hyperlink API). Display character indexes do not change.
fn shift_axis(p: &mut Paragraph, boundary: u32, delta: i32) -> Result<(), HwpError> {
    let shift = |v: &mut u32| -> Result<(), HwpError> {
        if *v >= boundary {
            *v = v.checked_add_signed(delta).ok_or_else(|| invalid("필드 좌표 범위 초과"))?;
        }
        Ok(())
    };
    for v in &mut p.char_offsets {
        shift(v)?;
    }
    for shape in &mut p.char_shapes {
        if shape.start_pos != 0 {
            shift(&mut shape.start_pos)?;
        }
    }
    for range in &mut p.range_tags {
        shift(&mut range.start)?;
        shift(&mut range.end)?;
    }
    for mark in &mut p.markpen_marks {
        if let Some(pos) = &mut mark.utf16_pos {
            shift(pos)?;
        }
    }
    p.stored_text_partition_dirty = true;
    p.char_count = p.char_count.checked_add_signed(delta).ok_or_else(|| invalid("문단 길이 범위 초과"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authors_cannot_break_the_command() {
        assert_eq!(clean_author("a/b\\c;d"), "a b c d");
    }

    #[test]
    fn body_paragraphs_split_lines() {
        let ps = body_paragraphs("하나\n둘", None);
        assert_eq!(ps.len(), 2);
        assert_eq!(ps[1].text, "둘");
    }
}
