//! Studio 하이퍼링크의 엄격한 JSON options 어댑터 (#6963).
use super::HwpDocument;
use crate::document_core::hyperlink::HyperlinkTarget;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

fn parse<T: serde::de::DeserializeOwned>(json: &str) -> Result<T, JsValue> {
    serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOptions {
    target: HyperlinkTarget,
    start: usize,
    end: usize,
    uri: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOptions {
    target: HyperlinkTarget,
    field_id: u32,
    uri: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TextOptions {
    target: HyperlinkTarget,
    field_id: u32,
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RemoveOptions {
    target: HyperlinkTarget,
    field_id: u32,
    #[serde(default)]
    restore_formatting: bool,
}

#[wasm_bindgen]
impl HwpDocument {
    /// 표시 문자는 Unicode scalar 축이다. 대상 누락 시 본문으로 폴백하지 않는다.
    #[wasm_bindgen(js_name = getHyperlinkContext)]
    pub fn get_hyperlink_context(&self, target_json: &str) -> Result<String, JsValue> {
        let target: HyperlinkTarget = parse(target_json)?;
        let paragraph = self.core.hyperlink_paragraph(&target)?;
        Ok(serde_json::json!({
            "text": paragraph.text,
            "links": self.core.hyperlinks_native(&target)?,
        })
        .to_string())
    }

    #[wasm_bindgen(js_name = insertHyperlinkEx)]
    pub fn insert_hyperlink_ex(&mut self, options_json: &str) -> Result<u32, JsValue> {
        let o: InsertOptions = parse(options_json)?;
        self.core
            .insert_hyperlink_native(&o.target, o.start, o.end, &o.uri)
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateHyperlinkEx)]
    pub fn update_hyperlink_ex(&mut self, options_json: &str) -> Result<bool, JsValue> {
        let o: UpdateOptions = parse(options_json)?;
        self.core
            .update_hyperlink_native(&o.target, o.field_id, &o.uri)
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = replaceHyperlinkTextEx)]
    pub fn replace_hyperlink_text_ex(&mut self, options_json: &str) -> Result<bool, JsValue> {
        let o: TextOptions = parse(options_json)?;
        self.core
            .replace_hyperlink_text_native(&o.target, o.field_id, &o.text)
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = removeHyperlinkEx)]
    pub fn remove_hyperlink_ex(&mut self, options_json: &str) -> Result<(), JsValue> {
        let o: RemoveOptions = parse(options_json)?;
        self.core
            .remove_hyperlink_with_format_native(&o.target, o.field_id, o.restore_formatting)
            .map_err(Into::into)
    }

    /// [Redrob E4] Every memo: field id, number, author, body, target, node id, range and annotated text.
    #[wasm_bindgen(js_name = listMemos)]
    pub fn list_memos(&mut self) -> String {
        serde_json::to_string(&self.core.list_memos_native()).unwrap_or_else(|_| "[]".into())
    }

    /// [Redrob E4] `{target, start, end, author, body}` → field id.
    #[wasm_bindgen(js_name = addMemo)]
    pub fn add_memo(&mut self, options_json: &str) -> Result<u32, JsValue> {
        let o: MemoAddOptions = parse(options_json)?;
        self.core.add_memo_native(&o.target, o.start, o.end, &o.author, &o.body).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = setMemoBody)]
    pub fn set_memo_body(&mut self, field_id: u32, body: &str) -> Result<(), JsValue> {
        self.core.set_memo_body_native(field_id, body).map_err(Into::into)
    }

    /// [Redrob 4.2] The Redrob comment-metadata part (JSON text), or "" when absent.
    #[wasm_bindgen(js_name = getRedrobComments)]
    pub fn get_redrob_comments(&self) -> String {
        self.core.document().redrob_comments.as_deref().map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default()
    }

    /// [Redrob 4.2] Set the comment-metadata part; "" removes it.
    #[wasm_bindgen(js_name = setRedrobComments)]
    pub fn set_redrob_comments(&mut self, json: &str) {
        self.core.set_redrob_comments_native(json);
    }

    /// [Redrob E5b] Every tracked change: id, kind, author, date, range and text.
    #[wasm_bindgen(js_name = listRevisions)]
    pub fn list_revisions(&mut self) -> String {
        serde_json::to_string(&self.core.list_revisions_native()).unwrap_or_else(|_| "[]".into())
    }

    /// [Redrob E5b] `{target, start, end, kind, author, date}` → revision id.
    #[wasm_bindgen(js_name = addRevision)]
    pub fn add_revision(&mut self, options_json: &str) -> Result<u32, JsValue> {
        let o: RevisionAddOptions = parse(options_json)?;
        self.core.add_revision_native(&o.target, o.start, o.end, &o.kind, &o.author, &o.date).map_err(Into::into)
    }

    /// [Redrob E5b] Remove a revision's marks and table entry; the text stays.
    #[wasm_bindgen(js_name = removeRevision)]
    pub fn remove_revision(&mut self, id: u32) -> Result<(), JsValue> {
        self.core.remove_revision_native(id).map_err(Into::into)
    }

    /// [Redrob E7] `{section, para, offset, kind, title?, categories, series:[{name, values}], width?, height?}`
    /// → `{ok, paraIdx, controlIdx, chart}`. `kind` is column, bar, line or pie; the default
    /// size is 한글's for a new chart (32250 × 18750 HWPUNIT).
    #[wasm_bindgen(js_name = insertChart)]
    pub fn insert_chart(&mut self, options_json: &str) -> Result<String, JsValue> {
        use crate::ooxml_chart::writer::{NewChart, NewChartKind, NewSeries};
        let o: ChartInsertOptions = parse(options_json)?;
        let kind = NewChartKind::parse(&o.kind)
            .ok_or_else(|| JsValue::from_str(&format!("unknown chart kind {:?}", o.kind)))?;
        let chart = NewChart {
            kind,
            title: o.title,
            categories: o.categories,
            series: o.series.into_iter().map(|s| NewSeries { name: s.name, values: s.values }).collect(),
        };
        self.core
            .insert_chart_native(
                o.section,
                o.para,
                o.offset,
                &chart,
                o.width.unwrap_or(32250),
                o.height.unwrap_or(18750),
            )
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = removeMemo)]
    pub fn remove_memo(&mut self, field_id: u32) -> Result<(), JsValue> {
        self.core.remove_memo_native(field_id).map_err(Into::into)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MemoAddOptions {
    target: HyperlinkTarget,
    start: usize,
    end: usize,
    author: String,
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevisionAddOptions {
    target: HyperlinkTarget,
    start: usize,
    end: usize,
    kind: String,
    author: String,
    date: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChartSeriesOptions {
    name: String,
    values: Vec<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChartInsertOptions {
    section: usize,
    para: usize,
    offset: usize,
    kind: String,
    #[serde(default)]
    title: Option<String>,
    categories: Vec<String>,
    series: Vec<ChartSeriesOptions>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}
