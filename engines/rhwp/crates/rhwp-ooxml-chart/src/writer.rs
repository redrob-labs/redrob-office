//! [Redrob E7] A new OOXML (DrawingML) chart part from data.
//!
//! The layout follows what 한글 2022/2024 writes for a chart it creates itself
//! (`Chart/chartN.xml`, and the same bytes in the OLE's `OOXMLChartContents`):
//! a `c:chartSpace` with one plot, category and value axes for bar and line
//! plots, a right-hand legend, the 함초롬돋움 10 pt text default and the
//! `ho:hncChartStyle` extension. Each series refers to a column of an imagined
//! `Sheet1` (`$B`, `$C`, ...) with the categories in `$A`, as 한글's own data
//! sheet does, and carries its values in the caches the renderer and 한글 read.

use std::fmt::Write as _;

/// Plots a new chart can have.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NewChartKind {
    /// 묶은 세로 막대형
    Column,
    /// 묶은 가로 막대형
    Bar,
    /// 표식이 있는 꺾은선형
    Line,
    /// 2차원 원형 (first series only)
    Pie,
}

impl NewChartKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "column" => Some(Self::Column),
            "bar" => Some(Self::Bar),
            "line" => Some(Self::Line),
            "pie" => Some(Self::Pie),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewSeries {
    pub name: String,
    pub values: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewChart {
    pub kind: NewChartKind,
    pub title: Option<String>,
    pub categories: Vec<String>,
    pub series: Vec<NewSeries>,
}

/// Limits of a new chart: 한글's data sheet columns B..Z and a sane row count.
pub const MAX_SERIES: usize = 25;
pub const MAX_CATEGORIES: usize = 500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NewChartError {
    NoSeries,
    NoCategories,
    TooManySeries(usize),
    TooManyCategories(usize),
    /// series index, its value count, the category count
    LengthMismatch(usize, usize, usize),
    /// series index, point index
    NotFinite(usize, usize),
    UnsafeText(String),
}

impl std::fmt::Display for NewChartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoSeries => write!(f, "a chart needs at least one series"),
            Self::NoCategories => write!(f, "a chart needs at least one category"),
            Self::TooManySeries(n) => write!(f, "{n} series; at most {MAX_SERIES}"),
            Self::TooManyCategories(n) => write!(f, "{n} categories; at most {MAX_CATEGORIES}"),
            Self::LengthMismatch(s, v, c) => write!(f, "series {s} has {v} values for {c} categories"),
            Self::NotFinite(s, i) => write!(f, "series {s} value {i} is not a finite number"),
            Self::UnsafeText(t) => write!(f, "text contains characters XML cannot hold: {t:?}"),
        }
    }
}

impl std::error::Error for NewChartError {}

fn check_text(t: &str) -> Result<(), NewChartError> {
    if crate::patch::is_safe_text(t) {
        Ok(())
    } else {
        Err(NewChartError::UnsafeText(t.to_string()))
    }
}

fn esc(t: &str) -> String {
    let mut out = String::with_capacity(t.len());
    for ch in t.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

/// Shortest text that reads back as the same number ("4.3", "2", "-0.5").
fn num(v: f64) -> String {
    if v == v.trunc() && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        format!("{}", v)
    }
}

fn column(i: usize) -> char {
    (b'B' + i as u8) as char
}

impl NewChart {
    pub fn validate(&self) -> Result<(), NewChartError> {
        if self.series.is_empty() {
            return Err(NewChartError::NoSeries);
        }
        if self.categories.is_empty() {
            return Err(NewChartError::NoCategories);
        }
        if self.series.len() > MAX_SERIES {
            return Err(NewChartError::TooManySeries(self.series.len()));
        }
        if self.categories.len() > MAX_CATEGORIES {
            return Err(NewChartError::TooManyCategories(self.categories.len()));
        }
        if let Some(t) = &self.title {
            check_text(t)?;
        }
        for c in &self.categories {
            check_text(c)?;
        }
        for (si, s) in self.series.iter().enumerate() {
            check_text(&s.name)?;
            if s.values.len() != self.categories.len() {
                return Err(NewChartError::LengthMismatch(si, s.values.len(), self.categories.len()));
            }
            if let Some(i) = s.values.iter().position(|v| !v.is_finite()) {
                return Err(NewChartError::NotFinite(si, i));
            }
        }
        Ok(())
    }

    /// The chart part's bytes (UTF-8 XML).
    pub fn to_xml(&self) -> Result<Vec<u8>, NewChartError> {
        self.validate()?;
        let n = self.categories.len();
        let last_row = n + 1;
        let mut x = String::with_capacity(4096 + n * self.series.len() * 48);
        x.push_str(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><c:chartSpace xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:date1904 val="0"/><c:roundedCorners val="0"/><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:c14="http://schemas.microsoft.com/office/drawing/2007/8/2/chart" Requires="c14"><c14:style val="102"/></mc:Choice><mc:Fallback><c:style val="2"/></mc:Fallback></mc:AlternateContent><c:chart>"#);
        match &self.title {
            Some(t) if !t.is_empty() => {
                let _ = write!(
                    x,
                    r#"<c:title><c:tx><c:rich><a:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" anchorCtr="1"/><a:p><a:pPr algn="ctr"><a:defRPr sz="1200" b="1" i="0" u="none"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1200" b="1"/><a:t>{}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>"#,
                    esc(t)
                );
            }
            _ => x.push_str(r#"<c:autoTitleDeleted val="1"/>"#),
        }
        x.push_str("<c:plotArea><c:layout/>");
        let (open, close) = match self.kind {
            NewChartKind::Column => (r#"<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>"#, "</c:barChart>"),
            NewChartKind::Bar => (r#"<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>"#, "</c:barChart>"),
            NewChartKind::Line => (r#"<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>"#, "</c:lineChart>"),
            NewChartKind::Pie => (r#"<c:pieChart><c:varyColors val="1"/>"#, "</c:pieChart>"),
        };
        x.push_str(open);
        let series: &[NewSeries] = if self.kind == NewChartKind::Pie { &self.series[..1] } else { &self.series };
        for (i, s) in series.iter().enumerate() {
            let col = column(i);
            let _ = write!(
                x,
                r#"<c:ser><c:idx val="{i}"/><c:order val="{i}"/><c:tx><c:strRef><c:f>Sheet1!${col}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>{}</c:v></c:pt></c:strCache></c:strRef></c:tx>"#,
                esc(&s.name)
            );
            match self.kind {
                NewChartKind::Column | NewChartKind::Bar => x.push_str(r#"<c:invertIfNegative val="0"/>"#),
                NewChartKind::Line => x.push_str(r#"<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>"#),
                NewChartKind::Pie => {}
            }
            let _ = write!(x, r#"<c:cat><c:strRef><c:f>Sheet1!$A$2:$A${last_row}</c:f><c:strCache><c:ptCount val="{n}"/>"#);
            for (k, c) in self.categories.iter().enumerate() {
                let _ = write!(x, r#"<c:pt idx="{k}"><c:v>{}</c:v></c:pt>"#, esc(c));
            }
            let _ = write!(x, r#"</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!${col}$2:${col}${last_row}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="{n}"/>"#);
            for (k, v) in s.values.iter().enumerate() {
                let _ = write!(x, r#"<c:pt idx="{k}"><c:v>{}</c:v></c:pt>"#, num(*v));
            }
            x.push_str("</c:numCache></c:numRef></c:val>");
            if self.kind == NewChartKind::Line {
                x.push_str(r#"<c:smooth val="0"/>"#);
            }
            x.push_str("</c:ser>");
        }
        // Axis ids are arbitrary but must pair up; 한글 uses large random ones.
        const CAT_AX: u32 = 434250761;
        const VAL_AX: u32 = 14801119;
        match self.kind {
            NewChartKind::Column | NewChartKind::Bar => {
                let _ = write!(x, r#"<c:gapWidth val="150"/><c:overlap val="0"/><c:axId val="{CAT_AX}"/><c:axId val="{VAL_AX}"/>"#);
            }
            NewChartKind::Line => {
                let _ = write!(x, r#"<c:marker val="1"/><c:axId val="{CAT_AX}"/><c:axId val="{VAL_AX}"/>"#);
            }
            NewChartKind::Pie => x.push_str(r#"<c:firstSliceAng val="0"/>"#),
        }
        x.push_str(close);
        if self.kind != NewChartKind::Pie {
            let (cat_pos, val_pos) = if self.kind == NewChartKind::Bar { ("l", "b") } else { ("b", "l") };
            let _ = write!(
                x,
                r#"<c:catAx><c:axId val="{CAT_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="{cat_pos}"/><c:crossAx val="{VAL_AX}"/><c:delete val="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:tickMarkSkip val="1"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="{VAL_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="{val_pos}"/><c:crossAx val="{CAT_AX}"/><c:delete val="0"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>"#
            );
        }
        x.push_str(r#"<c:spPr><a:noFill/><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:noFill/><a:prstDash val="solid"/><a:round/><a:headEnd w="med" len="med"/><a:tailEnd w="med" len="med"/></a:ln></c:spPr></c:plotArea><c:legend><c:legendPos val="r"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/></c:chart><c:txPr><a:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" anchorCtr="1"/><a:p><a:pPr algn="l"><a:defRPr sz="1000" b="0" i="0" u="none"><a:latin typeface="함초롬돋움"/><a:ea typeface="함초롬돋움"/><a:cs typeface="함초롬돋움"/><a:sym typeface="함초롬돋움"/></a:defRPr></a:pPr><a:endParaRPr/></a:p></c:txPr><c:extLst><c:ext uri="CC8EB2C9-7E31-499d-B8F2-F6CE61031016"><ho:hncChartStyle xmlns:ho="http://schemas.haansoft.com/office/8.0" layoutIndex="-1" colorIndex="0" styleIndex="0"/></c:ext></c:extLst></c:chartSpace>"#);
        Ok(x.into_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::scan_chart_values;

    fn sample(kind: NewChartKind) -> NewChart {
        NewChart {
            kind,
            title: Some("분기별 매출 \"요약\"".into()),
            categories: vec!["1분기".into(), "2분기".into(), "3분기".into()],
            series: vec![
                NewSeries { name: "매출".into(), values: vec![4.3, 2.5, -1.0] },
                NewSeries { name: "비용".into(), values: vec![2.0, 3.0, 1e6] },
            ],
        }
    }

    #[test]
    fn every_kind_parses_and_scans_back_to_its_data() {
        for kind in [NewChartKind::Column, NewChartKind::Bar, NewChartKind::Line, NewChartKind::Pie] {
            let xml = sample(kind).to_xml().unwrap();
            let chart = crate::OoxmlChart::parse(&xml).unwrap_or_else(|| panic!("{kind:?} parses"));
            assert!(!chart.series.is_empty(), "{kind:?}");
            let data = scan_chart_values(&xml).unwrap();
            let expect_series = if kind == NewChartKind::Pie { 1 } else { 2 };
            assert_eq!(data.series.len(), expect_series, "{kind:?}");
            assert_eq!(data.series[0].name.as_deref(), Some("매출"));
            let values: Vec<&str> = data.series[0].values.iter().map(|p| p.text.as_str()).collect();
            assert_eq!(values, ["4.3", "2.5", "-1"]);
            let labels: Vec<&str> = data.series[0].labels.iter().map(|p| p.text.as_str()).collect();
            assert_eq!(labels, ["1분기", "2분기", "3분기"]);
        }
    }

    #[test]
    fn quotes_are_escaped_and_markup_is_refused() {
        let xml = String::from_utf8(sample(NewChartKind::Column).to_xml().unwrap()).unwrap();
        assert!(xml.contains("분기별 매출 &quot;요약&quot;"));
        assert!(xml.contains("<c:v>1000000</c:v>"));
        // Same rule as chart data edits (patch::is_safe_text): <, > and & never reach a chart.
        let mut c = sample(NewChartKind::Column);
        c.series[0].name = "A & B".into();
        assert!(matches!(c.to_xml(), Err(NewChartError::UnsafeText(_))));
    }

    #[test]
    fn bad_data_is_refused() {
        let mut c = sample(NewChartKind::Column);
        c.series[1].values.pop();
        assert_eq!(c.to_xml(), Err(NewChartError::LengthMismatch(1, 2, 3)));
        let mut c = sample(NewChartKind::Line);
        c.series[0].values[1] = f64::NAN;
        assert_eq!(c.to_xml(), Err(NewChartError::NotFinite(0, 1)));
        let mut c = sample(NewChartKind::Bar);
        c.series.clear();
        assert_eq!(c.to_xml(), Err(NewChartError::NoSeries));
        let mut c = sample(NewChartKind::Bar);
        c.categories[0] = "bad\u{1}".into();
        assert!(matches!(c.to_xml(), Err(NewChartError::UnsafeText(_))));
    }
}
