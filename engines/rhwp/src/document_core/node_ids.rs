//! [Redrob E1, E3] Session node ids, the structured outline and node lookup.
//!
//! Every paragraph in the document (body, table cells, headers and footers,
//! foot/endnotes, text boxes, captions, memo bodies) carries a `node_id` that
//! identifies it for the life of the open document: AI tools, comments and edit
//! anchors address content by it instead of by index, because indices shift
//! after every edit.
//!
//! Ids are **never written to a file**. The format's own paragraph ids
//! (`instanceId`, `hp:p@id`) are a pattern 한글 depends on, not identities
//! (docs/decisions/2026-10-hangul-format-research.md, finding 1).
//!
//! Assignment is lazy and repairing: `ensure_node_ids` walks the tree in
//! document order and gives a fresh id to every paragraph that has none or
//! repeats one seen earlier. Edits that create paragraphs by cloning (split,
//! paste) therefore leave the earlier paragraph with the old id and the new one
//! with a fresh id on the next query. Snapshot restore brings ids back with the
//! paragraphs; the counter is never rewound, so a deleted paragraph's id is
//! never reused.
use std::collections::HashSet;

use serde_json::{json, Value};

use super::DocumentCore;
use crate::model::control::Control;
use crate::model::identity::walk::{walk, Node};
use crate::model::paragraph::Paragraph;
use crate::model::shape::ShapeObject;

const PREVIEW_CHARS: usize = 80;

/// One step from a paragraph into a list of paragraphs owned by one of its controls.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeStep {
    pub control_index: usize,
    /// "cell", "header", "footer", "footnote", "endnote", "textbox", "caption", "memo"
    pub kind: &'static str,
    pub cell_index: Option<usize>,
    /// Index of the paragraph inside that list.
    pub para: usize,
}

/// Where a node is now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeLocation {
    pub section: usize,
    /// Index of the top-level body paragraph (the host, for nested nodes).
    pub para: usize,
    pub path: Vec<NodeStep>,
}

impl NodeLocation {
    pub fn to_json(&self) -> Value {
        json!({
            "section": self.section,
            "para": self.para,
            "path": self.path.iter().map(|s| {
                let mut v = json!({ "controlIndex": s.control_index, "kind": s.kind, "para": s.para });
                if let Some(c) = s.cell_index { v["cellIndex"] = json!(c); }
                v
            }).collect::<Vec<_>>(),
        })
    }
}

/// Visible text of a paragraph: the model text without control placeholders.
pub(crate) fn visible_text(p: &Paragraph) -> String {
    p.text.chars().filter(|c| *c == '\t' || !c.is_control()).collect()
}

fn preview(p: &Paragraph) -> String {
    visible_text(p).chars().take(PREVIEW_CHARS).collect()
}

/// The paragraph lists a control owns, with the step kind and cell index.
fn owned_lists(control: &Control) -> Vec<(&'static str, Option<usize>, &[Paragraph])> {
    let mut out: Vec<(&'static str, Option<usize>, &[Paragraph])> = Vec::new();
    match control {
        Control::Table(t) => {
            for (i, cell) in t.cells.iter().enumerate() {
                out.push(("cell", Some(i), &cell.paragraphs));
            }
            if let Some(c) = &t.caption {
                out.push(("caption", None, &c.paragraphs));
            }
        }
        Control::Header(h) => out.push(("header", None, &h.paragraphs)),
        Control::Footer(f) => out.push(("footer", None, &f.paragraphs)),
        Control::Footnote(n) => out.push(("footnote", None, &n.paragraphs)),
        Control::Endnote(n) => out.push(("endnote", None, &n.paragraphs)),
        Control::Field(f) if !f.memo_paragraphs.is_empty() => out.push(("memo", None, &f.memo_paragraphs)),
        Control::Picture(p) => {
            if let Some(c) = &p.caption {
                out.push(("caption", None, &c.paragraphs));
            }
        }
        Control::Shape(s) => {
            if let Some(d) = s.drawing() {
                if let Some(tb) = &d.text_box {
                    out.push(("textbox", None, &tb.paragraphs));
                }
                if let Some(c) = &d.caption {
                    out.push(("caption", None, &c.paragraphs));
                }
            }
        }
        _ => {}
    }
    out
}

fn control_kind(control: &Control) -> &'static str {
    match control {
        Control::Table(_) => "table",
        Control::Picture(_) => "picture",
        Control::Shape(s) => match s.as_ref() {
            ShapeObject::Group(_) => "group",
            ShapeObject::Chart(_) => "chart",
            ShapeObject::Ole(_) => "ole",
            _ if s.drawing().map(|d| d.text_box.is_some()).unwrap_or(false) => "textbox",
            _ => "shape",
        },
        Control::Header(_) => "header",
        Control::Footer(_) => "footer",
        Control::Footnote(_) => "footnote",
        Control::Endnote(_) => "endnote",
        Control::Equation(_) => "equation",
        Control::Field(f) if !f.memo_paragraphs.is_empty() => "memo",
        Control::Field(_) => "field",
        Control::Bookmark(_) => "bookmark",
        Control::SectionDef(_) => "section-def",
        Control::ColumnDef(_) => "column-def",
        _ => "other",
    }
}

fn find_in(list: &[Paragraph], id: u64, path: &mut Vec<NodeStep>) -> Option<usize> {
    for (i, p) in list.iter().enumerate() {
        if p.node_id == id {
            return Some(i);
        }
        for (ci, control) in p.controls.iter().enumerate() {
            for (kind, cell, inner) in owned_lists(control) {
                path.push(NodeStep { control_index: ci, kind, cell_index: cell, para: 0 });
                if find_in_nested(inner, id, path).is_some() {
                    return Some(i);
                }
                path.pop();
            }
        }
    }
    None
}

/// Like `find_in`, but writes the index found at this level into the last step.
fn find_in_nested(list: &[Paragraph], id: u64, path: &mut Vec<NodeStep>) -> Option<usize> {
    for (i, p) in list.iter().enumerate() {
        if p.node_id == id {
            if let Some(last) = path.last_mut() {
                last.para = i;
            }
            return Some(i);
        }
        for (ci, control) in p.controls.iter().enumerate() {
            for (kind, cell, inner) in owned_lists(control) {
                if let Some(last) = path.last_mut() {
                    last.para = i;
                }
                path.push(NodeStep { control_index: ci, kind, cell_index: cell, para: 0 });
                if find_in_nested(inner, id, path).is_some() {
                    return Some(i);
                }
                path.pop();
            }
        }
    }
    None
}

fn outline_list(list: &[Paragraph], depth: usize) -> Vec<Value> {
    list.iter()
        .map(|p| {
            let controls: Vec<Value> = p
                .controls
                .iter()
                .enumerate()
                .filter_map(|(ci, c)| {
                    let kind = control_kind(c);
                    if matches!(kind, "section-def" | "column-def" | "other" | "bookmark" | "field") {
                        return None;
                    }
                    let mut v = json!({ "controlIndex": ci, "kind": kind });
                    if let Control::Table(t) = c {
                        v["rows"] = json!(t.row_count);
                        v["cols"] = json!(t.col_count);
                        v["cells"] = json!(t
                            .cells
                            .iter()
                            .enumerate()
                            .map(|(k, cell)| json!({
                                "cellIndex": k,
                                "row": cell.row,
                                "col": cell.col,
                                "rowSpan": cell.row_span,
                                "colSpan": cell.col_span,
                                "paragraphs": if depth < 8 { outline_list(&cell.paragraphs, depth + 1) } else { vec![] },
                            }))
                            .collect::<Vec<_>>());
                    } else {
                        let lists = owned_lists(c);
                        if !lists.is_empty() && depth < 8 {
                            v["paragraphs"] = json!(lists
                                .iter()
                                .flat_map(|(_, _, l)| outline_list(l, depth + 1))
                                .collect::<Vec<_>>());
                        }
                    }
                    Some(v)
                })
                .collect();
            let mut v = json!({
                "id": p.node_id,
                "length": visible_text(p).chars().count(),
                "preview": preview(p),
                "styleId": p.style_id,
                "paraShapeId": p.para_shape_id,
            });
            if !controls.is_empty() {
                v["controls"] = json!(controls);
            }
            v
        })
        .collect()
}

impl DocumentCore {
    /// Give every paragraph a unique session id. Returns how many were assigned.
    pub fn ensure_node_ids(&mut self) -> usize {
        let mut next = self.next_node_id;
        let mut seen: HashSet<u64> = HashSet::new();
        let mut assigned = 0usize;
        let mut visit = |node: &mut Node<'_>| {
            if let Node::Paragraph(p) = node {
                if p.node_id == 0 || !seen.insert(p.node_id) {
                    p.node_id = next;
                    seen.insert(next);
                    next += 1;
                    assigned += 1;
                }
            }
            Ok(())
        };
        for section in &mut self.document.sections {
            let _ = walk(&mut section.paragraphs, &mut visit);
            for master in &mut section.section_def.master_pages {
                let _ = walk(&mut master.paragraphs, &mut visit);
            }
        }
        self.next_node_id = next;
        assigned
    }

    /// Where node `id` is now, or None when it no longer exists.
    pub fn locate_node(&mut self, id: u64) -> Option<NodeLocation> {
        self.ensure_node_ids();
        for (s, section) in self.document.sections.iter().enumerate() {
            let mut path = Vec::new();
            if let Some(para) = find_in(&section.paragraphs, id, &mut path) {
                return Some(NodeLocation { section: s, para, path });
            }
        }
        None
    }

    /// Id of the body paragraph at (section, para).
    pub fn node_id_at(&mut self, section: usize, para: usize) -> Option<u64> {
        self.ensure_node_ids();
        self.document.sections.get(section)?.paragraphs.get(para).map(|p| p.node_id)
    }

    /// Id of the paragraph `cell_para` in cell `cell` of the table at control `control`
    /// of body paragraph (section, para).
    pub fn node_id_in_cell(&mut self, section: usize, para: usize, control: usize, cell: usize, cell_para: usize) -> Option<u64> {
        self.ensure_node_ids();
        let host = self.document.sections.get(section)?.paragraphs.get(para)?;
        match host.controls.get(control)? {
            Control::Table(t) => t.cells.get(cell)?.paragraphs.get(cell_para).map(|p| p.node_id),
            _ => None,
        }
    }

    /// The whole document as a tree of nodes: per section, its body paragraphs with
    /// id, length, preview and the controls they host (tables with their cells,
    /// headers, footers, notes, text boxes), each with its own paragraphs.
    pub fn outline_json(&mut self) -> String {
        self.ensure_node_ids();
        let sections: Vec<Value> = self
            .document
            .sections
            .iter()
            .enumerate()
            .map(|(i, s)| json!({ "section": i, "paragraphs": outline_list(&s.paragraphs, 0) }))
            .collect();
        json!({ "sections": sections }).to_string()
    }

    /// Full text and properties of the given nodes, for AI reads (E3).
    pub fn read_nodes_json(&mut self, ids: &[u64]) -> String {
        self.ensure_node_ids();
        let out: Vec<Value> = ids
            .iter()
            .map(|id| match self.locate_node(*id) {
                None => json!({ "id": id, "missing": true }),
                Some(loc) => {
                    let p = self.paragraph_at(&loc);
                    match p {
                        None => json!({ "id": id, "missing": true }),
                        Some(p) => json!({
                            "id": id,
                            "location": loc.to_json(),
                            "text": visible_text(p),
                            "styleId": p.style_id,
                            "paraShapeId": p.para_shape_id,
                            "charShapes": p.char_shapes.iter().map(|r| json!({ "start": r.start_pos, "charShapeId": r.char_shape_id })).collect::<Vec<_>>(),
                        }),
                    }
                }
            })
            .collect();
        Value::Array(out).to_string()
    }

    /// The paragraph at a location.
    pub fn paragraph_at(&self, loc: &NodeLocation) -> Option<&Paragraph> {
        let mut p = self.document.sections.get(loc.section)?.paragraphs.get(loc.para)?;
        for step in &loc.path {
            let control = p.controls.get(step.control_index)?;
            let lists = owned_lists(control);
            let list = lists
                .iter()
                .find(|(kind, cell, _)| *kind == step.kind && *cell == step.cell_index)
                .map(|(_, _, l)| *l)?;
            p = list.get(step.para)?;
        }
        Some(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn core() -> DocumentCore {
        let mut c = DocumentCore::new_empty();
        c.document.sections.push(Default::default());
        let sec = &mut c.document.sections[0];
        for t in ["one", "two", "three"] {
            sec.paragraphs.push(Paragraph { text: t.into(), ..Default::default() });
        }
        c
    }

    #[test]
    fn assigns_unique_ids_once() {
        let mut c = core();
        assert_eq!(c.ensure_node_ids(), 3);
        assert_eq!(c.ensure_node_ids(), 0);
        let ids: Vec<u64> = c.document.sections[0].paragraphs.iter().map(|p| p.node_id).collect();
        assert_eq!(ids, vec![1, 2, 3]);
    }

    #[test]
    fn a_clone_gets_a_fresh_id_and_the_original_keeps_its_own() {
        let mut c = core();
        c.ensure_node_ids();
        let clone = c.document.sections[0].paragraphs[0].clone();
        c.document.sections[0].paragraphs.insert(1, clone);
        c.ensure_node_ids();
        let ids: Vec<u64> = c.document.sections[0].paragraphs.iter().map(|p| p.node_id).collect();
        assert_eq!(ids, vec![1, 4, 2, 3]);
    }

    #[test]
    fn ids_are_not_reused_after_delete() {
        let mut c = core();
        c.ensure_node_ids();
        c.document.sections[0].paragraphs.remove(2);
        c.document.sections[0].paragraphs.push(Paragraph::default());
        c.ensure_node_ids();
        assert_eq!(c.document.sections[0].paragraphs[2].node_id, 4);
        assert!(c.locate_node(3).is_none());
    }

    #[test]
    fn locates_body_nodes() {
        let mut c = core();
        let loc = c.locate_node(2).unwrap();
        assert_eq!((loc.section, loc.para, loc.path.len()), (0, 1, 0));
    }

    #[test]
    fn a_split_at_the_start_keeps_the_id_on_the_content() {
        let mut c = core();
        c.ensure_node_ids();
        c.document.sections[0].paragraphs[1].char_offsets = (0..3).collect();
        let tail = c.document.sections[0].paragraphs[1].split_at(0);
        c.document.sections[0].paragraphs.insert(2, tail);
        c.ensure_node_ids();
        let sec = &c.document.sections[0];
        assert_eq!(sec.paragraphs[2].text, "two");
        assert_eq!(sec.paragraphs[2].node_id, 2);
        assert!(sec.paragraphs[1].text.is_empty());
        assert_eq!(sec.paragraphs[1].node_id, 4);
    }

    #[test]
    fn a_split_in_the_middle_keeps_the_id_on_the_head() {
        let mut c = core();
        c.ensure_node_ids();
        // A real paragraph carries one UTF-16 offset per character.
        c.document.sections[0].paragraphs[2].char_offsets = (0..5).collect();
        let tail = c.document.sections[0].paragraphs[2].split_at(2);
        c.document.sections[0].paragraphs.insert(3, tail);
        c.ensure_node_ids();
        let sec = &c.document.sections[0];
        assert_eq!((sec.paragraphs[2].text.as_str(), sec.paragraphs[2].node_id), ("th", 3));
        assert_eq!((sec.paragraphs[3].text.as_str(), sec.paragraphs[3].node_id), ("ree", 4));
    }
}
