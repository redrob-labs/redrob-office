//! [Redrob E7] Insert a new chart from data.
//!
//! A chart 한글 makes itself is two copies of one OOXML chart part:
//!
//! - HWPX: `<hp:switch><hp:case><hp:chart chartIDRef="Chart/chartN.xml">` with the
//!   zip part, and `<hp:default><hp:ole>` pointing at an OLE storage whose nested
//!   CFB holds the same bytes as `OOXMLChartContents`;
//! - HWP 5.0: that OLE alone (the converter folds the switch to its default branch).
//!
//! This builds both from [`NewChart`], in the same model the HWPX parser makes
//! for a chart it reads (an `OleShape` with `chart_id_ref` and a
//! `chart_switch_fallback`), so saving, rendering, `listCharts` and the chart data
//! editor treat a new chart exactly like one 한글 wrote.
//!
//! What 한글 also stores and this does not: the legacy binary `Contents` chart and
//! the `OlePres000` preview picture inside the OLE. 한글 2022 reads
//! `OOXMLChartContents` first (#4055); whether it accepts a storage without the
//! other two is checked on the 한글 2024 runner (P-1), not here.

use crate::document_core::DocumentCore;
use crate::error::HwpError;
use crate::model::control::Control;
use crate::model::shape::{
    CommonObjAttr, HorzAlign, HorzRelTo, ObjectNumberingType, OleShape, ShapeObject, TextWrap,
    VertAlign, VertRelTo,
};
use crate::ooxml_chart::writer::NewChart;

/// Root CLSID of 한글's chart OLE storage (`{4C3DA137-DC90-47B9-9BED-59DAE352A280}`),
/// in the on-disk byte order (first three fields little-endian).
const HNC_CHART_CLSID: [u8; 16] = [
    0x37, 0xA1, 0x3D, 0x4C, 0x90, 0xDC, 0xB9, 0x47, 0x9B, 0xED, 0x59, 0xDA, 0xE3, 0x52, 0xA2, 0x80,
];

/// The HWPX parser loads `Chart/chart1.xml` .. `Chart/chart64.xml` and stops at the first gap.
const MAX_CHART_PARTS: u16 = 64;
const CHART_PART_BASE: u16 = 60000;

/// 한글's default size for a new chart (114 mm × 66 mm).
pub const DEFAULT_CHART_WIDTH: u32 = 32250;
pub const DEFAULT_CHART_HEIGHT: u32 = 18750;

impl DocumentCore {
    /// The next free chart part number (1-based, contiguous).
    fn next_chart_part(&self) -> Result<u16, HwpError> {
        let mut n = 1u16;
        while self
            .document
            .bin_data_content
            .iter()
            .any(|c| c.extension == "ooxml_chart" && c.id == CHART_PART_BASE + n)
        {
            n += 1;
        }
        if n > MAX_CHART_PARTS {
            return Err(HwpError::RenderError(format!(
                "a document holds at most {MAX_CHART_PARTS} charts"
            )));
        }
        Ok(n)
    }

    /// A storage id for a new embedded BinData that ignores chart parts' sparse ids.
    fn next_storage_id_excluding_charts(&self) -> u16 {
        let max_content = self
            .document
            .bin_data_content
            .iter()
            .filter(|c| c.extension != "ooxml_chart")
            .map(|c| c.id)
            .max()
            .unwrap_or(0);
        let max_storage = self
            .document
            .doc_info
            .bin_data_list
            .iter()
            .map(|b| b.storage_id)
            .max()
            .unwrap_or(0);
        max_content.max(max_storage).saturating_add(1)
    }

    /// Register an OLE storage BinData; returns its 1-based position id.
    fn register_ole_storage(&mut self, cfb: Vec<u8>) -> u16 {
        use crate::model::bin_data::{
            BinData, BinDataCompression, BinDataContent, BinDataStatus, BinDataType,
        };
        let position_id = self.document.doc_info.bin_data_list.len() as u16 + 1;
        let storage_id = self.next_storage_id_excluding_charts();
        self.document.bin_data_content.push(BinDataContent {
            id: storage_id,
            data: crate::model::bin_data::BinDataBytes::from_shared(cfb),
            extension: "ole".to_string(),
        });
        self.document.doc_info.bin_data_list.push(BinData {
            raw_data: None,
            // bits 0-3 = 2 (Storage), bits 8-9 = 1 (Success)
            attr: 0x0102,
            data_type: BinDataType::Storage,
            compression: BinDataCompression::Default,
            status: BinDataStatus::Success,
            abs_path: None,
            rel_path: None,
            storage_id,
            extension: Some("ole".to_string()),
        });
        self.document.doc_info.raw_stream = None;
        position_id
    }

    /// Insert `chart` at a body position as a floating object anchored to the
    /// paragraph, 한글's default for a new chart. Returns `{ok, paraIdx, controlIdx}`.
    pub fn insert_chart_native(
        &mut self,
        section_idx: usize,
        para_idx: usize,
        char_offset: usize,
        chart: &NewChart,
        width: u32,
        height: u32,
    ) -> Result<String, HwpError> {
        let section = self
            .document
            .sections
            .get(section_idx)
            .ok_or_else(|| HwpError::RenderError(format!("구역 인덱스 {} 범위 초과", section_idx)))?;
        if para_idx >= section.paragraphs.len() {
            return Err(HwpError::RenderError(format!("문단 인덱스 {} 범위 초과", para_idx)));
        }
        let width = width.max(super::MIN_SHAPE_SIZE);
        let height = height.max(super::MIN_SHAPE_SIZE);
        let xml = chart
            .to_xml()
            .map_err(|e| HwpError::RenderError(format!("chart: {e}")))?;
        let part = self.next_chart_part()?;

        // The OLE copy first: its storage id must not see the new chart part's sparse id.
        let cfb = crate::serializer::mini_cfb::build_cfb_with_root_clsid(
            &[("OOXMLChartContents", &xml)],
            HNC_CHART_CLSID,
        )
        .map_err(|e| HwpError::RenderError(format!("chart OLE: {e}")))?;
        let ole_position = self.register_ole_storage(cfb);
        self.document
            .bin_data_content
            .push(crate::model::bin_data::BinDataContent {
                id: CHART_PART_BASE + part,
                data: crate::model::bin_data::BinDataBytes::from_shared(xml),
                extension: "ooxml_chart".to_string(),
            });

        let z_order = self.max_shape_z_order_in_section(section_idx) + 1;
        let instance_id = {
            let mut h: u32 = 0x42a00000;
            h = h.wrapping_add((part as u32) << 8);
            h = h.wrapping_add(z_order as u32 * 0x1f);
            h = h.wrapping_add(width ^ height.rotate_left(7));
            h | 0x40000000
        };
        let mut common = CommonObjAttr {
            width,
            height,
            z_order,
            instance_id,
            treat_as_char: false,
            flow_with_text: true,
            vert_rel_to: VertRelTo::Para,
            vert_align: VertAlign::Top,
            horz_rel_to: HorzRelTo::Column,
            horz_align: HorzAlign::Left,
            text_wrap: TextWrap::Square,
            numbering_type: ObjectNumberingType::Picture,
            hwp5_gen_shape_attr_bit26: true,
            hwp5_gen_shape_attr_bit28: true,
            ..Default::default()
        };
        common.attr = crate::parser::hwpx::section::pack_hwpx_common_obj_attr(&common);

        let mut ole = OleShape {
            common,
            extent_x: width as i32,
            extent_y: height as i32,
            ..Default::default()
        };
        crate::parser::hwpx::section::apply_hwpx_ole_shape_component_contract(&mut ole);
        let mut fallback = ole.clone();
        fallback.bin_data_id = ole_position as u32;
        // 한글's own default branch carries instid 0 and the chart's id.
        fallback.hwpx_ole_id = Some(instance_id);
        fallback.common.instance_id = 0;
        ole.bin_data_id = (CHART_PART_BASE + part) as u32;
        ole.chart_id_ref = Some(format!("Chart/chart{part}.xml"));
        ole.chart_switch_fallback = Some(Box::new(fallback));

        self.document.sections[section_idx].raw_stream = None;
        let insert_ctrl_idx;
        {
            let paragraph = &mut self.document.sections[section_idx].paragraphs[para_idx];
            let positions = crate::document_core::helpers::find_control_text_positions(paragraph);
            let insert_idx = positions
                .iter()
                .position(|&pos| pos > char_offset)
                .unwrap_or(paragraph.controls.len());
            paragraph.align_ctrl_data_records();
            paragraph
                .controls
                .insert(insert_idx, Control::Shape(Box::new(ShapeObject::Ole(Box::new(ole)))));
            paragraph.ctrl_data_records.insert(insert_idx, None);
            paragraph.shift_for_inline_control_insert(insert_idx, char_offset);
            paragraph.char_count += 8;
            paragraph.control_mask |= 0x00000800;
            paragraph.has_para_text = true;
            insert_ctrl_idx = insert_idx;
        }
        self.shift_active_field_for_control_insert(section_idx, para_idx, insert_ctrl_idx);
        self.recompose_section(section_idx);
        self.paginate_if_needed();
        self.event_log.push(crate::model::event::DocumentEvent::PictureInserted {
            section: section_idx,
            para: para_idx,
        });
        Ok(crate::document_core::helpers::json_ok_with(&format!(
            "\"paraIdx\":{},\"controlIdx\":{},\"chart\":{}",
            para_idx, insert_ctrl_idx, part
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ooxml_chart::writer::{NewChartKind, NewSeries};

    fn sample(kind: NewChartKind) -> NewChart {
        NewChart {
            kind,
            title: Some("분기별 실적".into()),
            categories: vec!["1분기".into(), "2분기".into(), "3분기".into()],
            series: vec![
                NewSeries { name: "매출".into(), values: vec![4.3, 2.5, 3.5] },
                NewSeries { name: "비용".into(), values: vec![2.0, 3.0, 1.5] },
            ],
        }
    }

    fn blank() -> DocumentCore {
        let mut core = DocumentCore::new_empty();
        core.create_blank_document_native().expect("blank");
        core
    }

    fn values(core: &DocumentCore) -> Vec<String> {
        let charts: serde_json::Value = serde_json::from_str(&core.list_charts_native().unwrap()).unwrap();
        assert_eq!(charts.as_array().map(|a| a.len()), Some(1), "one chart: {charts}");
        let c = &charts[0];
        let data: serde_json::Value = serde_json::from_str(
            &core
                .get_chart_data_native(
                    c["section"].as_u64().unwrap() as usize,
                    c["paragraph"].as_u64().unwrap() as usize,
                    c["control"].as_u64().unwrap() as usize,
                )
                .unwrap(),
        )
        .unwrap();
        assert_eq!(data["ok"], true, "{data}");
        data["series"][0]["values"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn a_new_chart_lists_and_reads_back() {
        let mut core = blank();
        let r = core
            .insert_chart_native(0, 0, 0, &sample(NewChartKind::Column), DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT)
            .unwrap();
        assert!(r.contains("\"chart\":1"), "{r}");
        assert_eq!(values(&core), ["4.3", "2.5", "3.5"]);
    }

    #[test]
    fn a_new_chart_survives_hwpx_and_hwp_saves() {
        for kind in [NewChartKind::Column, NewChartKind::Bar, NewChartKind::Line, NewChartKind::Pie] {
            let mut core = blank();
            core.insert_chart_native(0, 0, 0, &sample(kind), DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT)
                .unwrap();
            let hwpx = core.export_hwpx_native().expect("hwpx");
            let back = DocumentCore::from_bytes(&hwpx).expect("reopen hwpx");
            assert_eq!(values(&back), ["4.3", "2.5", "3.5"], "{kind:?} hwpx");
            let hwp = core.export_hwp_with_adapter().expect("hwp");
            let back5 = DocumentCore::from_bytes(&hwp).expect("reopen hwp");
            assert_eq!(values(&back5), ["4.3", "2.5", "3.5"], "{kind:?} hwp");
            // The HWPX copy saved again as HWP keeps the chart too.
            let again = back.export_hwp_with_adapter().expect("hwpx→hwp");
            assert_eq!(values(&DocumentCore::from_bytes(&again).unwrap()), ["4.3", "2.5", "3.5"], "{kind:?} hwpx→hwp");
        }
    }

    #[test]
    fn a_second_chart_takes_the_next_part_and_storage() {
        let mut core = blank();
        core.insert_chart_native(0, 0, 0, &sample(NewChartKind::Column), 20000, 12000).unwrap();
        let r = core.insert_chart_native(0, 0, 0, &sample(NewChartKind::Pie), 20000, 12000).unwrap();
        assert!(r.contains("\"chart\":2"), "{r}");
        let ids: Vec<u16> = core.document.doc_info.bin_data_list.iter().map(|b| b.storage_id).collect();
        assert!(ids.iter().all(|&id| id < CHART_PART_BASE), "storage ids stay out of the chart range: {ids:?}");
        let hwpx = core.export_hwpx_native().unwrap();
        let back = DocumentCore::from_bytes(&hwpx).unwrap();
        let charts: serde_json::Value = serde_json::from_str(&back.list_charts_native().unwrap()).unwrap();
        assert_eq!(charts.as_array().unwrap().len(), 2);
    }

    #[test]
    fn chart_data_edits_apply_to_a_new_chart() {
        let mut core = blank();
        core.insert_chart_native(0, 0, 0, &sample(NewChartKind::Column), DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT)
            .unwrap();
        let c: serde_json::Value = serde_json::from_str(&core.list_charts_native().unwrap()).unwrap();
        let (p, ctrl) = (c[0]["paragraph"].as_u64().unwrap() as usize, c[0]["control"].as_u64().unwrap() as usize);
        let r = core
            .set_chart_data_native(0, p, ctrl, r#"{"series":[{"values":["4.3","9","3.5"]},{"values":["2","3","1.5"]}]}"#)
            .unwrap();
        assert!(r.contains("\"ok\":true"), "{r}");
        assert_eq!(values(&core), ["4.3", "9", "3.5"]);
    }

    #[test]
    fn a_new_chart_paints_its_series_and_title() {
        let mut core = blank();
        let empty = core.render_page_svg_native(0).unwrap();
        core.insert_chart_native(0, 0, 0, &sample(NewChartKind::Column), DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT)
            .unwrap();
        let svg = core.render_page_svg_native(0).unwrap();
        assert!(svg.len() > empty.len() + 500, "the chart draws something");
        for text in ["분기별 실적", "매출", "비용", "1분기"] {
            assert!(svg.contains(text), "{text} is painted");
        }
        // Reopened from HWP 5.0 it paints the same words.
        let back = DocumentCore::from_bytes(&core.export_hwp_with_adapter().unwrap()).unwrap();
        let svg5 = back.render_page_svg_native(0).unwrap();
        for text in ["분기별 실적", "매출", "1분기"] {
            assert!(svg5.contains(text), "{text} is painted from HWP 5.0");
        }
    }

    #[test]
    fn bad_data_inserts_nothing() {
        let mut core = blank();
        let mut c = sample(NewChartKind::Column);
        c.series[0].values.pop();
        assert!(core.insert_chart_native(0, 0, 0, &c, 1000, 1000).is_err());
        assert_eq!(core.document.bin_data_content.len(), 0);
        assert_eq!(core.document.doc_info.bin_data_list.len(), 0);
    }
}
