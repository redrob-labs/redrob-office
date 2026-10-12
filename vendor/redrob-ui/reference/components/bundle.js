/* @ds-bundle: {"format":4,"namespace":"Redrob","components":[{"name":"Mark"},{"name":"MarkReveal"},{"name":"Layer"},{"name":"Illustration"},{"name":"Diagram"},{"name":"Display"},{"name":"Statement"},{"name":"Quote"},{"name":"SectionMark"},{"name":"Button"},{"name":"IconButton"},{"name":"Menu"},{"name":"Form"},{"name":"Input"},{"name":"Textarea"},{"name":"Select"},{"name":"Combobox"},{"name":"Checkbox"},{"name":"Radio"},{"name":"Switch"},{"name":"DatePicker"},{"name":"TimePicker"},{"name":"TimeZonePicker"},{"name":"FileUpload"},{"name":"NameInput"},{"name":"AddressInput"},{"name":"PhoneInput"},{"name":"DateInput"},{"name":"Money"},{"name":"ConvertedAmount"},{"name":"Timestamp"},{"name":"Tabs"},{"name":"Breadcrumb"},{"name":"Pagination"},{"name":"Stepper"},{"name":"Accordion"},{"name":"Scroller"},{"name":"Alert"},{"name":"Toast"},{"name":"Modal"},{"name":"Drawer"},{"name":"Tooltip"},{"name":"Progress"},{"name":"Loader"},{"name":"Skeleton"},{"name":"EmptyState"},{"name":"Card"},{"name":"Table"},{"name":"Stat"},{"name":"Chart"},{"name":"Sparkline"},{"name":"Badge"},{"name":"Avatar"},{"name":"AppShell"},{"name":"PageShell"},{"name":"SiteHeader"},{"name":"SiteFooter"},{"name":"Band"},{"name":"LangSwitch"},{"name":"ThemeSwitch"},{"name":"ConsentBar"},{"name":"Message"},{"name":"Composer"},{"name":"ComposerMode"},{"name":"ModelPicker"},{"name":"ModelGuide"},{"name":"ComposerStatus"},{"name":"ProtectionStatus"},{"name":"PrivacyProtection"},{"name":"MemoryScope"},{"name":"CrossCheckSetting"},{"name":"AnswerReceipt"},{"name":"PrivateText"},{"name":"Opinion"},{"name":"ThreadNote"},{"name":"MemoryList"},{"name":"OpinionGrid"},{"name":"PlanQuestions"},{"name":"PlanDocument"},{"name":"FactCheckReport"},{"name":"ChallengeReport"},{"name":"Streaming"},{"name":"PromptSuggestions"},{"name":"Citation"},{"name":"Confidence"},{"name":"AgentAction"},{"name":"AgentTimeline"},{"name":"ApprovalStep"},{"name":"TaskStatus"},{"name":"AgentRoster"},{"name":"AgentHandoff"},{"name":"AccessList"},{"name":"Changes"},{"name":"Meter"},{"name":"ScheduleRow"},{"name":"SchedulePicker"},{"name":"PlaybookRow"},{"name":"AppAccess"},{"name":"ConnectorCard"},{"name":"CheckIn"},{"name":"SourceSet"},{"name":"Evidence"},{"name":"Criteria"},{"name":"MatchBreakdown"},{"name":"ReviewGrid"},{"name":"Finding"},{"name":"Redline"},{"name":"Playbook"},{"name":"Shortlist"},{"name":"DecisionNotice"},{"name":"Hero"},{"name":"LogoRow"},{"name":"FeatureRow"},{"name":"Figure"},{"name":"CustomerStory"},{"name":"StoryHeader"},{"name":"PriceTable"},{"name":"Milestones"},{"name":"PeopleList"},{"name":"IndexHeader"},{"name":"PostList"},{"name":"ArticleLayout"},{"name":"LegalDoc"}]} */
(function () {
  'use strict';

  var React = window.React;
  var h = React.createElement;

  /* The thirteen products in suite order (20-color.md, Product colors): the launch seven, then the
     next six. Band and AppShell accept these keys and nothing else. */
  var PRODUCT_KEYS = ['chat', 'cowork', 'browser', 'console', 'office', 'design', 'code', 'mail', 'books', 'jobs', 'skill-tests', 'passport', 'craft'];
  var PRODUCT_KEYS_GROUND = {}; PRODUCT_KEYS.forEach(function (k) { PRODUCT_KEYS_GROUND[k] = 1; });
  var PRODUCT_KEY_RE = new RegExp('^(' + PRODUCT_KEYS.join('|') + ')$');

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (!a) continue;
      if (typeof a === 'string') out.push(a);
      else if (typeof a === 'object') {
        for (var k in a) if (a[k]) out.push(k);
      }
    }
    return out.join(' ');
  }

  function omit(props, keys) {
    var out = {};
    for (var k in props) if (keys.indexOf(k) === -1) out[k] = props[k];
    return out;
  }

  var uid = 0;
  function nextId(prefix) {
    uid += 1;
    return prefix + '-' + uid;
  }
  /* An id that survives re-renders, so a label, a hint and a Form error link keep
     pointing at the same field. Call it unconditionally, before any early return. */
  function useStableId(prefix) {
    var r = React.useRef(null);
    if (r.current === null) r.current = nextId(prefix);
    return r.current;
  }

  /* ---- icons -------------------------------------------------------- */

  function svg(props, children) {
    return h(
      'svg',
      Object.assign(
        {
          viewBox: '0 0 24 24',
          width: '1em',
          height: '1em',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
          strokeMiterlimit: 3,
          'aria-hidden': 'true',
          focusable: 'false'
        },
        props
      ),
      children
    );
  }

  /* Redrob icons. 24px box, 20px live area, 2px stroke, butt caps and miter
     joins. Every chevron, arrowhead, ray and slash runs at 40 degrees - the
     logo's rake and the axis every gradient travels. Two named exceptions:
     close, because a symmetric crossing reads as a crossing rather than a
     direction, and spark, whose angles belong to the bolt. A ring that bounds
     something opens 62 degrees on that axis; a ring that IS the thing - a clock
     face, a globe - stays closed. One corner of every box is square. */
  var Icons = {
    filePlus: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L18.5 7.5V19.5A1.5 1.5 0 0 1 17 21H7A1.5 1.5 0 0 1 5.5 19.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.5 18.5 7.5" , key: "b" }), h("line", { x1: 12, y1: 11.8, x2: 12, y2: 17.8 , key: "c" }), h("line", { x1: 9, y1: 14.8, x2: 15, y2: 14.8 , key: "d" })]); },
    code: function (p) { return svg(p, [h("polyline", { points: "9 7.8 4 12 9 16.2" , key: "a" }), h("polyline", { points: "15 7.8 20 12 15 16.2" , key: "b" })]); },
    terminal: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("polyline", { points: "7 9.9 10 12.42 7 14.93" , key: "b" }), h("line", { x1: 12.5, y1: 14.93, x2: 17, y2: 14.93 , key: "c" })]); },
    database: function (p) { return svg(p, [h("ellipse", { cx: 12, cy: 6, rx: 7, ry: 3 , key: "a" }), h("path", { d: "M5 6V18A7 3 0 0 0 19 18V6" , key: "b" }), h("path", { d: "M5 12A7 3 0 0 0 19 12" , key: "c" })]); },
    server: function (p) { return svg(p, [h("path", { d: "M3 4H19A2 2 0 0 1 21 6V9A2 2 0 0 1 19 11H5A2 2 0 0 1 3 9Z" , key: "a" }), h("path", { d: "M3 13H19A2 2 0 0 1 21 15V18A2 2 0 0 1 19 20H5A2 2 0 0 1 3 18Z" , key: "b" }), h("rect", { x: 6, y: 6.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "c" }), h("rect", { x: 6, y: 15.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "d" }), h("line", { x1: 11, y1: 7.5, x2: 18, y2: 7.5 , key: "e" }), h("line", { x1: 11, y1: 16.5, x2: 18, y2: 16.5 , key: "f" })]); },
    cloud: function (p) { return svg(p, h("path", { d: "M7.5 18.5H17A3.5 3.5 0 0 0 17 11.5A5.5 5.5 0 0 0 6.6 12.3A3.2 3.2 0 0 0 7.5 18.5Z" , key: "a" })); },
    cloudOff: function (p) { return svg(p, [h("path", { d: "M7.5 18.5H17A3.5 3.5 0 0 0 17 11.5A5.5 5.5 0 0 0 6.6 12.3A3.2 3.2 0 0 0 7.5 18.5Z" , key: "a" }), h("line", { x1: 4.5, y1: 6.5, x2: 19.5, y2: 19.09 , key: "b" })]); },
    wifi: function (p) { return svg(p, [h("path", { d: "M4.34 13.07A10 10 0 0 1 19.66 13.07" , key: "a" }), h("path", { d: "M7.1 15.39A6.4 6.4 0 0 1 16.9 15.39" , key: "b" }), h("path", { d: "M9.85 17.7A2.8 2.8 0 0 1 14.15 17.7" , key: "c" }), h("circle", { cx: 12, cy: 19.5, r: 1.4, fill: "currentColor", stroke: "none" , key: "d" })]); },
    wifiOff: function (p) { return svg(p, [h("path", { d: "M4.34 13.07A10 10 0 0 1 19.66 13.07" , key: "a" }), h("path", { d: "M7.1 15.39A6.4 6.4 0 0 1 16.9 15.39" , key: "b" }), h("path", { d: "M9.85 17.7A2.8 2.8 0 0 1 14.15 17.7" , key: "c" }), h("circle", { cx: 12, cy: 19.5, r: 1.4, fill: "currentColor", stroke: "none" , key: "d" }), h("line", { x1: 4.5, y1: 6.5, x2: 19.5, y2: 19.09 , key: "e" })]); },
    sync: function (p) { return svg(p, [h("path", { d: "M12 5.5A6.5 6.5 0 0 1 18.5 12" , key: "a" }), h("polyline", { points: "16.57 9.7 18.5 12 20.43 9.7" , key: "b" }), h("path", { d: "M12 18.5A6.5 6.5 0 0 1 5.5 12" , key: "c" }), h("polyline", { points: "7.43 14.3 5.5 12 3.57 14.3" , key: "d" })]); },
    cpu: function (p) { return svg(p, [h("path", { d: "M6 6H16A2 2 0 0 1 18 8V16A2 2 0 0 1 16 18H8A2 2 0 0 1 6 16Z" , key: "a" }), h("rect", { x: 9.5, y: 9.5, width: 5, height: 5 , key: "b" }), h("line", { x1: 9.5, y1: 3, x2: 9.5, y2: 6 , key: "c" }), h("line", { x1: 14.5, y1: 3, x2: 14.5, y2: 6 , key: "d" }), h("line", { x1: 9.5, y1: 18, x2: 9.5, y2: 21 , key: "e" }), h("line", { x1: 14.5, y1: 18, x2: 14.5, y2: 21 , key: "f" }), h("line", { x1: 3, y1: 9.5, x2: 6, y2: 9.5 , key: "g" }), h("line", { x1: 3, y1: 14.5, x2: 6, y2: 14.5 , key: "h" }), h("line", { x1: 18, y1: 9.5, x2: 21, y2: 9.5 , key: "i" }), h("line", { x1: 18, y1: 14.5, x2: 21, y2: 14.5 , key: "j" })]); },
    api: function (p) { return svg(p, [h("path", { d: "M9.5 4.5A2.5 2.5 0 0 0 7 7V10A2 2 0 0 1 5 12A2 2 0 0 1 7 14V17A2.5 2.5 0 0 0 9.5 19.5" , key: "a" }), h("path", { d: "M14.5 4.5A2.5 2.5 0 0 1 17 7V10A2 2 0 0 0 19 12A2 2 0 0 0 17 14V17A2.5 2.5 0 0 1 14.5 19.5" , key: "b" })]); },
    log: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 7, x2: 7.5, y2: 7 , key: "a" }), h("line", { x1: 10, y1: 7, x2: 20.5, y2: 7 , key: "b" }), h("line", { x1: 3.5, y1: 12, x2: 7.5, y2: 12 , key: "c" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12 , key: "d" }), h("line", { x1: 3.5, y1: 17, x2: 7.5, y2: 17 , key: "e" }), h("line", { x1: 10, y1: 17, x2: 20.5, y2: 17 , key: "f" })]); },
    plug: function (p) { return svg(p, [h("line", { x1: 9, y1: 3.5, x2: 9, y2: 8 , key: "a" }), h("line", { x1: 15, y1: 3.5, x2: 15, y2: 8 , key: "b" }), h("path", { d: "M6.5 8H17.5V12A5.5 5.5 0 0 1 6.5 12Z" , key: "c" }), h("line", { x1: 12, y1: 17.5, x2: 12, y2: 20.5 , key: "d" })]); },
    power: function (p) { return svg(p, [h("path", { d: "M7.08 5.7A8 8 0 1 0 16.92 5.7" , key: "a" }), h("line", { x1: 12, y1: 3, x2: 12, y2: 11.5 , key: "b" })]); },
    gauge: function (p) { return svg(p, [h("path", { d: "M4 16A8 8 0 0 1 20 16" , key: "a" }), h("line", { x1: 12, y1: 16, x2: 7.02, y2: 11.82 , key: "b" }), h("circle", { cx: 12, cy: 16, r: 1.6, fill: "currentColor", stroke: "none" , key: "c" })]); },
    package: function (p) { return svg(p, [h("path", { d: "M3.5 8H20.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19Z" , key: "a" }), h("polyline", { points: "3.5 8 6 4 18 4 20.5 8" , key: "b" }), h("line", { x1: 12, y1: 4, x2: 12, y2: 20.5 , key: "c" })]); },
    pulse: function (p) { return svg(p, h("polyline", { points: "3 12 7.5 12 9.5 6.5 13 17.5 15 12 21 12" , key: "a" })); },
    monitor: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V14.5A2 2 0 0 1 19 16.5H5A2 2 0 0 1 3 14.5Z" , key: "a" }), h("line", { x1: 12, y1: 16.5, x2: 12, y2: 20 , key: "b" }), h("line", { x1: 8, y1: 20, x2: 16, y2: 20 , key: "c" })]); },
    sun: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 3.2, key: "a" }), h("line", { x1: 17.8, y1: 12.0, x2: 21.2, y2: 12.0, key: "b" }), h("line", { x1: 16.44, y1: 8.27, x2: 19.05, y2: 6.09, key: "c" }), h("line", { x1: 12.0, y1: 6.2, x2: 12.0, y2: 2.8, key: "d" }), h("line", { x1: 7.56, y1: 8.27, x2: 4.95, y2: 6.09, key: "e" }), h("line", { x1: 6.2, y1: 12.0, x2: 2.8, y2: 12.0, key: "f" }), h("line", { x1: 7.56, y1: 15.73, x2: 4.95, y2: 17.91, key: "g" }), h("line", { x1: 12.0, y1: 17.8, x2: 12.0, y2: 21.2, key: "h" }), h("line", { x1: 16.44, y1: 15.73, x2: 19.05, y2: 17.91, key: "i" })]); },
    moon: function (p) { return svg(p, h("path", { d: "M15.2 3.6A8.6 8.6 0 1 0 20.4 15.4A6.9 6.9 0 0 1 15.2 3.6Z", key: "a" })); },
    signIn: function (p) { return svg(p, [h("path", { d: "M13.5 3.5H18.5A2 2 0 0 1 20.5 5.5V18.5A2 2 0 0 1 18.5 20.5H13.5" , key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 12, y2: 12 , key: "b" }), h("polyline", { points: "8.78 14.7 12 12 8.78 9.3" , key: "c" })]); },
    signOut: function (p) { return svg(p, [h("path", { d: "M10.5 3.5H5.5A2 2 0 0 0 3.5 5.5V18.5A2 2 0 0 0 5.5 20.5H10.5" , key: "a" }), h("line", { x1: 9, y1: 12, x2: 20, y2: 12 , key: "b" }), h("polyline", { points: "16.78 14.7 20 12 16.78 9.3" , key: "c" })]); },
    shieldCheck: function (p) { return svg(p, [h("path", { d: "M12 3.4 19.6 6.3 V12.4 C19.6 16.6 16.2 19.4 12 20.6 C7.8 19.4 4.4 16.6 4.4 12.4 V6.3 Z" , key: "a" }), h("polyline", { points: "8 12.2 10.5 14.3 16 9.68" , key: "b" })]); },
    eyeOff: function (p) { return svg(p, [h("path", { d: "M9.1 6.5C10 6.2 11 6 12 6C15.6 6 19 8 21.5 12C20.5 13.6 19.4 14.9 18.1 15.9" , key: "a" }), h("path", { d: "M14.8 17.6C13.9 17.9 13 18 12 18C8.4 18 5 16 2.5 12C3.7 10.1 5.1 8.6 6.6 7.5" , key: "b" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09 , key: "c" })]); },
    zoomIn: function (p) { return svg(p, [h("path", { d: "M12.84 16.02 A6 6 0 1 1 16.35 11.85" , key: "a" }), h("line", { x1: 15.1, y1: 14.36, x2: 20.5, y2: 18.89 , key: "b" }), h("line", { x1: 7.5, y1: 10.5, x2: 13.5, y2: 10.5 , key: "c" }), h("line", { x1: 10.5, y1: 7.5, x2: 10.5, y2: 13.5 , key: "d" })]); },
    zoomOut: function (p) { return svg(p, [h("path", { d: "M12.84 16.02 A6 6 0 1 1 16.35 11.85" , key: "a" }), h("line", { x1: 15.1, y1: 14.36, x2: 20.5, y2: 18.89 , key: "b" }), h("line", { x1: 7.5, y1: 10.5, x2: 13.5, y2: 10.5 , key: "c" })]); },
    userPlus: function (p) { return svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6" , key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5" , key: "b" }), h("line", { x1: 18.5, y1: 3.7, x2: 18.5, y2: 9.3 , key: "c" }), h("line", { x1: 15.7, y1: 6.5, x2: 21.3, y2: 6.5 , key: "d" })]); },
    userCheck: function (p) { return svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6" , key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5" , key: "b" }), h("polyline", { points: "15.6 6.4 17.6 8.08 21 5.22" , key: "c" })]); },
    userX: function (p) { return svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6" , key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5" , key: "b" }), h("line", { x1: 16.3, y1: 4.3, x2: 20.7, y2: 8.7 , key: "c" }), h("line", { x1: 20.7, y1: 4.3, x2: 16.3, y2: 8.7 , key: "d" })]); },
    userSearch: function (p) { return svg(p, [h("path", { d: "M11.16 8 A3.2 3.2 0 1 1 9.04 5.47" , key: "a" }), h("path", { d: "M2.5 20.5C2.5 17.8 4.9 15.9 8 15.9C11.1 15.9 13.5 17.8 13.5 20.5" , key: "b" }), h("path", { d: "M13.4 9.5A3.4 3.4 0 1 1 20.2 9.5A3.4 3.4 0 1 1 13.4 9.5" , key: "c" }), h("line", { x1: 19.2, y1: 11.9, x2: 20.8, y2: 13.24 , key: "d" })]); },
    userOff: function (p) { return svg(p, [h("path", { d: "M8 8A4 4 0 1 1 16 8A4 4 0 1 1 8 8" , key: "a" }), h("path", { d: "M4.5 20.5C4.5 16.9 7.9 14.5 12 14.5C16.1 14.5 19.5 16.9 19.5 20.5" , key: "b" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09 , key: "c" })]); },
    usersPlus: function (p) { return svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6" , key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5" , key: "b" }), h("path", { d: "M16.2 5.2A3.6 3.6 0 0 1 16.2 11.9" , key: "c" }), h("line", { x1: 18.5, y1: 15.5, x2: 18.5, y2: 20.5 , key: "d" }), h("line", { x1: 16, y1: 18, x2: 21, y2: 18 , key: "e" })]); },
    hierarchy: function (p) { return svg(p, [h("path", { d: "M9 3H13A2 2 0 0 1 15 5V5.5A2 2 0 0 1 13 7.5H11A2 2 0 0 1 9 5.5Z" , key: "a" }), h("line", { x1: 12, y1: 7.5, x2: 12, y2: 10.5 , key: "b" }), h("line", { x1: 6, y1: 10.5, x2: 18, y2: 10.5 , key: "c" }), h("line", { x1: 6, y1: 10.5, x2: 6, y2: 13.5 , key: "d" }), h("line", { x1: 18, y1: 10.5, x2: 18, y2: 13.5 , key: "e" }), h("path", { d: "M3 13.5H7A2 2 0 0 1 9 15.5V16A2 2 0 0 1 7 18H5A2 2 0 0 1 3 16Z" , key: "f" }), h("path", { d: "M15 13.5H19A2 2 0 0 1 21 15.5V16A2 2 0 0 1 19 18H17A2 2 0 0 1 15 16Z" , key: "g" })]); },
    idCard: function (p) { return svg(p, [h("path", { d: "M3 5H19A2 2 0 0 1 21 7V17A2 2 0 0 1 19 19H5A2 2 0 0 1 3 17Z" , key: "a" }), h("path", { d: "M10.37 10.12 A2.4 2.4 0 1 1 8.78 8.23" , key: "b" }), h("path", { d: "M4.8 15.8C4.8 14 6.2 12.9 8 12.9C9.8 12.9 11.2 14 11.2 15.8" , key: "c" }), h("line", { x1: 13.5, y1: 10, x2: 18.5, y2: 10 , key: "d" }), h("line", { x1: 13.5, y1: 13.5, x2: 18.5, y2: 13.5 , key: "e" })]); },
    permission: function (p) { return svg(p, [h("path", { d: "M8 10.5V8A4 4 0 0 1 16 8V10.5" , key: "a" }), h("path", { d: "M4.5 10.5H17.5A2 2 0 0 1 19.5 12.5V18.5A2 2 0 0 1 17.5 20.5H6.5A2 2 0 0 1 4.5 18.5Z" , key: "b" }), h("polyline", { points: "8.5 15.5 10.7 17.35 15.5 13.32" , key: "c" })]); },
    resume: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L18.5 7.5V19.5A1.5 1.5 0 0 1 17 21H7A1.5 1.5 0 0 1 5.5 19.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.5 18.5 7.5" , key: "b" }), h("path", { d: "M9.5 11.4A2.2 2.2 0 1 1 13.9 11.4A2.2 2.2 0 1 1 9.5 11.4" , key: "c" }), h("path", { d: "M8.4 17.4C8.4 15.3 9.9 14.2 11.7 14.2C13.5 14.2 15 15.3 15 17.4" , key: "d" })]); },
    interview: function (p) { return svg(p, [h("path", { d: "M10.36 7.35 A2.9 2.9 0 1 1 8.44 5.06" , key: "a" }), h("path", { d: "M4.2 16C4.2 13.7 5.7 12.4 7.5 12.4C9.3 12.4 10.8 13.7 10.8 16" , key: "b" }), h("path", { d: "M19.36 7.35 A2.9 2.9 0 1 1 17.44 5.06" , key: "c" }), h("path", { d: "M13.2 16C13.2 13.7 14.7 12.4 16.5 12.4C18.3 12.4 19.8 13.7 19.8 16" , key: "d" }), h("line", { x1: 3, y1: 19, x2: 21, y2: 19 , key: "e" })]); },
    invite: function (p) { return svg(p, [h("path", { d: "M3 4.5H15A2 2 0 0 1 17 6.5V14.5A2 2 0 0 1 15 16.5H5A2 2 0 0 1 3 14.5Z" , key: "a" }), h("polyline", { points: "3 6.8 10 11.3 17 6.8" , key: "b" }), h("line", { x1: 19, y1: 17, x2: 19, y2: 21 , key: "c" }), h("line", { x1: 17, y1: 19, x2: 21, y2: 19 , key: "d" })]); },
    roster: function (p) { return svg(p, [h("path", { d: "M3.6 6A1.9 1.9 0 1 1 7.4 6A1.9 1.9 0 1 1 3.6 6" , key: "a" }), h("line", { x1: 9.5, y1: 6, x2: 20.5, y2: 6 , key: "b" }), h("path", { d: "M3.6 12A1.9 1.9 0 1 1 7.4 12A1.9 1.9 0 1 1 3.6 12" , key: "c" }), h("line", { x1: 9.5, y1: 12, x2: 20.5, y2: 12 , key: "d" }), h("path", { d: "M3.6 18A1.9 1.9 0 1 1 7.4 18A1.9 1.9 0 1 1 3.6 18" , key: "e" }), h("line", { x1: 9.5, y1: 18, x2: 20.5, y2: 18 , key: "f" })]); },
    timer: function (p) { return svg(p, [h("path", { d: "M4.5 13.5A7.5 7.5 0 1 1 19.5 13.5A7.5 7.5 0 1 1 4.5 13.5" , key: "a" }), h("line", { x1: 12, y1: 3.5, x2: 12, y2: 6 , key: "b" }), h("line", { x1: 9.5, y1: 3.5, x2: 14.5, y2: 3.5 , key: "c" }), h("line", { x1: 12, y1: 13.5, x2: 12, y2: 8.8 , key: "d" })]); },
    clockAlert: function (p) { return svg(p, [h("path", { d: "M3.7 12A6.8 6.8 0 1 1 17.3 12A6.8 6.8 0 1 1 3.7 12" , key: "a" }), h("polyline", { points: "10.5 7.6 10.5 12.3 13.9 14" , key: "b" }), h("line", { x1: 19.5, y1: 13, x2: 19.5, y2: 17 , key: "c" }), h("rect", { x: 18.5, y: 18.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "d" })]); },
    hourglass: function (p) { return svg(p, h("path", { d: "M6.5 3.5H17.5V7.385L12 12 17.5 16.615V20.5H6.5V16.615L12 12 6.5 7.385Z" , key: "a" })); },
    calendarPlus: function (p) { return svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z" , key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10 , key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7 , key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7 , key: "d" }), h("line", { x1: 12, y1: 12.5, x2: 12, y2: 18 , key: "e" }), h("line", { x1: 8.75, y1: 15.25, x2: 15.25, y2: 15.25 , key: "f" })]); },
    calendarCheck: function (p) { return svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z" , key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10 , key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7 , key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7 , key: "d" }), h("polyline", { points: "8.3 15.1 10.9 17.28 15.9 13.08" , key: "e" })]); },
    calendarX: function (p) { return svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z" , key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10 , key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7 , key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7 , key: "d" }), h("line", { x1: 9.2, y1: 12.7, x2: 14.8, y2: 18.3 , key: "e" }), h("line", { x1: 14.8, y1: 12.7, x2: 9.2, y2: 18.3 , key: "f" })]); },
    calendarRange: function (p) { return svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z" , key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10 , key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7 , key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7 , key: "d" }), h("rect", { x: 7, y: 14, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "e" }), h("rect", { x: 15, y: 14, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "f" }), h("line", { x1: 9, y1: 15, x2: 15, y2: 15 , key: "g" })]); },
    calendarGrid: function (p) { return svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z" , key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10 , key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7 , key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7 , key: "d" }), h("rect", { x: 6.5, y: 12.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "e" }), h("rect", { x: 11, y: 12.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "f" }), h("rect", { x: 15.5, y: 12.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "g" }), h("rect", { x: 6.5, y: 16.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "h" }), h("rect", { x: 11, y: 16.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "i" })]); },
    calendarClock: function (p) { return svg(p, [h("path", { d: "M17.5 11.5V7A2 2 0 0 0 15.5 5H3.5V16.5A2 2 0 0 0 5.5 18.5H11" , key: "a" }), h("line", { x1: 3.5, y1: 9.5, x2: 17.5, y2: 9.5 , key: "b" }), h("line", { x1: 7, y1: 3, x2: 7, y2: 6.5 , key: "c" }), h("line", { x1: 14, y1: 3, x2: 14, y2: 6.5 , key: "d" }), h("path", { d: "M12.8 16.5A4 4 0 1 1 20.8 16.5A4 4 0 1 1 12.8 16.5" , key: "e" }), h("polyline", { points: "16.8 14.2 16.8 16.5 18.6 17.4" , key: "f" })]); },
    repeat: function (p) { return svg(p, [h("path", { d: "M4.5 11V9.5A2.5 2.5 0 0 1 7 7H17" , key: "a" }), h("polyline", { points: "13.78 9.7 17 7 13.78 4.3" , key: "b" }), h("path", { d: "M19.5 13V14.5A2.5 2.5 0 0 1 17 17H7" , key: "c" }), h("polyline", { points: "10.22 14.3 7 17 10.22 19.7" , key: "d" })]); },
    alarm: function (p) { return svg(p, [h("path", { d: "M5 13.5A7 7 0 1 1 19 13.5A7 7 0 1 1 5 13.5" , key: "a" }), h("path", { d: "M3.5 7.4A4 4 0 0 1 7.4 4.3" , key: "b" }), h("path", { d: "M20.5 7.4A4 4 0 0 0 16.6 4.3" , key: "c" }), h("polyline", { points: "12 9.3 12 13.5 15.2 15.2" , key: "d" })]); },
    desk: function (p) { return svg(p, [h("line", { x1: 3, y1: 11, x2: 21, y2: 11 , key: "a" }), h("line", { x1: 5.5, y1: 11, x2: 5.5, y2: 20.5 , key: "b" }), h("line", { x1: 18.5, y1: 11, x2: 18.5, y2: 20.5 , key: "c" }), h("path", { d: "M9 4H13A2 2 0 0 1 15 6V7A2 2 0 0 1 13 9H11A2 2 0 0 1 9 7Z" , key: "d" }), h("line", { x1: 12, y1: 9, x2: 12, y2: 11 , key: "e" })]); },
    browser: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("line", { x1: 3, y1: 9, x2: 21, y2: 9 , key: "b" }), h("rect", { x: 5.5, y: 6.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" , key: "c" }), h("rect", { x: 8.3, y: 6.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" , key: "d" })]); },
    kanban: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("line", { x1: 9, y1: 4.5, x2: 9, y2: 19.5 , key: "b" }), h("line", { x1: 15, y1: 4.5, x2: 15, y2: 19.5 , key: "c" }), h("rect", { x: 4.5, y: 7.5, width: 3, height: 1.8, fill: "currentColor", stroke: "none" , key: "d" }), h("rect", { x: 4.5, y: 11, width: 3, height: 1.8, fill: "currentColor", stroke: "none" , key: "e" }), h("rect", { x: 10.5, y: 7.5, width: 3, height: 1.8, fill: "currentColor", stroke: "none" , key: "f" }), h("rect", { x: 16.5, y: 7.5, width: 3, height: 1.8, fill: "currentColor", stroke: "none" , key: "g" })]); },
    pipeline: function (p) { return svg(p, [h("line", { x1: 3, y1: 4.5, x2: 3, y2: 19.5 , key: "a" }), h("rect", { x: 5.5, y: 5, width: 15, height: 3, fill: "currentColor", stroke: "none" , key: "b" }), h("rect", { x: 5.5, y: 10.5, width: 11, height: 3, fill: "currentColor", stroke: "none" , key: "c" }), h("rect", { x: 5.5, y: 16, width: 7, height: 3, fill: "currentColor", stroke: "none" , key: "d" })]); },
    target: function (p) { return svg(p, [h("path", { d: "M3.5 12A8.5 8.5 0 1 1 20.5 12A8.5 8.5 0 1 1 3.5 12" , key: "a" }), h("path", { d: "M7.5 12A4.5 4.5 0 1 1 16.5 12A4.5 4.5 0 1 1 7.5 12" , key: "b" }), h("circle", { cx: 12, cy: 12, r: 1.8, fill: "currentColor", stroke: "none" , key: "c" })]); },
    presentation: function (p) { return svg(p, [h("path", { d: "M3 3.5H19A2 2 0 0 1 21 5.5V13A2 2 0 0 1 19 15H5A2 2 0 0 1 3 13Z" , key: "a" }), h("line", { x1: 12, y1: 15, x2: 12, y2: 18 , key: "b" }), h("line", { x1: 8.5, y1: 20.5, x2: 15.5, y2: 20.5 , key: "c" }), h("line", { x1: 8, y1: 12, x2: 8, y2: 9 , key: "d" }), h("line", { x1: 12, y1: 12, x2: 12, y2: 7 , key: "e" }), h("line", { x1: 16, y1: 12, x2: 16, y2: 10 , key: "f" })]); },
    mobile: function (p) { return svg(p, [h("path", { d: "M7 3H15A2 2 0 0 1 17 5V19A2 2 0 0 1 15 21H9A2 2 0 0 1 7 19Z" , key: "a" }), h("line", { x1: 10.5, y1: 17.5, x2: 13.5, y2: 17.5 , key: "b" })]); },
    note: function (p) { return svg(p, [h("path", { d: "M4 3.5H20V15.5L14.5 21H5.5A1.5 1.5 0 0 1 4 19.5Z" , key: "a" }), h("polyline", { points: "20 15.5 14.5 15.5 14.5 21" , key: "b" }), h("line", { x1: 7, y1: 8, x2: 17, y2: 8 , key: "c" }), h("line", { x1: 7, y1: 11.5, x2: 17, y2: 11.5 , key: "d" })]); },
    book: function (p) { return svg(p, [h("path", { d: "M4.5 3.5H17.5A2 2 0 0 1 19.5 5.5V18.5A2 2 0 0 1 17.5 20.5H6.5A2 2 0 0 1 4.5 18.5Z" , key: "a" }), h("line", { x1: 8, y1: 3.5, x2: 8, y2: 20.5 , key: "b" }), h("line", { x1: 10.8, y1: 8, x2: 16.8, y2: 8 , key: "c" }), h("line", { x1: 10.8, y1: 11.5, x2: 15, y2: 11.5 , key: "d" })]); },
    bookOpen: function (p) { return svg(p, [h("path", { d: "M12 7.2C10.6 5.9 8.4 5 6 5H3.5V17.5H6C8.4 17.5 10.6 18.4 12 19.7" , key: "a" }), h("path", { d: "M12 7.2C13.4 5.9 15.6 5 18 5H20.5V17.5H18C15.6 17.5 13.4 18.4 12 19.7" , key: "b" })]); },
    lightbulb: function (p) { return svg(p, [h("path", { d: "M8.6 15.4A5.6 5.6 0 1 1 15.4 15.4V17.5H8.6Z" , key: "a" }), h("line", { x1: 9.5, y1: 19.5, x2: 14.5, y2: 19.5 , key: "b" }), h("line", { x1: 10.5, y1: 21, x2: 13.5, y2: 21 , key: "c" })]); },
    map: function (p) { return svg(p, [h("polyline", { points: "3.5 6.5 9 4 15 7 20.5 4.5 20.5 17.5 15 20 9 17 3.5 19.5 3.5 6.5" , key: "a" }), h("line", { x1: 9, y1: 4, x2: 9, y2: 17 , key: "b" }), h("line", { x1: 15, y1: 7, x2: 15, y2: 20 , key: "c" })]); },
    barcode: function (p) { return svg(p, [h("rect", { x: 3.5, y: 5, width: 1.5, height: 14, fill: "currentColor", stroke: "none" , key: "a" }), h("line", { x1: 7, y1: 5, x2: 7, y2: 19 , key: "b" }), h("rect", { x: 9, y: 5, width: 2.5, height: 14, fill: "currentColor", stroke: "none" , key: "c" }), h("line", { x1: 13, y1: 5, x2: 13, y2: 19 , key: "d" }), h("line", { x1: 15, y1: 5, x2: 15, y2: 19 , key: "e" }), h("rect", { x: 17, y: 5, width: 1.5, height: 14, fill: "currentColor", stroke: "none" , key: "f" }), h("line", { x1: 20, y1: 5, x2: 20, y2: 19 , key: "g" })]); },
    print: function (p) { return svg(p, [h("path", { d: "M7 8V3.5H17V8" , key: "a" }), h("path", { d: "M3.5 8H18.5A2 2 0 0 1 20.5 10V14A2 2 0 0 1 18.5 16H5.5A2 2 0 0 1 3.5 14Z" , key: "b" }), h("path", { d: "M7 14H17V20.5H7Z" , key: "c" }), h("rect", { x: 16.5, y: 10.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "d" })]); },
    qr: function (p) { return svg(p, [h("rect", { x: 3.5, y: 3.5, width: 6, height: 6 , key: "a" }), h("rect", { x: 5.5, y: 5.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "b" }), h("rect", { x: 14.5, y: 3.5, width: 6, height: 6 , key: "c" }), h("rect", { x: 16.5, y: 5.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "d" }), h("rect", { x: 3.5, y: 14.5, width: 6, height: 6 , key: "e" }), h("rect", { x: 5.5, y: 16.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "f" }), h("rect", { x: 14.5, y: 14.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "g" }), h("rect", { x: 18.5, y: 18.5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "h" })]); },
    move: function (p) { return svg(p, [h("line", { x1: 12, y1: 4, x2: 12, y2: 20 , key: "a" }), h("line", { x1: 4, y1: 12, x2: 20, y2: 12 , key: "b" }), h("polyline", { points: "14.06 6.45 12 4 9.94 6.45" , key: "c" }), h("polyline", { points: "9.94 17.55 12 20 14.06 17.55" , key: "d" }), h("polyline", { points: "6.45 9.94 4 12 6.45 14.06" , key: "e" }), h("polyline", { points: "17.55 14.06 20 12 17.55 9.94" , key: "f" })]); },
    keyboard: function (p) { return svg(p, [h("path", { d: "M3 6.5H19A2 2 0 0 1 21 8.5V15.5A2 2 0 0 1 19 17.5H5A2 2 0 0 1 3 15.5Z" , key: "a" }), h("rect", { x: 6, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" , key: "b" }), h("rect", { x: 9.5, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" , key: "c" }), h("rect", { x: 13, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" , key: "d" }), h("rect", { x: 16.5, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none" , key: "e" }), h("line", { x1: 8, y1: 14.5, x2: 16, y2: 14.5 , key: "f" })]); },
    split: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 12, x2: 13, y2: 12 , key: "a" }), h("path", { d: "M13 12A2 2 0 0 0 15 10V7H20.5" , key: "b" }), h("path", { d: "M13 12A2 2 0 0 1 15 14V17H20.5" , key: "c" })]); },
    merge: function (p) { return svg(p, [h("line", { x1: 11, y1: 12, x2: 20.5, y2: 12 , key: "a" }), h("path", { d: "M11 12A2 2 0 0 1 9 10V7H3.5" , key: "b" }), h("path", { d: "M11 12A2 2 0 0 0 9 14V17H3.5" , key: "c" })]); },
    dragHandle: function (p) { return svg(p, [h("rect", { x: 8.5, y: 5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "a" }), h("rect", { x: 13.5, y: 5, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "b" }), h("rect", { x: 8.5, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "c" }), h("rect", { x: 13.5, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "d" }), h("rect", { x: 8.5, y: 17, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "e" }), h("rect", { x: 13.5, y: 17, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "f" })]); },
    megaphone: function (p) { return svg(p, [h("path", { d: "M4 9.5 17 4.5V19.5L4 14.5Z" , key: "a" }), h("path", { d: "M7.5 16V19.5A1.5 1.5 0 0 0 10.5 19.5V17.3" , key: "b" }), h("line", { x1: 19, y1: 10, x2: 21, y2: 10 , key: "c" }), h("line", { x1: 19, y1: 14, x2: 21, y2: 14 , key: "d" })]); },
    checkAll: function (p) { return svg(p, [h("polyline", { points: "3 12.3 7 15.66 14 9.79" , key: "a" }), h("polyline", { points: "10 12.3 14 15.66 21 9.79" , key: "b" })]); },
    sliders: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 7, x2: 20.5, y2: 7 , key: "a" }), h("rect", { x: 8, y: 5.5, width: 3, height: 3, fill: "currentColor", stroke: "none" , key: "b" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12 , key: "c" }), h("rect", { x: 13, y: 10.5, width: 3, height: 3, fill: "currentColor", stroke: "none" , key: "d" }), h("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17 , key: "e" }), h("rect", { x: 6, y: 15.5, width: 3, height: 3, fill: "currentColor", stroke: "none" , key: "f" })]); },
    accessibility: function (p) { return svg(p, [h("circle", { cx: 12, cy: 5.5, r: 2, fill: "currentColor", stroke: "none" , key: "a" }), h("line", { x1: 4.5, y1: 9.5, x2: 19.5, y2: 9.5 , key: "b" }), h("line", { x1: 12, y1: 9.5, x2: 12, y2: 14 , key: "c" }), h("polyline", { points: "6.55 20.5 12 14 17.45 20.5" , key: "d" })]); },
    message: function (p) { return svg(p, h("path", { d: "M4 6.5A1.5 1.5 0 0 1 5.5 5H18.5A1.5 1.5 0 0 1 20 6.5V15.5A1.5 1.5 0 0 1 18.5 17H9.4L5 20.5V17H5.5A1.5 1.5 0 0 1 4 15.5Z" , key: "a" })); },
    messages: function (p) { return svg(p, [h("path", { d: "M3 5.5A1.5 1.5 0 0 1 4.5 4H15.5A1.5 1.5 0 0 1 17 5.5V12.5A1.5 1.5 0 0 1 15.5 14H8L4.5 17V14A1.5 1.5 0 0 1 3 12.5Z" , key: "a" }), h("path", { d: "M20 8.5A1.5 1.5 0 0 1 21 10V17A1.5 1.5 0 0 1 19.5 18.5V21L16 18.5H10.5" , key: "b" })]); },
    comment: function (p) { return svg(p, [h("path", { d: "M4 6.5A1.5 1.5 0 0 1 5.5 5H18.5A1.5 1.5 0 0 1 20 6.5V15.5A1.5 1.5 0 0 1 18.5 17H9.4L5 20.5V17H5.5A1.5 1.5 0 0 1 4 15.5Z" , key: "a" }), h("line", { x1: 8, y1: 9.5, x2: 16, y2: 9.5 , key: "b" }), h("line", { x1: 8, y1: 12.8, x2: 13, y2: 12.8 , key: "c" })]); },
    bell: function (p) { return svg(p, [h("path", { d: "M7 10.5A5 5 0 0 1 17 10.5V15L19 18H5L7 15Z" , key: "a" }), h("path", { d: "M10 18V19A2 2 0 0 0 14 19V18" , key: "b" })]); },
    bellOff: function (p) { return svg(p, [h("path", { d: "M7 10.5A5 5 0 0 1 12.8 5.6" , key: "a" }), h("path", { d: "M17 11.6V15L19 18H8" , key: "b" }), h("path", { d: "M5 18L7 15V12" , key: "c" }), h("path", { d: "M10 18V19A2 2 0 0 0 14 19V18" , key: "d" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09 , key: "e" })]); },
    phone: function (p) { return svg(p, h("path", { d: "M6.5 3.5H10L11.5 8 9.3 9.6A11 11 0 0 0 14.4 14.7L16 12.5 20.5 14V17.5A2.5 2.5 0 0 1 18 20C10.3 19.6 4.4 13.7 4 6A2.5 2.5 0 0 1 6.5 3.5Z" , key: "a" })); },
    videoCall: function (p) { return svg(p, [h("path", { d: "M3 6H13A2 2 0 0 1 15 8V16A2 2 0 0 1 13 18H5A2 2 0 0 1 3 16Z" , key: "a" }), h("polyline", { points: "15 11 20.5 7.4 20.5 16.6 15 13" , key: "b" })]); },
    at: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 4 , key: "a" }), h("path", { d: "M16 8.4V13.5A2.8 2.8 0 0 0 21 12A9 9 0 1 0 17.2 19.3" , key: "b" })]); },
    hash: function (p) { return svg(p, [h("line", { x1: 4, y1: 9.2, x2: 20, y2: 9.2 , key: "a" }), h("line", { x1: 4, y1: 15.4, x2: 20, y2: 15.4 , key: "b" }), h("line", { x1: 10.4, y1: 3.6, x2: 8.2, y2: 20.4 , key: "c" }), h("line", { x1: 16.6, y1: 3.6, x2: 14.4, y2: 20.4 , key: "d" })]); },
    share: function (p) { return svg(p, [h("circle", { cx: 6, cy: 12, r: 2.6 , key: "a" }), h("circle", { cx: 18, cy: 6.5, r: 2.6 , key: "b" }), h("circle", { cx: 18, cy: 17.5, r: 2.6 , key: "c" }), h("line", { x1: 8.4, y1: 10.9, x2: 15.6, y2: 7.6 , key: "d" }), h("line", { x1: 8.4, y1: 13.1, x2: 15.6, y2: 16.4 , key: "e" })]); },
    reply: function (p) { return svg(p, [h("polyline", { points: "8 5.5 3.5 10 8 14.5" , key: "a" }), h("path", { d: "M3.5 10H15A5.5 5.5 0 0 1 15 21H10" , key: "b" })]); },
    inbox: function (p) { return svg(p, [h("path", { d: "M3.5 13H8.5L10 16H14L15.5 13H20.5" , key: "a" }), h("path", { d: "M3.5 13 6.5 4.5H17.5L20.5 13V18.5A1.5 1.5 0 0 1 19 20H5A1.5 1.5 0 0 1 3.5 18.5Z" , key: "b" })]); },
    draft: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V13" , key: "a" }), h("path", { d: "M5.5 3V21H12" , key: "b" }), h("line", { x1: 8.5, y1: 11, x2: 15, y2: 11 , key: "c" }), h("path", { d: "M19.4 13.9 14.6 18.7V20.5H16.4L21.2 15.7Z" , key: "d" })]); },
    image: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("polyline", { points: "4.5 17 9.6 11.2 13.5 15.6 15.9 13.1 19.5 17" , key: "b" }), h("rect", { x: 6.4, y: 7.6, width: 2, height: 2 , key: "c" })]); },
    images: function (p) { return svg(p, [h("path", { d: "M7 8.5A1.5 1.5 0 0 1 8.5 7H19.5A1.5 1.5 0 0 1 21 8.5V17.5A1.5 1.5 0 0 1 19.5 19H8.5A1.5 1.5 0 0 1 7 17.5Z" , key: "a" }), h("polyline", { points: "8 17.5 11.7 13.4 14.5 16.5 16.3 14.6 19.6 17.9" , key: "b" }), h("path", { d: "M4 16.5V6.5A1.5 1.5 0 0 1 5.5 5H16" , key: "c" })]); },
    camera: function (p) { return svg(p, [h("path", { d: "M3.5 9A1.5 1.5 0 0 1 5 7.5H8L9.5 5H14.5L16 7.5H19A1.5 1.5 0 0 1 20.5 9V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" , key: "a" }), h("circle", { cx: 12, cy: 13, r: 3.6 , key: "b" })]); },
    video: function (p) { return svg(p, [h("path", { d: "M3 6H14A2 2 0 0 1 16 8V16A2 2 0 0 1 14 18H5A2 2 0 0 1 3 16Z" , key: "a" }), h("polyline", { points: "16 11 20.5 8 20.5 16 16 13" , key: "b" })]); },
    mic: function (p) { return svg(p, [h("path", { d: "M12 3.5A2.6 2.6 0 0 1 14.6 6.1V12A2.6 2.6 0 0 1 9.4 12V6.1A2.6 2.6 0 0 1 12 3.5Z" , key: "a" }), h("path", { d: "M6.5 11.5V12.5A5.5 5.5 0 0 0 17.5 12.5V11.5" , key: "b" }), h("line", { x1: 12, y1: 18, x2: 12, y2: 20.5 , key: "c" }), h("line", { x1: 8.5, y1: 20.5, x2: 15.5, y2: 20.5 , key: "d" })]); },
    micOff: function (p) { return svg(p, [h("path", { d: "M14.6 8.5V6.1A2.6 2.6 0 0 0 9.6 5.2" , key: "a" }), h("path", { d: "M9.4 10.2V12A2.6 2.6 0 0 0 13.9 13.8" , key: "b" }), h("path", { d: "M6.5 11.5V12.5A5.5 5.5 0 0 0 15.3 16.9" , key: "c" }), h("path", { d: "M17.5 11.5V12.5" , key: "d" }), h("line", { x1: 12, y1: 18, x2: 12, y2: 20.5 , key: "e" }), h("line", { x1: 8.5, y1: 20.5, x2: 15.5, y2: 20.5 , key: "f" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09 , key: "g" })]); },
    volume: function (p) { return svg(p, [h("polyline", { points: "3.5 9.5 7 9.5 11.5 5.5 11.5 18.5 7 14.5 3.5 14.5" , key: "a" }), h("path", { d: "M15 9.5A4 4 0 0 1 15 14.5" , key: "b" }), h("path", { d: "M17.8 6.7A8 8 0 0 1 17.8 17.3" , key: "c" })]); },
    volumeOff: function (p) { return svg(p, [h("polyline", { points: "3.5 9.5 7 9.5 11.5 5.5 11.5 18.5 7 14.5 3.5 14.5" , key: "a" }), h("line", { x1: 15.5, y1: 9.6, x2: 20.5, y2: 13.8 , key: "b" }), h("line", { x1: 20.5, y1: 9.6, x2: 15.5, y2: 13.8 , key: "c" })]); },
    pause: function (p) { return svg(p, [h("line", { x1: 9, y1: 5, x2: 9, y2: 19 , key: "a" }), h("line", { x1: 15, y1: 5, x2: 15, y2: 19 , key: "b" })]); },
    skipBack: function (p) { return svg(p, [h("polyline", { points: "17 5.5 7 12 17 18.5" , key: "a" }), h("line", { x1: 5.5, y1: 5.5, x2: 5.5, y2: 18.5 , key: "b" })]); },
    skipForward: function (p) { return svg(p, [h("polyline", { points: "7 5.5 17 12 7 18.5" , key: "a" }), h("line", { x1: 18.5, y1: 5.5, x2: 18.5, y2: 18.5 , key: "b" })]); },
    record: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("circle", { cx: 12, cy: 12, r: 4, fill: "currentColor", stroke: "none", key: "b" })]); },
    help: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("path", { d: "M9.4 9.6A2.7 2.7 0 0 1 14.7 10.3C14.7 12.2 12 12.6 12 14.4" , key: "b" }), h("rect", { x: 11, y: 16.6, width: 2, height: 2 , key: "c" })]); },
    question: function (p) { return svg(p, [h("path", { d: "M9.4 8.4A2.9 2.9 0 0 1 15 9.2C15 11.3 12 11.8 12 13.8" , key: "a" }), h("rect", { x: 11, y: 16.6, width: 2, height: 2 , key: "b" })]); },
    alert: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("line", { x1: 12, y1: 7.6, x2: 12, y2: 13 , key: "b" }), h("rect", { x: 11, y: 15.4, width: 2, height: 2 , key: "c" })]); },
    bug: function (p) { return svg(p, [h("path", { d: "M7.5 7.5H12.5A4 4 0 0 1 16.5 11.5V14.5A4 4 0 0 1 12.5 18.5H11.5A4 4 0 0 1 7.5 14.5Z" , key: "a" }), h("line", { x1: 9.5, y1: 4.5, x2: 10.8, y2: 7.5 , key: "b" }), h("line", { x1: 14.5, y1: 4.5, x2: 13.2, y2: 7.5 , key: "c" }), h("line", { x1: 3.5, y1: 11, x2: 7.5, y2: 11 , key: "d" }), h("line", { x1: 16.5, y1: 11, x2: 20.5, y2: 11 , key: "e" }), h("line", { x1: 3.5, y1: 15.5, x2: 7.5, y2: 15.5 , key: "f" }), h("line", { x1: 16.5, y1: 15.5, x2: 20.5, y2: 15.5 , key: "g" }), h("line", { x1: 12, y1: 10, x2: 12, y2: 16 , key: "h" })]); },
    verified: function (p) { return svg(p, [h("path", { d: "M12 3.6 14.4 5.8 17.6 5.4 18 8.6 20.3 10.8 18.7 13.6 19.4 16.7 16.3 17.6 14.6 20.3 11.7 19 8.8 19.9 7.4 17.1 4.3 16.1 5.3 13 3.8 10.3 6.2 8.2 6.7 5.1 9.9 5.4Z" , key: "a" }), h("polyline", { points: "8.6 12.1 10.9 14.03 15.4 10.25" , key: "b" })]); },
    pending: function (p) { return svg(p, [h("path", { d: "M3.5 12A8.5 8.5 0 1 1 20.5 12A8.5 8.5 0 1 1 3.5 12" , key: "a" }), h("rect", { x: 6.6, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "b" }), h("rect", { x: 11, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "c" }), h("rect", { x: 15.4, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none" , key: "d" })]); },
    blocked: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("line", { x1: 6, y1: 18, x2: 18, y2: 6 , key: "b" })]); },
    circleCheck: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("polyline", { points: "8.3 12.1 10.6 14.03 15.5 9.92" , key: "b" })]); },
    circleX: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("line", { x1: 9, y1: 9, x2: 15, y2: 15 , key: "b" }), h("line", { x1: 15, y1: 9, x2: 9, y2: 15 , key: "c" })]); },
    circlePlus: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("line", { x1: 12, y1: 8, x2: 12, y2: 16 , key: "b" }), h("line", { x1: 8, y1: 12, x2: 16, y2: 12 , key: "c" })]); },
    circleMinus: function (p) { return svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5 , key: "a" }), h("line", { x1: 8, y1: 12, x2: 16, y2: 12 , key: "b" })]); },
    dot: function (p) { return svg(p, h("rect", { x: 9, y: 9, width: 6, height: 6, fill: "currentColor", stroke: "none", key: "a" })); },
    card: function (p) { return svg(p, [h("path", { d: "M3 5.5H19A2 2 0 0 1 21 7.5V16.5A2 2 0 0 1 19 18.5H5A2 2 0 0 1 3 16.5Z" , key: "a" }), h("line", { x1: 3, y1: 10, x2: 21, y2: 10 , key: "b" }), h("line", { x1: 6.5, y1: 14.5, x2: 10.5, y2: 14.5 , key: "c" })]); },
    wallet: function (p) { return svg(p, [h("path", { d: "M3.5 7.5A2 2 0 0 1 5.5 5.5H17V8" , key: "a" }), h("path", { d: "M3.5 7.5V17.5A2 2 0 0 0 5.5 19.5H19A1.5 1.5 0 0 0 20.5 18V9.5A1.5 1.5 0 0 0 19 8H3.5" , key: "b" }), h("rect", { x: 15.5, y: 12, width: 2.4, height: 2.4 , key: "c" })]); },
    receipt: function (p) { return svg(p, [h("path", { d: "M6 3.5H18V21L15.6 19.2 13.2 21 10.8 19.2 8.4 21 6 19.2Z" , key: "a" }), h("line", { x1: 9, y1: 8.5, x2: 15, y2: 8.5 , key: "b" }), h("line", { x1: 9, y1: 12.5, x2: 15, y2: 12.5 , key: "c" })]); },
    tag: function (p) { return svg(p, [h("path", { d: "M11.4 3.5H20.5V12.6L12.2 20.9A1.5 1.5 0 0 1 10.1 20.9L3.1 13.9A1.5 1.5 0 0 1 3.1 11.8Z" , key: "a" }), h("rect", { x: 16, y: 6.6, width: 2, height: 2 , key: "b" })]); },
    cart: function (p) { return svg(p, [h("polyline", { points: "3 4.5 6 4.5 8.3 15.5 18.5 15.5 20.5 8 7 8" , key: "a" }), h("rect", { x: 8, y: 18, width: 2, height: 2 , key: "b" }), h("rect", { x: 16.5, y: 18, width: 2, height: 2 , key: "c" })]); },
    percent: function (p) { return svg(p, [h("circle", { cx: 7.5, cy: 7.5, r: 2.8 , key: "a" }), h("circle", { cx: 16.5, cy: 16.5, r: 2.8 , key: "b" }), h("line", { x1: 18, y1: 6, x2: 6, y2: 18 , key: "c" })]); },
    coins: function (p) { return svg(p, [h("path", { d: "M3.5 8.5A4.5 2.5 0 0 1 12.5 8.5A4.5 2.5 0 0 1 3.5 8.5" , key: "a" }), h("path", { d: "M3.5 8.5V13A4.5 2.5 0 0 0 12.5 13V8.5" , key: "b" }), h("path", { d: "M11.5 15.5A4.5 2.5 0 0 0 20.5 15.5V11A4.5 2.5 0 0 0 13 9.1" , key: "c" })]); },
    bank: function (p) { return svg(p, [h("polyline", { points: "3 9.5 12 4 21 9.5" , key: "a" }), h("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5 , key: "b" }), h("line", { x1: 6.5, y1: 12, x2: 6.5, y2: 18 , key: "c" }), h("line", { x1: 12, y1: 12, x2: 12, y2: 18 , key: "d" }), h("line", { x1: 17.5, y1: 12, x2: 17.5, y2: 18 , key: "e" })]); },
    invoice: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("line", { x1: 8.5, y1: 12, x2: 15.5, y2: 12 , key: "c" }), h("line", { x1: 8.5, y1: 15, x2: 13, y2: 15 , key: "d" }), h("line", { x1: 12, y1: 17.5, x2: 15.5, y2: 17.5 , key: "e" })]); },
    arrowUp: function (p) { return svg(p, [h("line", { x1: 12, y1: 19, x2: 12, y2: 5 , key: "a" }), h("polyline", { points: "14.7 8.22 12 5 9.3 8.22" , key: "b" })]); },
    arrowUpLeft: function (p) { return svg(p, [h("line", { x1: 17.36, y1: 16.5, x2: 6.64, y2: 7.5 , key: "a" }), h("polyline", { points: "10.84 7.5 6.64 7.5 7.37 11.64" , key: "b" })]); },
    arrowDownLeft: function (p) { return svg(p, [h("line", { x1: 17.36, y1: 7.5, x2: 6.64, y2: 16.5 , key: "a" }), h("polyline", { points: "7.37 12.36 6.64 16.5 10.84 16.5" , key: "b" })]); },
    arrowDownRight: function (p) { return svg(p, [h("line", { x1: 6.64, y1: 7.5, x2: 17.36, y2: 16.5 , key: "a" }), h("polyline", { points: "13.16 16.5 17.36 16.5 16.63 12.36" , key: "b" })]); },
    chevronsRight: function (p) { return svg(p, [h("polyline", { points: "8.41 14.96 11.93 12 8.41 9.04" , key: "a" }), h("polyline", { points: "14.01 14.96 17.53 12 14.01 9.04" , key: "b" })]); },
    chevronsLeft: function (p) { return svg(p, [h("polyline", { points: "15.59 9.04 12.07 12 15.59 14.96" , key: "a" }), h("polyline", { points: "9.99 9.04 6.47 12 9.99 14.96" , key: "b" })]); },
    chevronsUp: function (p) { return svg(p, [h("polyline", { points: "14.96 15.59 12 12.07 9.04 15.59" , key: "a" }), h("polyline", { points: "14.96 9.99 12 6.47 9.04 9.99" , key: "b" })]); },
    chevronsDown: function (p) { return svg(p, [h("polyline", { points: "9.04 8.41 12 11.93 14.96 8.41" , key: "a" }), h("polyline", { points: "9.04 14.01 12 17.53 14.96 14.01" , key: "b" })]); },
    home: function (p) { return svg(p, [h("path", { d: "M3.5 11.4 12 4.3 20.5 11.4" , key: "a" }), h("path", { d: "M6 9.4V20.3H18V9.4" , key: "b" }), h("line", { x1: 10.3, y1: 20.3, x2: 10.3, y2: 14.8 , key: "c" }), h("line", { x1: 13.7, y1: 20.3, x2: 13.7, y2: 14.8 , key: "d" })]); },
    back: function (p) { return svg(p, [h("line", { x1: 20, y1: 12, x2: 5, y2: 12 , key: "a" }), h("polyline", { points: "8.22 9.3 5 12 8.22 14.7" , key: "b" })]); },
    forward: function (p) { return svg(p, [h("line", { x1: 4, y1: 12, x2: 19, y2: 12 , key: "a" }), h("polyline", { points: "15.78 14.7 19 12 15.78 9.3" , key: "b" })]); },
    expand: function (p) { return svg(p, [h("polyline", { points: "9.5 4 4 4 4 9.5" , key: "a" }), h("polyline", { points: "14.5 20 20 20 20 14.5" , key: "b" }), h("line", { x1: 4, y1: 4, x2: 10, y2: 9.03 , key: "c" }), h("line", { x1: 20, y1: 20, x2: 14, y2: 14.97 , key: "d" })]); },
    collapse: function (p) { return svg(p, [h("polyline", { points: "4 9.5 9.5 9.5 9.5 4" , key: "a" }), h("polyline", { points: "20 14.5 14.5 14.5 14.5 20" , key: "b" }), h("line", { x1: 9.5, y1: 9.5, x2: 4, y2: 4.39 , key: "c" }), h("line", { x1: 14.5, y1: 14.5, x2: 20, y2: 19.61 , key: "d" })]); },
    maximize: function (p) { return svg(p, h("path", { d: "M4 4H18A2 2 0 0 1 20 6V18A2 2 0 0 1 18 20H6A2 2 0 0 1 4 18Z" , key: "a" })); },
    minimize: function (p) { return svg(p, [h("path", { d: "M3.5 4.5H18.5A2 2 0 0 1 20.5 6.5V11.5A2 2 0 0 1 18.5 13.5H5.5A2 2 0 0 1 3.5 11.5Z" , key: "a" }), h("rect", { x: 3.5, y: 17.5, width: 17, height: 3, fill: "currentColor", stroke: "none" , key: "b" })]); },
    fullscreen: function (p) { return svg(p, [h("polyline", { points: "9 4 4 4 4 9" , key: "a" }), h("polyline", { points: "15 4 20 4 20 9" , key: "b" }), h("polyline", { points: "9 20 4 20 4 15" , key: "c" }), h("polyline", { points: "15 20 20 20 20 15" , key: "d" })]); },
    sidebar: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("line", { x1: 9.5, y1: 4.5, x2: 9.5, y2: 19.5 , key: "b" })]); },
    panelRight: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("line", { x1: 14.5, y1: 4.5, x2: 14.5, y2: 19.5 , key: "b" })]); },
    layout: function (p) { return svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z" , key: "a" }), h("line", { x1: 3, y1: 10, x2: 21, y2: 10 , key: "b" }), h("line", { x1: 11, y1: 10, x2: 11, y2: 19.5 , key: "c" })]); },
    fileText: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("line", { x1: 8.5, y1: 12, x2: 15.5, y2: 12 , key: "c" }), h("line", { x1: 8.5, y1: 15.5, x2: 13.5, y2: 15.5 , key: "d" }), h("line", { x1: 8.5, y1: 18.5, x2: 12, y2: 18.5 , key: "e" })]); },
    fileCode: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("polyline", { points: "11 13.4 8.7 15.7 11 18" , key: "c" }), h("polyline", { points: "14 13.4 16.3 15.7 14 18" , key: "d" })]); },
    fileSheet: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("line", { x1: 8.5, y1: 12.5, x2: 16, y2: 12.5 , key: "c" }), h("line", { x1: 8.5, y1: 16, x2: 16, y2: 16 , key: "d" }), h("line", { x1: 12, y1: 12.5, x2: 12, y2: 19.5 , key: "e" }), h("line", { x1: 8.5, y1: 19.5, x2: 16, y2: 19.5 , key: "f" })]); },
    fileImage: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("polyline", { points: "8 18.5 11.2 14.8 13.8 17.8 15.3 16.1 17 18.5" , key: "c" }), h("rect", { x: 8.3, y: 11.3, width: 1.6, height: 1.6 , key: "d" })]); },
    fileZip: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("line", { x1: 11.2, y1: 10, x2: 12.8, y2: 10 , key: "c" }), h("line", { x1: 11.2, y1: 13, x2: 12.8, y2: 13 , key: "d" }), h("line", { x1: 11.2, y1: 16, x2: 12.8, y2: 16 , key: "e" }), h("rect", { x: 11.2, y: 18.4, width: 1.6, height: 1.6 , key: "f" })]); },
    filePdf: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z" , key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2" , key: "b" }), h("line", { x1: 8.5, y1: 13.5, x2: 15.5, y2: 13.5 , key: "c" }), h("line", { x1: 8.5, y1: 16.5, x2: 12.5, y2: 16.5 , key: "d" })]); },
    folder: function (p) { return svg(p, h("path", { d: "M3 7.5H9.5L11.6 10.3H21V19.5A1.5 1.5 0 0 1 19.5 21H4.5A1.5 1.5 0 0 1 3 19.5Z" , key: "a" })); },
    folderOpen: function (p) { return svg(p, [h("path", { d: "M3 7.5H9.5L11.6 10.3H19V12.5" , key: "a" }), h("path", { d: "M3 7.5V19.5A1.5 1.5 0 0 0 4.5 21H18.6L21.5 12.5H5.9Z" , key: "b" })]); },
    folderPlus: function (p) { return svg(p, [h("path", { d: "M3 7.5H9.5L11.6 10.3H21V19.5A1.5 1.5 0 0 1 19.5 21H4.5A1.5 1.5 0 0 1 3 19.5Z" , key: "a" }), h("line", { x1: 12, y1: 13.2, x2: 12, y2: 18 , key: "b" }), h("line", { x1: 9.6, y1: 15.6, x2: 14.4, y2: 15.6 , key: "c" })]); },
    archive: function (p) { return svg(p, [h("rect", { x: 3, y: 4, width: 18, height: 4.5 , key: "a" }), h("path", { d: "M5 8.5V19.5A1.5 1.5 0 0 0 6.5 21H17.5A1.5 1.5 0 0 0 19 19.5V8.5" , key: "b" }), h("line", { x1: 10, y1: 12.5, x2: 14, y2: 12.5 , key: "c" })]); },
    clipboard: function (p) { return svg(p, [h("path", { d: "M8.5 5H6.5A1.5 1.5 0 0 0 5 6.5V19.5A1.5 1.5 0 0 0 6.5 21H17.5A1.5 1.5 0 0 0 19 19.5V6.5A1.5 1.5 0 0 0 17.5 5H15.5" , key: "a" }), h("rect", { x: 8.5, y: 3, width: 7, height: 4 , key: "b" })]); },
    clipboardCheck: function (p) { return svg(p, [h("path", { d: "M8.5 5H6.5A1.5 1.5 0 0 0 5 6.5V19.5A1.5 1.5 0 0 0 6.5 21H17.5A1.5 1.5 0 0 0 19 19.5V6.5A1.5 1.5 0 0 0 17.5 5H15.5" , key: "a" }), h("rect", { x: 8.5, y: 3, width: 7, height: 4 , key: "b" }), h("polyline", { points: "8.7 13.6 11 15.53 15.5 11.75" , key: "c" })]); },
    attachment: function (p) { return svg(p, h("path", { d: "M17.5 10.8 10.4 17.4A3.6 3.6 0 0 1 5.4 12.2L13.1 5A2.5 2.5 0 0 1 16.6 8.6L9.4 15.3A1.4 1.4 0 0 1 7.5 13.3L13.8 7.5" , key: "a" })); },
    save: function (p) { return svg(p, [h("path", { d: "M4.5 4.5H16L19.5 8V19.5H4.5Z" , key: "a" }), h("rect", { x: 8, y: 4.5, width: 8, height: 4.5 , key: "b" }), h("rect", { x: 8, y: 13, width: 8, height: 6.5 , key: "c" })]); },
    duplicate: function (p) { return svg(p, [h("rect", { x: 8.5, y: 8.5, width: 12, height: 12 , key: "a" }), h("path", { d: "M15.5 5.5H4.5A1 1 0 0 0 3.5 6.5V15.5" , key: "b" })]); },
    trash: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 6.5, x2: 20.5, y2: 6.5 , key: "a" }), h("path", { d: "M6.5 6.5V20A1 1 0 0 0 7.5 21H16.5A1 1 0 0 0 17.5 20V6.5" , key: "b" }), h("path", { d: "M9 6.5V4.5A1 1 0 0 1 10 3.5H14A1 1 0 0 1 15 4.5V6.5" , key: "c" }), h("line", { x1: 10.3, y1: 10.5, x2: 10.3, y2: 17.5 , key: "d" }), h("line", { x1: 13.7, y1: 10.5, x2: 13.7, y2: 17.5 , key: "e" })]); },
    restore: function (p) { return svg(p, [h("path", { d: "M4.5 12A7.5 7.5 0 1 0 7 6.3" , key: "a" }), h("polyline", { points: "3.5 3 3.5 7.3 7.8 7.3" , key: "b" })]); },
    bold: function (p) { return svg(p, [h("path", { d: "M7 4H13.5A4 4 0 0 1 13.5 12H7Z" , key: "a" }), h("path", { d: "M7 12H14.5A4 4 0 0 1 14.5 20H7Z" , key: "b" })]); },
    italic: function (p) { return svg(p, [h("line", { x1: 10, y1: 4.5, x2: 18, y2: 4.5 , key: "a" }), h("line", { x1: 6, y1: 19.5, x2: 14, y2: 19.5 , key: "b" }), h("line", { x1: 14.3, y1: 4.5, x2: 9.7, y2: 19.5 , key: "c" })]); },
    underline: function (p) { return svg(p, [h("path", { d: "M7 4V12.5A5 5 0 0 0 17 12.5V4" , key: "a" }), h("line", { x1: 5.5, y1: 20.5, x2: 18.5, y2: 20.5 , key: "b" })]); },
    strikethrough: function (p) { return svg(p, [h("path", { d: "M16 7.2A4 4 0 0 0 8.2 8.1C8.2 10.5 10.6 11.2 13 11.8", key: "a" }), h("path", { d: "M8 16.8A4 4 0 0 0 15.8 15.9C15.8 14.2 14.7 13.2 13 12.6", key: "b" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "c" })]); },
    list: function (p) { return svg(p, [h("line", { x1: 9, y1: 6.5, x2: 20.5, y2: 6.5 , key: "a" }), h("line", { x1: 9, y1: 12, x2: 20.5, y2: 12 , key: "b" }), h("line", { x1: 9, y1: 17.5, x2: 20.5, y2: 17.5 , key: "c" }), h("rect", { x: 3.5, y: 5.5, width: 2, height: 2 , key: "d" }), h("rect", { x: 3.5, y: 11, width: 2, height: 2 , key: "e" }), h("rect", { x: 3.5, y: 16.5, width: 2, height: 2 , key: "f" })]); },
    listOrdered: function (p) { return svg(p, [h("line", { x1: 9.5, y1: 6.5, x2: 20.5, y2: 6.5 , key: "a" }), h("line", { x1: 9.5, y1: 12, x2: 20.5, y2: 12 , key: "b" }), h("line", { x1: 9.5, y1: 17.5, x2: 20.5, y2: 17.5 , key: "c" }), h("polyline", { points: "3.5 5 5 4.4 5 8" , key: "d" }), h("path", { d: "M3.5 10.5H6V13H3.5V15.5H6" , key: "e" })]); },
    indent: function (p) { return svg(p, [h("line", { x1: 10, y1: 6.5, x2: 20.5, y2: 6.5 , key: "a" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12 , key: "b" }), h("line", { x1: 10, y1: 17.5, x2: 20.5, y2: 17.5 , key: "c" }), h("polyline", { points: "3.5 9 6.4 12 3.5 15" , key: "d" })]); },
    outdent: function (p) { return svg(p, [h("line", { x1: 10, y1: 6.5, x2: 20.5, y2: 6.5 , key: "a" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12 , key: "b" }), h("line", { x1: 10, y1: 17.5, x2: 20.5, y2: 17.5 , key: "c" }), h("polyline", { points: "6.4 9 3.5 12 6.4 15" , key: "d" })]); },
    alignLeft: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6 , key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 14, y2: 12 , key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 17, y2: 18 , key: "c" })]); },
    alignCenter: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6 , key: "a" }), h("line", { x1: 7, y1: 12, x2: 17, y2: 12 , key: "b" }), h("line", { x1: 5, y1: 18, x2: 19, y2: 18 , key: "c" })]); },
    alignRight: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6 , key: "a" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12 , key: "b" }), h("line", { x1: 7, y1: 18, x2: 20.5, y2: 18 , key: "c" })]); },
    alignJustify: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6 , key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12 , key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 20.5, y2: 18 , key: "c" })]); },
    undo: function (p) { return svg(p, [h("path", { d: "M4 10.5H15A5 5 0 0 1 15 20.5H8" , key: "a" }), h("polyline", { points: "7.6 6.4 3.5 10.5 7.6 14.6" , key: "b" })]); },
    redo: function (p) { return svg(p, [h("path", { d: "M20 10.5H9A5 5 0 0 0 9 20.5H16" , key: "a" }), h("polyline", { points: "16.4 6.4 20.5 10.5 16.4 14.6" , key: "b" })]); },
    crop: function (p) { return svg(p, [h("line", { x1: 6.5, y1: 3, x2: 6.5, y2: 17.5 , key: "a" }), h("line", { x1: 3, y1: 6.5, x2: 17.5, y2: 6.5 , key: "b" }), h("polyline", { points: "6.5 17.5 17.5 17.5 17.5 6.5" , key: "c" }), h("line", { x1: 17.5, y1: 17.5, x2: 17.5, y2: 21 , key: "d" }), h("line", { x1: 21, y1: 17.5, x2: 17.5, y2: 17.5 , key: "e" })]); },
    door: function (p) { return svg(p, [h("path", { d: "M4.5 20.5 V6 L14 3.5 V20.5", key: "a" }), h("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5, key: "b" }), h("line", { x1: 16.5, y1: 13.5, x2: 21, y2: 9.72, key: "c" }), h("line", { x1: 16.5, y1: 17, x2: 21, y2: 13.22, key: "d" })]); },
    threshold: function (p) { return svg(p, [h("line", { x1: 9.5, y1: 3, x2: 9.5, y2: 21, key: "a" }), h("line", { x1: 12, y1: 10, x2: 17, y2: 5.8, key: "b" }), h("line", { x1: 12, y1: 14, x2: 18, y2: 8.97, key: "c" }), h("line", { x1: 12, y1: 18, x2: 17, y2: 13.8, key: "d" })]); },
    passport: function (p) { return svg(p, [h("path", { d: "M4.5 3 H17.5 A2 2 0 0 1 19.5 5 V19 A2 2 0 0 1 17.5 21 H6.5 A2 2 0 0 1 4.5 19 Z", key: "a" }), h("path", { d: "M9 9.5 A3 3 0 1 1 15 9.5 A3 3 0 1 1 9 9.5", key: "b" }), h("line", { x1: 8.5, y1: 15.5, x2: 15.5, y2: 15.5, key: "c" }), h("line", { x1: 8.5, y1: 18.2, x2: 13.2, y2: 18.2, key: "d" })]); },
    check: function (p) { return svg(p, h("polyline", { points: "4.5 11.75 9.5 15.95 19.5 7.56", key: "a" })); },
    minus: function (p) { return svg(p, h("line", { x1: 5, y1: 12, x2: 19, y2: 12, key: "a" })); },
    plus: function (p) { return svg(p, [h("line", { x1: 12, y1: 5, x2: 12, y2: 19, key: "a" }), h("line", { x1: 5, y1: 12, x2: 19, y2: 12, key: "b" })]); },
    close: function (p) { return svg(p, [h("line", { x1: 5.5, y1: 5.5, x2: 18.5, y2: 18.5, key: "a" }), h("line", { x1: 18.5, y1: 5.5, x2: 5.5, y2: 18.5, key: "b" })]); },
    chevronDown: function (p) { return svg(p, h("polyline", { points: "7 9.9 12 14.1 17 9.9", key: "a" })); },
    chevronUp: function (p) { return svg(p, h("polyline", { points: "7 14.1 12 9.9 17 14.1", key: "a" })); },
    chevronLeft: function (p) { return svg(p, h("polyline", { points: "14.1 7 9.9 12 14.1 17", key: "a" })); },
    chevronRight: function (p) { return svg(p, h("polyline", { points: "9.9 7 14.1 12 9.9 17", key: "a" })); },
    arrowRight: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 12, x2: 19.5, y2: 12, key: "a" }), h("polyline", { points: "15.1 8.31 19.5 12 15.1 15.69", key: "b" })]); },
    arrowLeft: function (p) { return svg(p, [h("line", { x1: 20.5, y1: 12, x2: 4.5, y2: 12, key: "a" }), h("polyline", { points: "8.9 8.31 4.5 12 8.9 15.69", key: "b" })]); },
    arrowUpRight: function (p) { return svg(p, [h("line", { x1: 5.2, y1: 17.6, x2: 18.2, y2: 6.69, key: "a" }), h("polyline", { points: "12.46 6.69 18.2 6.69 17.2 12.34", key: "b" })]); },
    arrowDown: function (p) { return svg(p, [h("line", { x1: 12, y1: 3.5, x2: 12, y2: 19.5, key: "a" }), h("polyline", { points: "8.31 15.1 12 19.5 15.69 15.1", key: "b" })]); },
    external: function (p) { return svg(p, [h("polyline", { points: "13.5 4.5 19.5 4.5 19.5 10.5", key: "a" }), h("line", { x1: 19.5, y1: 4.5, x2: 11, y2: 11.63, key: "b" }), h("path", { d: "M16 14.5V19.5H4.5V8H9.5", key: "c" })]); },
    search: function (p) { return svg(p, [h("path", { d: "M12.84 16.02 A6 6 0 1 1 16.35 11.85", key: "a" }), h("line", { x1: 15.1, y1: 14.36, x2: 20.5, y2: 18.89, key: "b" })]); },
    info: function (p) { return svg(p, [h("path", { d: "M20.89 10.59 A9 9 0 1 1 14.93 3.49", key: "a" }), h("rect", { x: 11, y: 7, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("line", { x1: 12, y1: 11, x2: 12, y2: 16.5, key: "c" })]); },
    success: function (p) { return svg(p, [h("path", { d: "M20.89 10.59 A9 9 0 1 1 14.93 3.49", key: "a" }), h("polyline", { points: "8 12.65 10.8 15 16 10.64", key: "b" })]); },
    warning: function (p) { return svg(p, [h("path", { d: "M12 3.5 21.5 20.5 H2.5 Z", key: "a" }), h("line", { x1: 12, y1: 10, x2: 12, y2: 14, key: "b" }), h("rect", { x: 11, y: 16, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" })]); },
    danger: function (p) { return svg(p, [h("path", { d: "M20.89 10.59 A9 9 0 1 1 14.93 3.49", key: "a" }), h("line", { x1: 12, y1: 7, x2: 12, y2: 13, key: "b" }), h("rect", { x: 11, y: 15.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" })]); },
    stop: function (p) { return svg(p, h("rect", { x: 6, y: 6, width: 12, height: 12, fill: "currentColor", stroke: "none" , key: "a" })); },
    sparkle: function (p) { return svg(p, [h("path", { d: "M12 3 L13.9 9.3 L20 12 L13.9 14.7 L12 21 L10.1 14.7 L4 12 L10.1 9.3 Z", key: "a" }), h("line", { x1: 18.5, y1: 4, x2: 20.5, y2: 4, key: "b" }), h("line", { x1: 19.5, y1: 3, x2: 19.5, y2: 5, key: "c" })]); },
    tool: function (p) { return svg(p, [h("path", { d: "M3.5 5.5 H18.5 A2 2 0 0 1 20.5 7.5 V16.5 A2 2 0 0 1 18.5 18.5 H5.5 A2 2 0 0 1 3.5 16.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 9.5, x2: 20.5, y2: 9.5, key: "b" }), h("rect", { x: 5.3, y: 6.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 8.1, y: 6.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" })]); },
    shield: function (p) { return svg(p, h("path", { d: "M12 3 20 6 V12.5 C20 17 16.4 19.9 12 21.2 C7.6 19.9 4 17 4 12.5 V6 Z", key: "a" })); },
    globe: function (p) { return svg(p, [h("path", { d: "M3 12 A9 9 0 1 1 21 12 A9 9 0 1 1 3 12", key: "a" }), h("line", { x1: 3, y1: 12, x2: 21, y2: 12, key: "b" }), h("path", { d: "M12 3C15.1 5.4 16.6 8.5 16.6 12C16.6 15.5 15.1 18.6 12 21C8.9 18.6 7.4 15.5 7.4 12C7.4 8.5 8.9 5.4 12 3Z", key: "c" })]); },
    key: function (p) { return svg(p, [h("path", { d: "M9.38 11.91 A4.4 4.4 0 1 1 12.12 8.64", key: "a" }), h("line", { x1: 11.17, y1: 10.63, x2: 20.4, y2: 18.37, key: "b" }), h("line", { x1: 17.81, y1: 16.2, x2: 16.14, y2: 18.19, key: "c" }), h("line", { x1: 20.4, y1: 18.37, x2: 19.11, y2: 19.9, key: "d" })]); },
    lock: function (p) { return svg(p, [h("path", { d: "M4.5 10.5 H17.5 A2 2 0 0 1 19.5 12.5 V18.5 A2 2 0 0 1 17.5 20.5 H6.5 A2 2 0 0 1 4.5 18.5 Z", key: "a" }), h("path", { d: "M8 10.5V7.8A4 4 0 0 1 16 7.8V10.5", key: "b" }), h("line", { x1: 12, y1: 14, x2: 12, y2: 17, key: "c" })]); },
    unlock: function (p) { return svg(p, [h("path", { d: "M4.5 10.5 H17.5 A2 2 0 0 1 19.5 12.5 V18.5 A2 2 0 0 1 17.5 20.5 H6.5 A2 2 0 0 1 4.5 18.5 Z", key: "a" }), h("path", { d: "M8 10.5V7.8A4 4 0 0 1 16 7.8", key: "b" }), h("line", { x1: 12, y1: 14, x2: 12, y2: 17, key: "c" })]); },
    user: function (p) { return svg(p, [h("path", { d: "M16.15 7.34 A4.2 4.2 0 1 1 13.37 4.03", key: "a" }), h("path", { d: "M4.5 20.5C4.5 16.9 7.9 14.5 12 14.5C16.1 14.5 19.5 16.9 19.5 20.5", key: "b" })]); },
    users: function (p) { return svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6", key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5", key: "b" }), h("path", { d: "M16.2 5.2A3.6 3.6 0 0 1 16.2 11.9", key: "c" }), h("path", { d: "M17.4 15.6C19.6 16.4 21 18.3 21 20.5", key: "d" })]); },
    ladder: function (p) { return svg(p, [h("line", { x1: 8, y1: 3, x2: 8, y2: 21, key: "a" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 21, key: "b" }), h("line", { x1: 8, y1: 7, x2: 16, y2: 7, key: "c" }), h("line", { x1: 8, y1: 12, x2: 16, y2: 12, key: "d" }), h("line", { x1: 8, y1: 17, x2: 16, y2: 17, key: "e" })]); },
    spark: function (p) { return svg(p, h("path", { d: "M13.5 3 7 13.2 12 13.2 10.5 21 17 10.8 12 10.8 Z", key: "a" })); },
    mail: function (p) { return svg(p, [h("path", { d: "M3 5 H19 A2 2 0 0 1 21 7 V17 A2 2 0 0 1 19 19 H5 A2 2 0 0 1 3 17 Z", key: "a" }), h("polyline", { points: "3 7.5 12 13.5 21 7.5", key: "b" })]); },
    file: function (p) { return svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 8.5, y1: 13, x2: 15.5, y2: 13, key: "c" }), h("line", { x1: 8.5, y1: 16.5, x2: 13.5, y2: 16.5, key: "d" })]); },
    grid: function (p) { return svg(p, [h("path", { d: "M3.5 3.5 H9.0 A1.5 1.5 0 0 1 10.5 5.0 V9.0 A1.5 1.5 0 0 1 9.0 10.5 H5.0 A1.5 1.5 0 0 1 3.5 9.0 Z", key: "a" }), h("path", { d: "M13.5 3.5 H19.0 A1.5 1.5 0 0 1 20.5 5.0 V9.0 A1.5 1.5 0 0 1 19.0 10.5 H15.0 A1.5 1.5 0 0 1 13.5 9.0 Z", key: "b" }), h("path", { d: "M3.5 13.5 H9.0 A1.5 1.5 0 0 1 10.5 15.0 V19.0 A1.5 1.5 0 0 1 9.0 20.5 H5.0 A1.5 1.5 0 0 1 3.5 19.0 Z", key: "c" }), h("path", { d: "M13.5 13.5 H19.0 A1.5 1.5 0 0 1 20.5 15.0 V19.0 A1.5 1.5 0 0 1 19.0 20.5 H15.0 A1.5 1.5 0 0 1 13.5 19.0 Z", key: "d" })]); },
    chart: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "a" }), h("line", { x1: 7, y1: 20.5, x2: 7, y2: 13, key: "b" }), h("line", { x1: 12, y1: 20.5, x2: 12, y2: 8.5, key: "c" }), h("line", { x1: 17, y1: 20.5, x2: 17, y2: 4, key: "d" })]); },
    trend: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 20.5, x2: 3.5, y2: 3.5, key: "a" }), h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "b" }), h("polyline", { points: "6.5 16.6 11 12.4 14 13.41 18.6 7.15", key: "c" }), h("polyline", { points: "13.79 8.31 18.6 7.15 18.87 12.14", key: "d" })]); },
    clock: function (p) { return svg(p, [h("path", { d: "M3 12 A9 9 0 1 1 21 12 A9 9 0 1 1 3 12", key: "a" }), h("polyline", { points: "12 6.2 12 12.4 16.6 14.6", key: "b" })]); },
    calendar: function (p) { return svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("rect", { x: 7.5, y: 13, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 11, y: 13, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" })]); },
    filter: function (p) { return svg(p, h("polyline", { points: "3.5 5.5 20.5 5.5 13.8 13.2 13.8 19.4 10.2 21 10.2 13.2 3.5 5.5", key: "a" })); },
    sort: function (p) { return svg(p, [h("line", { x1: 4, y1: 6.5, x2: 20, y2: 6.5, key: "a" }), h("line", { x1: 4, y1: 12, x2: 14.5, y2: 12, key: "b" }), h("line", { x1: 4, y1: 17.5, x2: 9, y2: 17.5, key: "c" })]); },
    link: function (p) { return svg(p, [h("path", { d: "M10.5 13.5A4.6 4.6 0 0 0 17 13.5L20 11A4.6 4.6 0 0 0 13.5 4L11.8 5.43", key: "a" }), h("path", { d: "M13.5 10.5A4.6 4.6 0 0 0 7 10.5L4 13A4.6 4.6 0 0 0 10.5 20L12.2 18.57", key: "b" })]); },
    upload: function (p) { return svg(p, [h("line", { x1: 12, y1: 20, x2: 12, y2: 5, key: "a" }), h("polyline", { points: "8.31 9.4 12 5 15.69 9.4", key: "b" }), h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "c" })]); },
    download: function (p) { return svg(p, [h("line", { x1: 12, y1: 4, x2: 12, y2: 17, key: "a" }), h("polyline", { points: "8.31 12.6 12 17 15.69 12.6", key: "b" }), h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "c" })]); },
    send: function (p) { return svg(p, [h("path", { d: "M3 12 21 5.51 14.5 21 11.6 13.4 Z", key: "a" }), h("line", { x1: 11.6, y1: 13.4, x2: 21, y2: 5.51, key: "b" })]); },
    refresh: function (p) { return svg(p, [h("path", { d: "M18.77 16.07 A7.9 7.9 0 1 1 18.77 7.93", key: "a" }), h("polyline", { points: "14.61 6.5 18.77 7.93 19.46 3.58", key: "b" })]); },
    more: function (p) { return svg(p, [h("rect", { x: 5, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "a" }), h("rect", { x: 11, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 17, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" })]); },
    menu: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 7, x2: 20.5, y2: 7, key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17, key: "c" })]); },
    settings: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 7.5, x2: 20.5, y2: 7.5, key: "a" }), h("line", { x1: 3.5, y1: 16.5, x2: 20.5, y2: 16.5, key: "b" }), h("path", { d: "M7 5.5 H10 A1 1 0 0 1 11 6.5 V8.5 A1 1 0 0 1 10 9.5 H8 A1 1 0 0 1 7 8.5 Z", key: "c" }), h("path", { d: "M13 14.5 H16 A1 1 0 0 1 17 15.5 V17.5 A1 1 0 0 1 16 18.5 H14 A1 1 0 0 1 13 17.5 Z", key: "d" })]); },
    eye: function (p) { return svg(p, [h("path", { d: "M2.5 12C5 8 8.4 6 12 6C15.6 6 19 8 21.5 12C19 16 15.6 18 12 18C8.4 18 5 16 2.5 12Z", key: "a" }), h("path", { d: "M9 12 A3 3 0 1 1 15 12 A3 3 0 1 1 9 12", key: "b" })]); },
    star: function (p) { return svg(p, h("path", { d: "M12 3.2 14.7 9.4 21.4 10.1 16.4 14.6 17.8 21.2 12 17.8 6.2 21.2 7.6 14.6 2.6 10.1 9.3 9.4 Z", key: "a" })); },
    bookmark: function (p) { return svg(p, h("path", { d: "M6 3H18V21L12 15.97 6 21Z", key: "a" })); },
    copy: function (p) { return svg(p, [h("path", { d: "M8 8 H18.5 A2 2 0 0 1 20.5 10 V18.5 A2 2 0 0 1 18.5 20.5 H10 A2 2 0 0 1 8 18.5 Z", key: "a" }), h("path", { d: "M16 8V4.5H3.5V17H7", key: "b" })]); },
    edit: function (p) { return svg(p, [h("path", { d: "M 4.596 18.554 8.6434 17.8578 19.4876 8.7482 16.8208 5.5858 5.9766 14.6954 Z", key: "a" }), h("line", { x1: 13.7882, y1: 8.1346, x2: 16.455, y2: 11.297, key: "b" })]); },
    play: function (p) { return svg(p, h("path", { d: "M 5.5 4.5 18.5 12 5.5 19.5 Z", key: "a" })); },

    /* The 2026 addition: the surfaces that carry evidence, the people and places
       a piece of work is about, and four more that are the brand's own -
       bridge, translate, beacon, seal. Same eight rules, no exceptions added. */
    bridge: function (p) { return svg(p, [h("line", { x1: 3, y1: 7, x2: 21, y2: 7, key: "a" }), h("path", { d: "M 6.3 18 A 5.7 5.7 0 0 1 17.7 18", key: "b" }), h("line", { x1: 6.3, y1: 7, x2: 6.3, y2: 18, key: "c" }), h("line", { x1: 17.7, y1: 7, x2: 17.7, y2: 18, key: "d" })]); },
    translate: function (p) { return svg(p, [h("polyline", { points: "3 17.5 6.9 7.5 10.8 17.5", key: "a" }), h("line", { x1: 4.7, y1: 13, x2: 9.1, y2: 13, key: "b" }), h("path", { d: "M 13.5 9 H 19.5 A 1.5 1.5 0 0 1 21 10.5 V 16.5 A 1.5 1.5 0 0 1 19.5 18 H 15 A 1.5 1.5 0 0 1 13.5 16.5 Z", key: "c" }), h("line", { x1: 15.55, y1: 12, x2: 19.35, y2: 12, key: "d" }), h("line", { x1: 15.55, y1: 15, x2: 19.35, y2: 15, key: "e" })]); },
    beacon: function (p) { return svg(p, [h("path", { d: "M8.5 6.5 H14.5 A1 1 0 0 1 15.5 7.5 V10.5 A1 1 0 0 1 14.5 11.5 H9.5 A1 1 0 0 1 8.5 10.5 Z", key: "a" }), h("polyline", { points: "9.2 20.5 10.4 11.5 13.6 11.5 14.8 20.5", key: "b" }), h("line", { x1: 6, y1: 20.5, x2: 18, y2: 20.5, key: "c" }), h("line", { x1: 17.2, y1: 8, x2: 21, y2: 4.81, key: "d" }), h("line", { x1: 6.8, y1: 8, x2: 3, y2: 4.81, key: "e" })]); },
    seal: function (p) { return svg(p, [h("path", { d: "M5 10.5 A7 7 0 1 1 19 10.5 A7 7 0 1 1 5 10.5", key: "a" }), h("polyline", { points: "8.8 10.8 11.1 12.73 15.2 9.29", key: "b" }), h("polyline", { points: "9.5 16.6 9.5 21.4 12 19.3 14.5 21.4 14.5 16.6", key: "c" })]); },
    clause: function (p) { return svg(p, [h("path", { d: "M3.5 5 H6.5 A1 1 0 0 1 7.5 6 V8.5 A1 1 0 0 1 6.5 9.5 H4.5 A1 1 0 0 1 3.5 8.5 Z", key: "a" }), h("line", { x1: 10.5, y1: 7.25, x2: 20.5, y2: 7.25, key: "b" }), h("line", { x1: 3.5, y1: 13.5, x2: 20.5, y2: 13.5, key: "c" }), h("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17, key: "d" }), h("line", { x1: 3.5, y1: 20.5, x2: 15, y2: 20.5, key: "e" })]); },
    highlight: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 5.5, x2: 20.5, y2: 5.5, key: "a" }), h("path", { d: "M3.5 9 H13 A1 1 0 0 1 14 10 V13 A1 1 0 0 1 13 14 H4.5 A1 1 0 0 1 3.5 13 Z", key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 20.5, y2: 18, key: "c" }), h("line", { x1: 3.5, y1: 21, x2: 14, y2: 21, key: "d" })]); },
    redact: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 5.5, x2: 20.5, y2: 5.5, key: "a" }), h("rect", { x: 3.5, y: 9, width: 10.5, height: 5, fill: "currentColor", stroke: "none", key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 20.5, y2: 18, key: "c" }), h("line", { x1: 3.5, y1: 21, x2: 14, y2: 21, key: "d" })]); },
    stack: function (p) { return svg(p, [h("path", { d: "M3.5 12.5 H14.5 A1.5 1.5 0 0 1 16 14 V19 A1.5 1.5 0 0 1 14.5 20.5 H5 A1.5 1.5 0 0 1 3.5 19 Z", key: "a" }), h("polyline", { points: "6.5 9.5 17.5 9.5 17.5 17.5", key: "b" }), h("polyline", { points: "9.5 6.5 20.5 6.5 20.5 14.5", key: "c" })]); },
    columns: function (p) { return svg(p, [h("path", { d: "M3.5 4.5 H18.5 A2 2 0 0 1 20.5 6.5 V17.5 A2 2 0 0 1 18.5 19.5 H5.5 A2 2 0 0 1 3.5 17.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 9, x2: 20.5, y2: 9, key: "b" }), h("line", { x1: 9.17, y1: 9, x2: 9.17, y2: 19.5, key: "c" }), h("line", { x1: 14.83, y1: 9, x2: 14.83, y2: 19.5, key: "d" })]); },
    checklist: function (p) { return svg(p, [h("polyline", { points: "3.5 6.8 5.3 8.31 8.9 5.29", key: "a" }), h("line", { x1: 11.5, y1: 6.5, x2: 20.5, y2: 6.5, key: "b" }), h("polyline", { points: "3.5 12.8 5.3 14.31 8.9 11.29", key: "c" }), h("line", { x1: 11.5, y1: 12.5, x2: 20.5, y2: 12.5, key: "d" }), h("polyline", { points: "3.5 18.8 5.3 20.31 8.9 17.29", key: "e" }), h("line", { x1: 11.5, y1: 18.5, x2: 16.5, y2: 18.5, key: "f" })]); },
    signature: function (p) { return svg(p, [h("path", { d: "M3 16.5 C6 3.5 9.4 3.2 10.2 11.5 C10.9 18.8 13 17.5 15.4 10 C16.8 5.6 19.4 8.4 20.5 13.5", key: "a" }), h("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5, key: "b" })]); },
    scan: function (p) { return svg(p, [h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "z" }), h("polyline", { points: "3.5 8 3.5 4.5 7 4.5", key: "a" }), h("polyline", { points: "17 4.5 20.5 4.5 20.5 8", key: "b" }), h("polyline", { points: "20.5 16 20.5 19.5 17 19.5", key: "c" }), h("polyline", { points: "7 19.5 3.5 19.5 3.5 16", key: "d" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "e" })]); },
    scales: function (p) { return svg(p, [h("line", { x1: 6, y1: 7, x2: 18, y2: 7, key: "a" }), h("line", { x1: 12, y1: 4.5, x2: 12, y2: 20, key: "b" }), h("line", { x1: 9, y1: 20, x2: 15, y2: 20, key: "c" }), h("path", { d: "M6 7 V9.8 M3 9.8 H9 L6 14.4 Z", key: "d" }), h("path", { d: "M18 7 V9.8 M15 9.8 H21 L18 14.4 Z", key: "e" })]); },
    flag: function (p) { return svg(p, [h("line", { x1: 5.5, y1: 3, x2: 5.5, y2: 21, key: "a" }), h("path", { d: "M5.5 4.5 H19 L15.5 7.44 19 10.38 H5.5 Z", key: "b" })]); },
    compare: function (p) { return svg(p, [h("path", { d: "M3 5 H8.5 A1.5 1.5 0 0 1 10 6.5 V17.5 A1.5 1.5 0 0 1 8.5 19 H4.5 A1.5 1.5 0 0 1 3 17.5 Z", key: "a" }), h("path", { d: "M14 5 H19.5 A1.5 1.5 0 0 1 21 6.5 V17.5 A1.5 1.5 0 0 1 19.5 19 H15.5 A1.5 1.5 0 0 1 14 17.5 Z", key: "b" }), h("line", { x1: 5, y1: 9.5, x2: 8, y2: 9.5, key: "c" }), h("line", { x1: 16, y1: 9.5, x2: 19, y2: 9.5, key: "d" }), h("line", { x1: 16, y1: 13.5, x2: 19, y2: 13.5, key: "e" })]); },
    route: function (p) { return svg(p, [h("rect", { x: 3, y: 19, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "a" }), h("polyline", { points: "5.5 20 9.5 20 9.5 13 15 13 15 6 20.5 6", key: "b" })]); },
    history: function (p) { return svg(p, [h("path", { d: "M5.23 16.07 A7.9 7.9 0 1 0 5.23 7.93", key: "a" }), h("polyline", { points: "9.39 6.5 5.23 7.93 4.54 3.58", key: "b" }), h("polyline", { points: "12 7 12 12.4 16.3 14.6", key: "c" })]); },
    branch: function (p) { return svg(p, [h("line", { x1: 6.5, y1: 6, x2: 6.5, y2: 18, key: "a" }), h("path", { d: "M6.5 9 H14 A3 3 0 0 1 17 12 V15", key: "b" }), h("rect", { x: 5, y: 3, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 5, y: 18, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 15.5, y: 15, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "e" })]); },
    briefcase: function (p) { return svg(p, [h("path", { d: "M3.5 8 H18.5 A2 2 0 0 1 20.5 10 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("path", { d: "M9 8 V5.5 A1.5 1.5 0 0 1 10.5 4 H13.5 A1.5 1.5 0 0 1 15 5.5 V8", key: "b" }), h("line", { x1: 3.5, y1: 13, x2: 20.5, y2: 13, key: "c" })]); },
    building: function (p) { return svg(p, [h("polyline", { points: "4 20.5 4 4 14 4 14 20.5", key: "a" }), h("polyline", { points: "14 9.5 20.5 9.5 20.5 20.5", key: "b" }), h("line", { x1: 2.5, y1: 20.5, x2: 21.5, y2: 20.5, key: "c" }), h("rect", { x: 6.5, y: 7.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 10, y: 7.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 6.5, y: 13, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" })]); },
    graduation: function (p) { return svg(p, [h("path", { d: "M2.5 9.5 12 5.5 21.5 9.5 12 13.5 Z", key: "a" }), h("path", { d: "M6.5 11.2 V16.6 C6.5 16.6 8.8 18.6 12 18.6 C15.2 18.6 17.5 16.6 17.5 16.6 V11.2", key: "b" }), h("line", { x1: 20.6, y1: 10.2, x2: 20.6, y2: 15.8, key: "c" })]); },
    network: function (p) { return svg(p, [h("path", { d: "M10 3.5 H13 A1 1 0 0 1 14 4.5 V7 A1 1 0 0 1 13 8 H11 A1 1 0 0 1 10 7 Z", key: "a" }), h("path", { d: "M3 15.5 H6 A1 1 0 0 1 7 16.5 V19 A1 1 0 0 1 6 20 H4 A1 1 0 0 1 3 19 Z", key: "b" }), h("path", { d: "M17 15.5 H20 A1 1 0 0 1 21 16.5 V19 A1 1 0 0 1 20 20 H18 A1 1 0 0 1 17 19 Z", key: "c" }), h("line", { x1: 10.6, y1: 8.6, x2: 5.2, y2: 15, key: "d" }), h("line", { x1: 13.4, y1: 8.6, x2: 18.8, y2: 15, key: "e" })]); },
    pin: function (p) { return svg(p, [h("path", { d: "M5.5 9.5 A6.5 6.5 0 1 1 18.5 9.5 C18.5 14.5 12 21 12 21 C12 21 5.5 14.5 5.5 9.5 Z", key: "a" }), h("path", { d: "M9.5 9.5 A2.5 2.5 0 1 1 14.5 9.5 A2.5 2.5 0 1 1 9.5 9.5", key: "b" })]); },
    anonymous: function (p) { return svg(p, [h("path", { d: "M16.15 7.34 A4.2 4.2 0 1 1 13.37 4.03", key: "a" }), h("path", { d: "M4.5 20.5C4.5 16.9 7.9 14.5 12 14.5C16.1 14.5 19.5 16.9 19.5 20.5", key: "b" }), h("rect", { x: 7.8, y: 6.9, width: 8.4, height: 2.4, fill: "currentColor", stroke: "none", key: "c" })]); },
  };

  var TONE_ICON = { info: Icons.info, success: Icons.success, warning: Icons.warning, danger: Icons.danger };

  /* ---- Button ------------------------------------------------------- */

  function Button(props) {
    props = props || {};
    var variant = props.variant || 'primary';
    var size = props.size || 'md';
    var rest = omit(props, ['variant', 'size', 'iconLeft', 'iconRight', 'fullWidth', 'loading', 'shape', 'emphasis', 'className', 'children']);
    var kids = [];
    if (props.loading) kids.push(h('span', { className: 'rr-spinner', key: 'spin' }));
    else if (props.iconLeft) kids.push(h('span', { className: 'rr-btn__icon', key: 'il' }, props.iconLeft));
    kids.push(h('span', { key: 'label' }, props.children));
    if (props.iconRight && !props.loading) kids.push(h('span', { className: 'rr-btn__icon', key: 'ir' }, props.iconRight));
    return h(
      'button',
      Object.assign(
        {
          type: props.type || 'button',
          className: cx('rr-btn', 'rr-btn--' + variant, 'rr-btn--' + size, props.shape === 'pill' && 'rr-btn--pill', props.emphasis && 'rr-btn--emphasis', props.fullWidth && 'rr-btn--block', props.className),
          disabled: props.disabled || props.loading,
          'aria-busy': props.loading ? 'true' : undefined
        },
        rest
      ),
      kids
    );
  }

  /* ---- IconButton --------------------------------------------------- */

  function IconButton(props) {
    props = props || {};
    var variant = props.variant || 'ghost';
    var size = props.size || 'md';
    var rest = omit(props, ['variant', 'size', 'round', 'label', 'className', 'children']);
    return h(
      'button',
      Object.assign(
        {
          type: props.type || 'button',
          'aria-label': props.label,
          title: props.label,
          className: cx('rr-iconbtn', 'rr-iconbtn--' + variant, 'rr-iconbtn--' + size, props.round && 'rr-iconbtn--round', props.className)
        },
        rest
      ),
      h('span', { className: 'rr-btn__icon', style: { fontSize: size === 'sm' ? '14px' : '18px' } }, props.children)
    );
  }

  /* ---- Field shell -------------------------------------------------- */

  function Field(props, control) {
    var kids = [];
    if (props.label) {
      kids.push(
        h('label', { className: 'rr-field__label', htmlFor: props.id, key: 'l' }, [
          props.label,
          props.required ? h('span', { className: 'rr-field__req', key: 'r', 'aria-hidden': 'true' }, '*') : null
        ])
      );
    }
    kids.push(h('div', { key: 'c' }, control));
    if (props.error) kids.push(h('p', { className: 'rr-field__error', id: props.id + '-msg', key: 'e' }, props.error));
    else if (props.hint) kids.push(h('p', { className: 'rr-field__hint', id: props.id + '-msg', key: 'h' }, props.hint));
    return h('div', { className: cx('rr-field', props.className), style: props.style }, kids);
  }

  /* ---- Input -------------------------------------------------------- */

  function Input(props) {
    props = props || {};
    var autoId = useStableId('rr-input');
    var id = props.id || autoId;
    var size = props.size || 'md';
    var rest = omit(props, ['label', 'hint', 'error', 'size', 'className', 'style', 'id', 'invalid']);
    var invalid = props.invalid || !!props.error;
    var control = h(
      'input',
      Object.assign(
        {
          id: id,
          className: cx('rr-control', 'rr-control--' + size),
          'aria-invalid': invalid ? 'true' : undefined,
          'aria-describedby': props.error || props.hint ? id + '-msg' : undefined
        },
        rest
      )
    );
    return Field(Object.assign({}, props, { id: id }), control);
  }

  /* ---- Textarea ----------------------------------------------------- */

  function Textarea(props) {
    props = props || {};
    var autoId = useStableId('rr-textarea');
    var id = props.id || autoId;
    var rest = omit(props, ['label', 'hint', 'error', 'className', 'style', 'id', 'invalid']);
    var invalid = props.invalid || !!props.error;
    var control = h(
      'textarea',
      Object.assign(
        {
          id: id,
          className: 'rr-control rr-textarea',
          'aria-invalid': invalid ? 'true' : undefined,
          'aria-describedby': props.error || props.hint ? id + '-msg' : undefined
        },
        rest
      )
    );
    return Field(Object.assign({}, props, { id: id }), control);
  }

  /* ---- Select ------------------------------------------------------- */

  function Select(props) {
    props = props || {};
    var autoId = useStableId('rr-select');
    var id = props.id || autoId;
    var size = props.size || 'md';
    var invalid = props.invalid || !!props.error;
    var options = (props.options || []).map(function (o) {
      return typeof o === 'string' ? { value: o, label: o } : o;
    });

    /* native: the platform's own list. Right for a long list on a phone, and for forms that must work without JavaScript. */
    if (props.native) {
      var rest = omit(props, ['label', 'hint', 'error', 'size', 'className', 'style', 'id', 'invalid', 'options', 'placeholder', 'native']);
      var opts = options.map(function (o, i) { return h('option', { value: o.value, key: 'o' + i, disabled: o.disabled }, o.label); });
      if (props.placeholder) {
        opts.unshift(h('option', { value: '', key: 'ph', disabled: true }, props.placeholder));
        if (props.value === undefined && props.defaultValue === undefined) rest.defaultValue = '';
      }
      return Field(Object.assign({}, props, { id: id }), h('span', { className: 'rr-select-wrap' }, [
        h('select', Object.assign({ id: id, key: 's', className: cx('rr-control', 'rr-control--' + size, 'rr-select'),
          'aria-invalid': invalid ? 'true' : undefined, 'aria-describedby': props.error || props.hint ? id + '-msg' : undefined }, rest), opts),
        h('span', { className: 'rr-select-wrap__caret', key: 'c' }, Icons.chevronDown({ width: '100%', height: '100%' }))
      ]));
    }

    /* The list: a button that opens a listbox, the select-only combobox pattern. Focus stays on the button;
       the active option is announced through aria-activedescendant. */
    var controlled = props.value !== undefined;
    var inner = React.useState(props.defaultValue !== undefined ? props.defaultValue : (props.placeholder ? '' : (options[0] && options[0].value)));
    var value = controlled ? props.value : inner[0];
    var os = React.useState(false), open = os[0], setOpen = os[1];
    var as = React.useState(-1), active = as[0], setActive = as[1];
    var us = React.useState(false), up = us[0], setUp = us[1];
    var wrap = React.useRef(null), list = React.useRef(null), btn = React.useRef(null), typed = React.useRef({ s: '', t: 0 });
    var listId = id + '-list';
    var current = options.filter(function (o) { return String(o.value) === String(value); })[0];
    var enabled = function (i) { return options[i] && !options[i].disabled; };
    function step(from, dir) {
      for (var i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i;
      return from;
    }
    function show() {
      if (props.disabled) return;
      var i = options.indexOf(current);
      setActive(i >= 0 ? i : step(-1, 1));
      var r = wrap.current && wrap.current.getBoundingClientRect();
      setUp(!!r && window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
      setOpen(true);
    }
    function choose(i) {
      if (!enabled(i)) return;
      var o = options[i];
      setOpen(false);
      if (btn.current) btn.current.focus();
      if (String(o.value) === String(value)) return;
      if (!controlled) inner[1](o.value);
      if (props.onChange) {
        var target = { value: String(o.value), name: props.name, id: id };
        props.onChange({ target: target, currentTarget: target, type: 'change', preventDefault: function () {}, stopPropagation: function () {} }, o);
      }
    }
    React.useEffect(function () {
      if (!open) return;
      function away(e) { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); }
      document.addEventListener('pointerdown', away);
      return function () { document.removeEventListener('pointerdown', away); };
    }, [open]);
    React.useEffect(function () {
      if (!open || !list.current || active < 0) return;
      var el = list.current.children[active];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }, [open, active]);
    function onKey(e) {
      var k = e.key;
      if (!open) {
        if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); show(); }
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); setActive(step(active, 1)); }
      else if (k === 'ArrowUp') { e.preventDefault(); setActive(step(active, -1)); }
      else if (k === 'Home') { e.preventDefault(); setActive(step(-1, 1)); }
      else if (k === 'End') { e.preventDefault(); setActive(step(options.length, -1)); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
      else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      else if (k === 'Tab') { setOpen(false); }
      else if (k.length === 1) {
        var now = Date.now(), t = typed.current;
        t.s = (now - t.t > 700 ? '' : t.s) + k.toLowerCase(); t.t = now;
        for (var i = 0; i < options.length; i++) {
          var n = (active + 1 + i) % options.length;
          if (t.s.length > 1) n = i;
          if (enabled(n) && String(options[n].label).toLowerCase().indexOf(t.s) === 0) { setActive(n); break; }
        }
      }
    }
    var control = h('span', { className: cx('rr-select-wrap', 'rr-select-wrap--list', open && 'rr-select-wrap--open'), ref: wrap }, [
      h('button', {
        key: 'b', ref: btn, type: 'button', id: id, role: 'combobox', disabled: props.disabled,
        className: cx('rr-control', 'rr-control--' + size, 'rr-select', 'rr-select__button', !current && 'rr-select__button--empty'),
        'aria-haspopup': 'listbox', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': listId,
        'aria-activedescendant': open && active >= 0 ? id + '-o' + active : undefined,
        'aria-invalid': invalid ? 'true' : undefined, 'aria-describedby': props.error || props.hint ? id + '-msg' : undefined,
        onClick: function () { open ? setOpen(false) : show(); }, onKeyDown: onKey
      }, h('span', { className: 'rr-select__value' }, current ? current.label : (props.placeholder || ''))),
      h('span', { className: 'rr-select-wrap__caret', key: 'c', 'aria-hidden': 'true' }, Icons.chevronDown({ width: '100%', height: '100%' })),
      props.name ? h('input', { key: 'n', type: 'hidden', name: props.name, value: value == null ? '' : value }) : null,
      h('ul', {
        key: 'l', ref: list, id: listId, role: 'listbox', tabIndex: -1, hidden: !open,
        'aria-labelledby': id,
        className: cx('rr-select__list', 'rr-select__list--' + size, up && 'rr-select__list--up')
      }, options.map(function (o, i) {
        var sel = current === o;
        return h('li', {
          key: 'o' + i, id: id + '-o' + i, role: 'option', 'aria-selected': sel ? 'true' : 'false', 'aria-disabled': o.disabled ? 'true' : undefined,
          className: cx('rr-select__option', i === active && 'rr-select__option--active'),
          onPointerMove: function () { if (i !== active && enabled(i)) setActive(i); },
          onMouseDown: function (e) { e.preventDefault(); },
          onClick: function () { choose(i); }
        }, [
          h('span', { key: 't', className: 'rr-select__otext' }, [
            h('span', { key: 'l', className: 'rr-select__olabel' }, o.label),
            o.detail ? h('span', { key: 'd', className: 'rr-select__odetail' }, o.detail) : null
          ]),
          h('span', { key: 'c', className: 'rr-select__check', 'aria-hidden': 'true' }, sel ? Icons.check({ width: 16, height: 16 }) : null)
        ]);
      }))
    ]);
    return Field(Object.assign({}, props, { id: id }), control);
  }

  /* ---- Checkbox ----------------------------------------------------- */

  function Checkbox(props) {
    props = props || {};
    var rest = omit(props, ['label', 'hint', 'indeterminate', 'className', 'children']);
    var ref = React.useCallback(
      function (node) {
        if (node) node.indeterminate = !!props.indeterminate;
      },
      [props.indeterminate]
    );
    return h('label', { className: cx('rr-choice', props.disabled && 'rr-choice--disabled', props.className), style: { position: 'relative' } }, [
      h('input', Object.assign({ type: 'checkbox', className: 'rr-choice__input', ref: ref, key: 'i' }, rest)),
      h(
        'span',
        { className: 'rr-choice__box', key: 'b' },
        props.indeterminate
          ? Icons.minus({ className: 'rr-choice__mark', width: '12', height: '12' })
          : Icons.check({ className: 'rr-choice__mark', width: '12', height: '12' })
      ),
      h('span', { className: 'rr-choice__text', key: 't' }, [
        h('span', { key: 'l' }, props.label || props.children),
        props.hint ? h('span', { className: 'rr-choice__hint', key: 'h' }, props.hint) : null
      ])
    ]);
  }

  /* ---- Radio -------------------------------------------------------- */

  function Radio(props) {
    props = props || {};
    var rest = omit(props, ['label', 'hint', 'className', 'children']);
    return h('label', { className: cx('rr-choice', props.disabled && 'rr-choice--disabled', props.className), style: { position: 'relative' } }, [
      h('input', Object.assign({ type: 'radio', className: 'rr-choice__input', key: 'i' }, rest)),
      h('span', { className: 'rr-choice__box rr-choice__box--radio', key: 'b' }, h('span', { className: 'rr-choice__dot' })),
      h('span', { className: 'rr-choice__text', key: 't' }, [
        h('span', { key: 'l' }, props.label || props.children),
        props.hint ? h('span', { className: 'rr-choice__hint', key: 'h' }, props.hint) : null
      ])
    ]);
  }

  /* ---- Switch ------------------------------------------------------- */

  function Switch(props) {
    props = props || {};
    var size = props.size || 'md';
    var rest = omit(props, ['label', 'size', 'className', 'children']);
    return h(
      'label',
      { className: cx('rr-switch', size === 'sm' && 'rr-switch--sm', props.disabled && 'rr-switch--disabled', props.className), style: { position: 'relative' } },
      [
        h('input', Object.assign({ type: 'checkbox', role: 'switch', className: 'rr-switch__input', key: 'i' }, rest)),
        h('span', { className: 'rr-switch__track', key: 't' }, h('span', { className: 'rr-switch__thumb' })),
        props.label ? h('span', { key: 'l' }, props.label) : null
      ]
    );
  }

  /* ---- Badge -------------------------------------------------------- */

  function Badge(props) {
    props = props || {};
    var tone = props.tone || 'neutral';
    var variant = props.variant || 'subtle';
    var size = props.size || 'md';
    return h(
      'span',
      { className: cx('rr-badge', 'rr-badge--' + variant, 'rr-badge--' + tone, 'rr-badge--' + size, props.className) },
      [props.dot ? h('span', { className: 'rr-badge__dot', key: 'd' }) : null, h('span', { key: 'l' }, props.children)]
    );
  }

  /* ---- Avatar ------------------------------------------------------- */

  function initials(name) {
    if (!name) return '';
    var parts = String(name).trim().split(/\s+/);
    /* A Hangul name is one family syllable, not two letters: 김정우 is 김, as AvatarMark
       and the Avatar README say. Taking two gave 김정, which reads as a different name. */
    if (/^[\uAC00-\uD7AF]/.test(parts[0])) return parts[0].charAt(0);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function Avatar(props) {
    props = props || {};
    var size = props.size || 'md';
    return h(
      'span',
      {
        className: cx('rr-avatar', 'rr-avatar--' + size, props.shape === 'square' && 'rr-avatar--square', props.className),
        style: props.color ? { background: props.color } : null,
        title: props.name
      },
      [
        props.src
          ? h('img', { className: 'rr-avatar__img', src: props.src, alt: props.name || '', key: 'i' })
          : props.art === false
            ? h('span', { key: 'n', 'aria-hidden': props.name ? undefined : 'true' }, initials(props.name))
            : (size === 'xs' || size === 'sm')
            /* the mark needs about 40px to be read as a mark rather than a smudge */
            ? h('span', { key: 'n', 'aria-hidden': props.name ? undefined : 'true' }, initials(props.name))
            : h(AvatarMark, { key: 'n', name: props.name, seed: props.seed, family: props.family }),
        props.status ? h('span', { className: 'rr-avatar__status rr-avatar__status--' + props.status, key: 's' }) : null,
        props.name && !props.src ? h('span', { key: 'sr', style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, props.name) : null
      ]
    );
  }



  /* ==== Agent harness surfaces ======================================== */

  /* ---- Changes ------------------------------------------------------- */

  /* What an agent altered, in the words the person used for it. Not a code
     diff: no line numbers, no plus and minus columns, no file path. Somebody
     who has never opened a terminal has to be able to approve or undo this. */

  var CHANGE_WORD = { changed: 'Changed', added: 'Added', removed: 'Removed' };

  function Changes(props) {
    props = props || {};
    var items = props.items || [];
    var rows = items.map(function (it, i) {
      var kind = it.kind || (it.before == null ? 'added' : it.after == null ? 'removed' : 'changed');
      return h('div', { className: cx('rr-changes__item', 'rr-changes__item--' + kind), key: i }, [
        h('div', { className: 'rr-changes__where', key: 'w' }, [
          h('span', { className: 'rr-changes__kind', key: 'k' }, CHANGE_WORD[kind] || kind),
          it.label ? h('span', { className: 'rr-changes__label', key: 'l' }, it.label) : null
        ]),
        it.before != null
          ? h('p', { className: 'rr-changes__before', key: 'b' }, [
              h('span', { className: 'rr-changes__tag', key: 't' }, 'Was'), it.before])
          : null,
        it.after != null
          ? h('p', { className: 'rr-changes__after', key: 'a' }, [
              h('span', { className: 'rr-changes__tag', key: 't' }, 'Now'), it.after])
          : null,
        it.note ? h('p', { className: 'rr-changes__note', key: 'n' }, it.note) : null
      ]);
    });
    var count = items.length + ' ' + (items.length === 1 ? 'change' : 'changes');
    return h('div', { className: cx('rr-changes', props.className), role: 'group',
                      'aria-label': (props.title || 'Changes') + ': ' + count }, [
      h('div', { className: 'rr-changes__head', key: 'h' }, [
        h('span', { className: 'rr-changes__title', key: 't' }, props.title),
        h('span', { className: 'rr-changes__count', key: 'c' }, props.summary || count)
      ]),
      h('div', { className: 'rr-changes__body', key: 'b' }, rows),
      (props.onAccept || props.onReject)
        ? h('div', { className: 'rr-changes__foot', key: 'f' }, [
            props.onReject ? h(Button, { key: 'r', variant: 'secondary', size: 'sm', onClick: props.onReject },
              props.rejectLabel || 'Put it back') : null,
            props.onAccept ? h(Button, { key: 'a', size: 'sm', onClick: props.onAccept },
              props.acceptLabel || 'Keep these') : null
          ])
        : null
    ]);
  }

  /* ---- CostMeter ----------------------------------------------------- */

  function CostMeter(props) {
    props = props || {};
    var used = Number(props.used) || 0;
    var budget = Number(props.budget) || 0;
    var pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
    var tone = props.tone || (pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'default');
    var fmt = props.format || function (v) { return v.toLocaleString(); };
    return h('div', {
      className: cx('rr-meter', tone !== 'default' && 'rr-meter--' + tone, props.className),
      role: 'group', 'aria-label': props.label || 'Spend'
    }, [
      h('div', { className: 'rr-meter__head', key: 'h' }, [
        h('span', { className: 'rr-meter__value', key: 'v' }, [
          fmt(used),
          (budget && props.showBudget !== false)
            ? h('span', { className: 'rr-meter__of', key: 'o' }, ' of ' + fmt(budget) + (props.unit ? ' ' + props.unit : ''))
            : null
        ]),
        h('span', { className: 'rr-meter__label', key: 'l' }, props.label)
      ]),
      h('div', { className: 'rr-meter__track', key: 't', role: 'progressbar',
                 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('span', { className: 'rr-meter__fill', style: { width: pct + '%' } })),
      props.breakdown && props.breakdown.length
        ? h('div', { className: 'rr-meter__legend', key: 'g' }, props.breakdown.map(function (b, i) {
            return h('span', { key: i }, [b.label + ' ', h('b', { key: 'v' }, fmt(b.value))]);
          }))
        : null
    ]);
  }

  /* ---- AccessList ---------------------------------------------------- */

  /* Plain kinds. A person granting access is not thinking about connectors,
     shells or network egress; they are thinking about their files, their apps,
     the web, their computer and what the thing remembers. */
  var SCOPE_ICON = { files: 'file', apps: 'link', web: 'globe', computer: 'tool', memory: 'passport' };
  var SCOPE_MODE = { read: 'Can read', write: 'Can read and write', none: 'No access' };

  function AccessList(props) {
    props = props || {};
    var scopes = props.scopes || [];
    return h('div', { className: cx('rr-scope', props.className), role: 'group',
                      'aria-label': props.label || 'What this agent can reach' }, [
      props.label ? h(SectionMark, { key: 'm', label: [props.label], trailing: String(scopes.length) }) : null,
      scopes.map(function (s, i) {
        var Ico = Icons[SCOPE_ICON[s.kind] || 'shield'];
        var mode = s.mode || 'read';
        return h('div', { className: 'rr-scope__row', key: i }, [
          h('span', { className: 'rr-scope__icon', key: 'i', 'aria-hidden': 'true' }, h(Ico)),
          h('span', { className: 'rr-scope__label', key: 'l', title: s.label }, s.label),
          h('span', { className: 'rr-scope__mode rr-scope__mode--' + mode, key: 'm' }, SCOPE_MODE[mode] || mode)
        ]);
      })
    ]);
  }

  /* ---- TaskStatus ----------------------------------------------------- */

  var RUN_LABEL = { queued: 'Queued', running: 'Running', blocked: 'Waiting on you',
                    done: 'Done', failed: 'Failed', stopped: 'Stopped' };

  function TaskStatus(props) {
    props = props || {};
    var state = props.state || 'queued';
    return h('span', { className: cx('rr-task', 'rr-task--' + state, props.className), role: 'status' }, [
      state === 'running'
        ? h(Loader, { key: 'd', size: 'sm', label: props.label == null ? RUN_LABEL[state] : (props.label || RUN_LABEL[state]) })
        : h('span', { className: 'rr-task__dot', key: 'd', 'aria-hidden': 'true' }),
      props.label === ''
        ? null
        : h('span', { className: 'rr-task__label', key: 'l' }, props.label || RUN_LABEL[state] || state),
      props.elapsed ? h('span', { className: 'rr-task__elapsed', key: 'e' }, props.elapsed) : null
    ]);
  }

  /* ---- AgentRoster --------------------------------------------------- */

  function AgentRoster(props) {
    props = props || {};
    var agents = props.agents || [];
    return h('div', { className: cx('rr-roster', props.className), role: 'list',
                      'aria-label': props.label || 'Agents' }, agents.map(function (a, i) {
      return h('div', { className: 'rr-roster__row', key: a.id || i, role: 'listitem' }, [
        h('span', { className: 'rr-roster__state', key: 's' },
          h(TaskStatus, { state: a.state, label: '' })),
        h('span', { className: 'rr-roster__body', key: 'b' }, [
          h('span', { className: 'rr-roster__name', key: 'n' }, a.name),
          h('span', { className: 'rr-roster__step', key: 'p' }, a.step || RUN_LABEL[a.state] || '')
        ]),
        h('span', { className: 'rr-roster__meta', key: 'm' }, [
          a.elapsed ? h('span', { key: 'e' }, a.elapsed) : null,
          a.note ? h('span', { key: 'c' }, a.note) : null
        ]),
        props.onStop && (a.state === 'running' || a.state === 'queued')
          ? h('span', { className: 'rr-roster__actions', key: 'a' },
              h(Button, { variant: 'ghost', size: 'sm', onClick: function () { props.onStop(a); } }, 'Stop'))
          : null
      ]);
    }));
  }

  /* ---- AgentHandoff -------------------------------------------------- */

  /* One piece of work moving from the thing that finished it to the thing that
     picked it up, and - the part that matters - what traveled with it. Read
     top to bottom like a relay, not left to right across a divider: the person
     reading this wants to know who has it now and what they were given. */

  function AgentHandoff(props) {
    props = props || {};
    var carried = props.carried || [];
    return h('div', { className: cx('rr-handoff', props.className), role: 'group',
                      'aria-label': (props.from || '') + ' passed this to ' + (props.to || '') }, [
      h('div', { className: 'rr-handoff__step rr-handoff__step--from', key: 'f' }, [
        h('span', { className: 'rr-handoff__rail', key: 'r', 'aria-hidden': 'true' },
          h('span', { className: 'rr-handoff__dot rr-handoff__dot--done' },
            h(Icons.check, { size: 12 }))),
        h('span', { className: 'rr-handoff__body', key: 'b' }, [
          h('span', { className: 'rr-handoff__name', key: 'n' }, props.from),
          props.fromNote ? h('span', { className: 'rr-handoff__note', key: 'o' }, props.fromNote) : null
        ]),
        h('span', { className: 'rr-handoff__when', key: 'w' }, props.fromWhen || 'Finished')
      ]),
      h('div', { className: 'rr-handoff__pass', key: 'p' }, [
        h('span', { className: 'rr-handoff__rail', key: 'r', 'aria-hidden': 'true' },
          h('span', { className: 'rr-handoff__arrow' }, h(Icons.arrowDown, { size: 14 }))),
        h('span', { className: 'rr-handoff__passlabel', key: 'l' }, props.passLabel || 'Passed on')
      ]),
      h('div', { className: 'rr-handoff__step rr-handoff__step--to', key: 't' }, [
        h('span', { className: 'rr-handoff__rail', key: 'r', 'aria-hidden': 'true' },
          h('span', { className: 'rr-handoff__dot rr-handoff__dot--now' })),
        h('span', { className: 'rr-handoff__body', key: 'b' }, [
          h('span', { className: 'rr-handoff__name', key: 'n' }, props.to),
          props.toNote ? h('span', { className: 'rr-handoff__note', key: 'o' }, props.toNote) : null
        ]),
        h('span', { className: 'rr-handoff__when', key: 'w' }, props.toWhen || 'Working on it now')
      ]),
      carried.length
        ? h('div', { className: 'rr-handoff__carried', key: 'c' }, [
            h('span', { className: 'rr-handoff__carriedhead', key: 'h' }, props.carriedLabel || 'What came with it'),
            h('ul', { key: 'u' }, carried.map(function (c, i) { return h('li', { key: i }, c); }))
          ])
        : null
    ]);
  }

  /* ---- ScheduleRow ------------------------------------------------------ */

  function ScheduleRow(props) {
    props = props || {};
    var last = props.lastRun;
    return h('div', { className: cx('rr-schedule', props.enabled === false && 'rr-schedule--off', props.className) }, [
      h('span', { className: 'rr-schedule__body', key: 'b' }, [
        h('span', { className: 'rr-schedule__name', key: 'n' }, props.name),
        h('span', { className: 'rr-schedule__when', key: 'w' },
          props.enabled === false ? 'Paused' : (props.cadence || '') + (props.nextRun ? ' · next ' + props.nextRun : ''))
      ]),
      last ? h('span', { className: 'rr-schedule__last', key: 'l' },
        h(TaskStatus, { state: last.state, label: last.label || ('Last ' + (last.at || '')) })) : null,
      props.onToggle
        ? h('span', { key: 't' }, h(Switch, { checked: props.enabled !== false, onChange: props.onToggle,
            label: props.switchLabel || ('Runs on schedule: ' + (props.name || 'task')) }))
        : null
    ]);
  }

  /* ---- CheckIn ------------------------------------------------------- */

  function CheckIn(props) {
    props = props || {};
    var opts = props.options || [];
    return h('div', { className: cx('rr-checkin', props.className), role: 'group',
                      'aria-label': 'The agent needs an answer' }, [
      h('div', { className: 'rr-checkin__mark', key: 'm' }, [
        h('span', { className: 'rr-tick', key: 't', 'aria-hidden': 'true' }),
        h('span', { key: 'l' }, props.mark || 'Waiting on you')
      ]),
      h('p', { className: 'rr-checkin__q', key: 'q' }, props.question),
      props.context ? h('p', { className: 'rr-checkin__ctx', key: 'c' }, props.context) : null,
      opts.length
        ? h('div', { className: 'rr-checkin__opts', key: 'o' }, opts.map(function (o, i) {
            return h(Button, {
              key: i, size: 'sm', variant: i === 0 ? 'primary' : 'secondary',
              onClick: function () { if (props.onAnswer) props.onAnswer(o); }
            }, o.label || o);
          }))
        : null,
      props.askedAt
        ? h('div', { className: 'rr-checkin__wait', key: 'w' }, [
            h(Loader, { key: 'd', size: 'sm', label: 'Waiting' }),
            h('span', { key: 's' }, 'Asked ' + props.askedAt + '. Nothing runs until you answer.')
          ])
        : null
    ]);
  }

  /* ---- MemoryMeter -------------------------------------------------- */

  /* How full the agent's working memory of this job is. Shares, not counts:
     nobody outside the engineering team knows whether 84,000 is a lot, and the
     only decision this bar supports is "is it nearly full". Pass `format` if a
     particular surface really does want the raw numbers. */

  var CTX_COLORS = ['var(--action-primary)', 'var(--accent-sky-3)', 'var(--accent-teal-3)', 'var(--gray-4)'];

  function MemoryMeter(props) {
    props = props || {};
    var total = Number(props.total) || 0;
    var segs = props.segments || [];
    var used = segs.reduce(function (a, s) { return a + (Number(s.value) || 0); }, 0);
    var share = function (v) { return total ? Math.round((v / total) * 100) : 0; };
    var fmt = props.format || function (v) { return share(v) + '%'; };
    var left = Math.max(0, total - used);
    return h('div', { className: cx('rr-mem', props.className), role: 'group',
                      'aria-label': (props.label || 'Working memory') + ': ' + share(used) + ' percent full' }, [
      h('div', { className: 'rr-mem__head', key: 'h' }, [
        h('span', { className: 'rr-mem__title', key: 't' }, props.label || 'Working memory'),
        h('span', { className: 'rr-mem__full', key: 'f' }, share(used) + '% full')
      ]),
      h('div', { className: 'rr-mem__bar', key: 'b' }, segs.map(function (s, i) {
        return h('span', {
          className: 'rr-mem__seg', key: i,
          style: { width: share(s.value) + '%', background: s.color || CTX_COLORS[i % CTX_COLORS.length] }
        });
      })),
      h('div', { className: 'rr-mem__legend', key: 'l' }, segs.map(function (s, i) {
        return h('span', { className: 'rr-mem__key', key: i }, [
          h('span', { className: 'rr-mem__swatch', key: 's', style: { background: s.color || CTX_COLORS[i % CTX_COLORS.length] } }),
          s.label,
          h('span', { className: 'rr-mem__num', key: 'n' }, fmt(s.value))
        ]);
      }).concat([
        h('span', { className: 'rr-mem__key rr-mem__key--left', key: 'free' }, [
          h('span', { className: 'rr-mem__swatch', key: 's', style: { background: 'var(--surface-sunken)' } }),
          props.leftLabel || 'Room left',
          h('span', { className: 'rr-mem__num', key: 'n' }, fmt(left))
        ])
      ]))
    ]);
  }

  /* ---- AvatarMark ---------------------------------------------------- */

  /* A first-time account has no photo. Rather than a gray disc with two
     letters in it, everyone arrives at their own threshold: a deep field, a
     raked seam of light at the brand's 40 degrees, and the lit side beyond it.
     Deterministic from a seed, so a person's mark never changes.

     The nine accent families are the palette. Redrob Blue is the brand's own
     signal and is not spent on an avatar. Every family's step 5 clears white
     text at 4.5:1 - the lowest is teal at 6.28:1, the highest violet at 18.95:1 - so the initials are legible
     on every mark in the set, and the accent steps carry no per-theme value, so
     a person's mark is the same in light and dark. */

  var MARK_FAMILIES = ['teal', 'sky', 'violet', 'pink', 'red', 'orange', 'yellow', 'lime', 'green'];
  var MARK_RUN = 33.56;        /* 40 tan 40deg: the run of the rake across the tile */
  /* ONE threshold, in the same place on every mark, with the same three faces
     behind it. The seam is the brand, not a per-person variable: a set of
     avatars whose diagonals sit at different heights reads as a rendering bug,
     not as a system. Only the color and the initials change from person to
     person.

     19 is the one position that works for everyone. The floor is set by the
     WIDEST initials, not the average pair: 'WK' at 13.5px is 21.6px across, and
     below a seam of about 15.6 its bottom-right corner crosses onto the pale
     side, where white type fails. The ceiling is the circular crop - past about
     22 the lit wedge falls outside the circle and the mark becomes a plain
     disc. 19 sits in the middle of that window with margin on both sides. */
  var MARK_SEAM = 19;
  var MARK_FACES = 3;
  var MARK_CJK = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/;

  /* Initials for a mark. Latin takes two, CJK one. Two Hangul syllables are a
     full em each, so the pair runs nearly twice as wide as two Latin caps -
     wide enough to cross the seam at every seam position, and too small to
     read at 24px. One syllable is a complete unit and stays legible. */
  function markInitials(name) {
    if (!name) return '';
    var t = String(name).trim();
    if (MARK_CJK.test(t)) return t.replace(/\s+/g, '').slice(0, 1);
    return initials(t);
  }

  /* FNV-1a: picks the family, stable forever for a seed. */
  function markHash(v) {
    var s = String(v == null ? '' : v), n = 2166136261;
    for (var i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = (n * 16777619) >>> 0; }
    return n >>> 0;
  }

  function AvatarMark(props) {
    props = props || {};
    var seed = props.seed != null ? props.seed : (props.name || '');
    var n = markHash(seed);
    var fam = props.family && MARK_FAMILIES.indexOf(props.family) !== -1 ? props.family : MARK_FAMILIES[n % 9];
    var o = MARK_SEAM;
    var layers = MARK_FACES;
    var deep = 'var(--accent-' + fam + '-5)';
    var lit = 'var(--accent-' + fam + '-1)';
    var edge = 'var(--accent-' + fam + '-3)';
    var text = markInitials(props.name);
    var cjk = MARK_CJK.test(text);

    var kids = [h('rect', { key: 'g', width: 40, height: 40, fill: deep })];
    /* The gateway's layered faces, on the near side only: drawn before the lit
       wedge, which then covers anything past the seam. */
    for (var i = 1; i <= layers; i++) {
      var lo = o - i * 5;   /* all three faces stay inside the circular crop */
      kids.push(h('path', {
        key: 'f' + i, fill: edge, opacity: 0.16,
        d: 'M' + lo + ' 40L' + (lo + MARK_RUN) + ' 0h1.4L' + (lo + 1.4) + ' 40Z'
      }));
    }
    kids.push(h('path', { key: 'l', fill: lit, d: 'M' + o + ' 40L' + (o + MARK_RUN) + ' 0H64V40Z' }));
    kids.push(h('path', { key: 's', fill: edge, d: 'M' + o + ' 40L' + (o + MARK_RUN) + ' 0h1.9L' + (o + 1.9) + ' 40Z' }));
    if (text) {
      kids.push(h('text', {
        /* Set left of center on purpose: the lit wedge sits on the right, so
           optical balance and seam clearance want the same few pixels. */
        key: 't', x: 16, y: 20, fill: 'var(--redrob-white)',
        textAnchor: 'middle', dominantBaseline: 'central',
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: (cjk ? 16 : 13.5) + 'px',
          fontWeight: 600,
          letterSpacing: cjk ? '0' : '-0.02em'
        }
      }, text));
    }

    return h('svg', {
      className: cx('rr-avatar-mark', props.className),
      viewBox: '0 0 40 40', width: '100%', height: '100%',
      role: props.label ? 'img' : undefined,
      'aria-label': props.label,
      'aria-hidden': props.label ? undefined : 'true',
      focusable: 'false'
    }, kids);
  }

  /* ---- Card --------------------------------------------------------- */

  function Card(props) {
    props = props || {};
    var body = [];
    var meta = props.meta || props.eyebrow;
    if (meta) {
      body.push(
        h('div', { className: 'rr-card__meta', key: 'e' }, [
          h('span', { className: 'rr-tick', key: 't', 'aria-hidden': 'true' }),
          h('span', { key: 'l' }, Array.isArray(meta) ? meta.join(' \u00b7 ') : meta)
        ])
      );
    }
    if (props.title) body.push(h(props.interactive ? 'span' : 'h3', { className: 'rr-card__title', key: 't' }, props.title));
    if (props.description) body.push(h(props.interactive ? 'span' : 'p', { className: 'rr-card__desc', key: 'd' }, props.description));
    if (props.children) body.push(h(props.interactive ? 'span' : 'div', { key: 'c', className: props.interactive ? 'rr-card__slot' : undefined }, props.children));
    return h(
      props.interactive ? 'button' : 'div',
      {
        className: cx('rr-card', props.variant && props.variant !== 'default' && 'rr-card--' + props.variant, props.interactive && 'rr-card--interactive', props.padding === 'tight' && 'rr-card--tight', props.wash && 'rr-wash rr-grain', props.wash === 'brand' && 'rr-wash--brand', props.className),
        onClick: props.onClick,
        type: props.interactive ? 'button' : undefined,
        style: Object.assign({ textAlign: props.interactive ? 'left' : undefined }, props.style)
      },
      [
        props.media ? h('div', { className: 'rr-card__media', key: 'm' }, props.media) : null,
        h('div', { className: 'rr-card__body', key: 'b' }, body),
        props.footer ? h('div', { className: 'rr-card__footer', key: 'f' }, props.footer) : null
      ]
    );
  }

  /* ---- SectionMark --------------------------------------------------- */

  function SectionMark(props) {
    props = props || {};
    return h('div', { className: cx('rr-section-mark', props.className), role: props.as === 'heading' ? 'heading' : undefined, 'aria-level': props.as === 'heading' ? props.level || 2 : undefined }, [
      h('span', { className: cx('rr-tick', props.tone === 'muted' && 'rr-tick--muted'), key: 't', 'aria-hidden': 'true' }),
      h('span', { key: 'l' }, Array.isArray(props.label) ? props.label.join(' \u00b7 ') : props.label),
      props.trailing ? h('span', { key: 'r', style: { flex: 'none', color: 'var(--ink-muted)' } }, props.trailing) : null
    ]);
  }





  /* ---- Scroller ------------------------------------------------------ */

  function Scroller(props) {
    props = props || {};
    var axis = props.axis || 'y';
    var style = Object.assign({}, props.style);
    if (props.fadeSize) style['--rr-scroller-fade'] = typeof props.fadeSize === 'number' ? props.fadeSize + 'px' : props.fadeSize;
    if (props.background) style['--rr-scroller-bg'] = props.background;

    var viewStyle = {};
    if (props.maxHeight) viewStyle.maxHeight = typeof props.maxHeight === 'number' ? props.maxHeight + 'px' : props.maxHeight;
    if (props.height) viewStyle.height = typeof props.height === 'number' ? props.height + 'px' : props.height;

    return h('div', {
      className: cx('rr-scroller', 'rr-scroller--' + axis,
                    props.size === 'thin' && 'rr-scroller--thin',
                    props.tone === 'inverse' && 'rr-scroller--inverse',
                    props.gutter === 'auto' && 'rr-scroller--gutter-auto',
                    props.fade === false && 'rr-scroller--no-fade',
                    props.className),
      style: style
    }, [
      h('span', { className: 'rr-scroller__edge rr-scroller__edge--start', key: 's', 'aria-hidden': 'true' }),
      h('div', {
        className: 'rr-scroller__view', key: 'v', style: viewStyle,
        /* A scroll region has to be reachable by keyboard. Without a tabindex a
           person using only a keyboard cannot scroll it at all. */
        tabIndex: props.focusable === false ? undefined : 0,
        role: props.label ? 'region' : undefined,
        'aria-label': props.label,
        onScroll: props.onScroll
      }, props.children),
      h('span', { className: 'rr-scroller__edge rr-scroller__edge--end', key: 'e', 'aria-hidden': 'true' })
    ]);
  }

  /* ---- MarkReveal ---------------------------------------------------- */

  function MarkReveal(props) {
    props = props || {};
    var src = props.src;
    return h('div', {
      className: cx('rr-reveal',
                    props.mode === 'handoff' && 'rr-reveal--handoff',
                    props.size && props.size !== 'md' && 'rr-reveal--' + props.size,
                    props.symbol && 'rr-reveal--symbol',
                    props.tone === 'dark' && 'rr-reveal--dark',
                    props.className),
      style: props.height ? { minHeight: props.height } : undefined,
      role: 'img',
      'aria-label': props.alt || 'Redrob'
    }, [
      props.ground === false ? null : h('span', { className: 'rr-reveal__ground', key: 'g', 'aria-hidden': 'true' }),
      h('span', {
        className: 'rr-reveal__lock', key: 'l',
        style: { '--rr-reveal-mask': 'url(' + src + ')' }
      }, [
        h('img', {
          className: 'rr-reveal__art', key: 'a', src: src, alt: '',
          onAnimationEnd: function (e) {
            if (props.onDone && e.animationName && e.animationName.indexOf('wipe') !== -1) props.onDone();
          }
        }),
        h('span', { className: 'rr-reveal__sheen', key: 's', 'aria-hidden': 'true' })
      ])
    ]);
  }

  /* ---- Loader ------------------------------------------------------- */

  function Loader(props) {
    props = props || {};
    var label = props.label || 'Loading';
    return h('div', {
      className: cx('rr-loader', props.size && 'rr-loader--' + props.size,
                    props.tone && props.tone !== 'brand' && 'rr-loader--' + props.tone,
                    props.className),
      role: 'status',
      'aria-live': props.live === false ? undefined : 'polite'
    }, [
      h('span', { className: 'rr-loader__bars', key: 'b', 'aria-hidden': 'true' }, [
        h('span', { className: 'rr-loader__bar', key: 1 }),
        h('span', { className: 'rr-loader__bar', key: 2 }),
        h('span', { className: 'rr-loader__bar', key: 3 })
      ]),
      props.showLabel
        ? h('span', { className: 'rr-loader__label', key: 'l' }, label)
        : h('span', { className: 'rr-loader__sr', key: 'l' }, label)
    ]);
  }

  /* ---- Statement ---------------------------------------------------- */

  function Statement(props) {
    props = props || {};
    var lang = props.lang || 'en';
    var level = props.level === 2 ? 'rr-voice-2' : 'rr-voice-1';
    return h('div', {
      className: cx('rr-statement', props.wide && 'rr-statement--wide', props.className),
      lang: lang
    }, [
      props.mark ? h('div', { className: 'rr-statement__mark', key: 'm' },
        h(SectionMark, { label: props.mark })) : null,
      h('p', { className: level, key: 's' }, props.children),
      props.lede ? h('p', { className: 'rr-voice-lede rr-statement__lede', key: 'l' }, props.lede) : null
    ]);
  }

  /* ---- Quote -------------------------------------------------------- */

  function Quote(props) {
    props = props || {};
    var lang = props.lang || 'en';
    return h('figure', {
      className: cx('rr-quote', props.rule === false && 'rr-quote--plain', props.className),
      lang: lang,
      style: { margin: 0 }
    }, [
      h('blockquote', { className: 'rr-voice-quote', key: 'q', style: { margin: 0 } }, props.children),
      props.cite ? h('figcaption', { className: 'rr-quote__cite', key: 'c' }, [
        h('span', { key: 'n' }, props.cite),
        props.role ? h('span', { className: 'rr-quote__role', key: 'r' }, props.role) : null
      ]) : null
    ]);
  }

  /* ---- Alert -------------------------------------------------------- */

  function Alert(props) {
    props = props || {};
    var tone = props.tone || 'info';
    var IconFn = TONE_ICON[tone] || Icons.info;
    return h('div', { className: cx('rr-alert', 'rr-alert--' + tone, props.className), role: tone === 'danger' ? 'alert' : 'status' }, [
      h('span', { className: 'rr-alert__icon', key: 'i' }, IconFn({ width: '100%', height: '100%' })),
      h('div', { className: 'rr-alert__body', key: 'b' }, [
        props.title ? h('div', { className: 'rr-alert__title', key: 't' }, props.title) : null,
        props.children ? h('div', { className: 'rr-alert__text', key: 'x' }, props.children) : null,
        props.action ? h('div', { key: 'a', style: { marginTop: '4px' } }, props.action) : null
      ]),
      props.onClose
        ? h(IconButton, { key: 'c', label: props.closeLabel || 'Dismiss', size: 'sm', onClick: props.onClose }, Icons.close({ width: '100%', height: '100%' }))
        : null
    ]);
  }

  /* ---- Toast -------------------------------------------------------- */

  function Toast(props) {
    props = props || {};
    var tone = props.tone || 'info';
    var IconFn = TONE_ICON[tone] || Icons.info;
    /* danger is assertive, as Alert's is; every other tone polite. */
    var urgent = tone === 'danger';
    return h('div', { className: cx('rr-toast', 'rr-toast--' + tone, props.className), role: urgent ? 'alert' : 'status', 'aria-live': urgent ? 'assertive' : 'polite' }, [
      h('span', { className: 'rr-toast__icon', key: 'i' }, IconFn({ width: '100%', height: '100%' })),
      h('div', { className: 'rr-toast__body', key: 'b' }, [
        h('div', { className: 'rr-toast__title', key: 't' }, props.title),
        props.children ? h('div', { className: 'rr-toast__text', key: 'x' }, props.children) : null,
        props.action ? h('div', { className: 'rr-toast__action', key: 'a' }, props.action) : null
      ]),
      props.onClose
        ? h(IconButton, { key: 'c', label: props.closeLabel || 'Dismiss', size: 'sm', onClick: props.onClose }, Icons.close({ width: '100%', height: '100%' }))
        : null
    ]);
  }

  /* ---- Modal -------------------------------------------------------- */

  function Modal(props) {
    props = props || {};
    if (props.open === false) return null;
    var titleId = nextId('rr-modal-title');
    return h(
      'div',
      {
        className: cx('rr-modal-scrim', props.className),
        onClick: function (e) {
          if (e.target === e.currentTarget && props.onClose) props.onClose();
        }
      },
      h('div', { className: 'rr-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: props.width ? { maxWidth: props.width } : null }, [
        h('div', { className: 'rr-modal__head', key: 'h' }, [
          h('h2', { className: 'rr-modal__title', id: titleId, key: 't' }, props.title),
          props.onClose
            ? h(IconButton, { key: 'c', label: props.closeLabel || 'Close', size: 'sm', onClick: props.onClose }, Icons.close({ width: '100%', height: '100%' }))
            : null
        ]),
        h('div', { className: 'rr-modal__body', key: 'b' }, props.children),
        props.footer ? h('div', { className: 'rr-modal__footer', key: 'f' }, props.footer) : null
      ])
    );
  }

  /* ---- Tooltip ------------------------------------------------------ */

  function Tooltip(props) {
    props = props || {};
    var placement = props.placement || 'top';
    var id = useStableId('rr-tip');
    return h('span', { className: cx('rr-tooltip', props.open && 'rr-tooltip--open', props.className) }, [
      h('span', { key: 'c', 'aria-describedby': id, tabIndex: props.focusable === false ? undefined : 0, style: { display: 'inline-flex' } }, props.children),
      h('span', { className: 'rr-tooltip__bubble rr-tooltip__bubble--' + placement, role: 'tooltip', id: id, key: 'b' }, props.content)
    ]);
  }

  /* ---- Tabs --------------------------------------------------------- */

  function Tabs(props) {
    props = props || {};
    var variant = props.variant || 'line';
    var items = props.items || [];
    var value = props.value != null ? props.value : items.length ? items[0].id : null;
    return h('div', { className: cx('rr-tabs', 'rr-tabs--' + variant, props.className) }, [
      h(
        'div',
        { className: 'rr-tabs__list', role: 'tablist', 'aria-label': props.label, key: 'l',
          /* Roving tabindex: Tab reaches the selected tab, the arrows (and Home, End) move
             between tabs and select as they go. Disabled tabs are skipped. */
          onKeyDown: function (e) {
            var on = items.filter(function (it) { return !it.disabled; });
            var i = on.map(function (it) { return it.id; }).indexOf(value);
            var next = null;
            if (e.key === 'ArrowRight') next = on[(i + 1) % on.length];
            else if (e.key === 'ArrowLeft') next = on[(i - 1 + on.length) % on.length];
            else if (e.key === 'Home') next = on[0];
            else if (e.key === 'End') next = on[on.length - 1];
            if (!next) return;
            e.preventDefault();
            if (props.onChange) props.onChange(next.id);
            var el = e.currentTarget.querySelector('#tab-' + next.id);
            if (el) el.focus();
          } },
        items.map(function (item) {
          return h(
            'button',
            {
              type: 'button',
              key: item.id,
              role: 'tab',
              id: 'tab-' + item.id,
              'aria-selected': String(item.id === value),
              'aria-controls': 'panel-' + item.id,
              tabIndex: item.id === value ? 0 : -1,
              className: 'rr-tab',
              disabled: item.disabled,
              onClick: function () {
                if (props.onChange) props.onChange(item.id);
              }
            },
            [h('span', { key: 't' }, item.label), item.count != null ? h('span', { className: 'rr-tab__count', key: 'c' }, item.count) : null]
          );
        })
      ),
      props.children
        ? h('div', { role: 'tabpanel', id: 'panel-' + value, 'aria-labelledby': 'tab-' + value, key: 'p', style: { paddingTop: 'var(--space-4)' } }, props.children)
        : null
    ]);
  }

  /* ---- Table -------------------------------------------------------- */

  /* Column widths. `table-layout: auto` shares the surplus width out in
     proportion to content, which leaves a column holding a 78px chip sitting in
     196px of space with its heading stranded at one end. Every column hugs its
     content instead, and ONE column - the first, or whichever is marked `grow` -
     absorbs the slack. That is how a reader expects a table to behave: the
     names get the room, the figures sit where the figures sit.

     A hugging column does not wrap, so its width is its longest cell rather than
     its heading. Prose belongs in the grow column; a second column that really
     does need to wrap takes `wrap: true`. */

  function Table(props) {
    props = props || {};
    var columns = props.columns || [];
    var rows = props.rows || [];
    var grow = -1;
    for (var gi = 0; gi < columns.length; gi++) { if (columns[gi].grow) { grow = gi; break; } }
    if (grow === -1) grow = 0;
    return h(
      'div',
      { className: cx('rr-table-wrap', props.className) },
      h('table', { className: cx('rr-table', props.dense && 'rr-table--dense') }, [
        props.caption ? h('caption', { key: 'c' }, props.caption) : null,
        h(
          'thead',
          { key: 'h' },
          h(
            'tr',
            null,
            columns.map(function (col, i) {
              return h('th', {
                key: col.key, scope: 'col',
                className: cx((col.align === 'right' || col.money) && 'rr-table--num', i !== grow && !col.width && !col.wrap && 'rr-table--hug'),
                style: col.width ? { width: col.width } : null
              }, col.header);
            })
          )
        ),
        h(
          'tbody',
          { key: 'b' },
          rows.map(function (row, i) {
            return h(
              'tr',
              { key: row.id != null ? row.id : i },
              columns.map(function (col, ci) {
                var cell = typeof col.render === 'function' ? col.render(row) : row[col.key];
                /* money: the symbol pins left and the figure right, so a column holding
                   won, rupees and dollars lines all three up. Pass "<sym> <figure>". */
                if (col.money && typeof cell === 'string') {
                  var cut = cell.indexOf(' ');
                  cell = cut > 0
                    ? h('span', null, [h('span', { key: 's', className: 'rr-money__sym' }, cell.slice(0, cut)),
                                       h('span', { key: 'v' }, cell.slice(cut + 1))])
                    : h('span', null, h('span', { key: 'v' }, cell));
                }
                /* a cell's own language, because keep-all is scoped to it and a data
                   table of mixed scripts has no page-level lang to inherit */
                var cellLang = typeof col.lang === 'function' ? col.lang(row) : col.lang;
                return h('td', {
                  key: col.key,
                  lang: cellLang || undefined,
                  className: cx((col.align === 'right' || col.money) && 'rr-table--num',
                               col.money && 'rr-table--money',
                               ci !== grow && !col.width && !col.wrap && 'rr-table--hug')
                }, cell);
              })
            );
          })
        )
      ])
    );
  }

  /* ---- Progress ----------------------------------------------------- */

  function Progress(props) {
    props = props || {};
    var max = props.max || 100;
    var value = Math.max(0, Math.min(props.value != null ? props.value : 0, max));
    var pct = Math.round((value / max) * 100);
    var indeterminate = !!props.indeterminate;
    return h(
      'div',
      {
        className: cx('rr-progress', props.tone && 'rr-progress--' + props.tone, props.size === 'sm' && 'rr-progress--sm', indeterminate && 'rr-progress--indeterminate', props.className)
      },
      [
        props.label || props.showValue
          ? h('div', { className: 'rr-progress__head', key: 'h' }, [
              h('span', { className: 'rr-progress__label', key: 'l' }, props.label),
              props.showValue && !indeterminate ? h('span', { className: 'rr-progress__value', key: 'v' }, pct + '%') : null
            ])
          : null,
        h(
          'div',
          {
            className: 'rr-progress__track',
            key: 't',
            role: 'progressbar',
            'aria-valuemin': indeterminate ? undefined : 0,
            'aria-valuemax': indeterminate ? undefined : max,
            'aria-valuenow': indeterminate ? undefined : value,
            'aria-label': props.label || props.ariaLabel
          },
          h('div', { className: 'rr-progress__bar', style: { width: indeterminate ? undefined : pct + '%' } })
        )
      ]
    );
  }

  /* ---- Pagination --------------------------------------------------- */

  function pageList(page, count) {
    var out = [];
    var i;
    if (count <= 7) {
      for (i = 1; i <= count; i++) out.push(i);
      return out;
    }
    out.push(1);
    var start = Math.max(2, page - 1);
    var end = Math.min(count - 1, page + 1);
    if (start > 2) out.push('gap-start');
    for (i = start; i <= end; i++) out.push(i);
    if (end < count - 1) out.push('gap-end');
    out.push(count);
    return out;
  }

  function Pagination(props) {
    props = props || {};
    var page = props.page || 1;
    var count = props.pageCount || 1;
    function go(n) {
      if (props.onChange && n >= 1 && n <= count && n !== page) props.onChange(n);
    }
    var kids = [
      h(
        'button',
        { type: 'button', key: 'prev', className: 'rr-page', disabled: page <= 1, 'aria-label': props.previousLabel || 'Previous page', onClick: function () { go(page - 1); } },
        Icons.chevronLeft({ width: 16, height: 16 })
      )
    ];
    pageList(page, count).forEach(function (item) {
      if (typeof item === 'string') {
        kids.push(h('span', { key: item, className: 'rr-page__gap', 'aria-hidden': 'true' }, '…'));
      } else {
        kids.push(
          h(
            'button',
            {
              type: 'button',
              key: 'p' + item,
              className: 'rr-page',
              'aria-current': item === page ? 'page' : undefined,
              'aria-label': 'Page ' + item,
              onClick: function () { go(item); }
            },
            item
          )
        );
      }
    });
    kids.push(
      h(
        'button',
        { type: 'button', key: 'next', className: 'rr-page', disabled: page >= count, 'aria-label': props.nextLabel || 'Next page', onClick: function () { go(page + 1); } },
        Icons.chevronRight({ width: 16, height: 16 })
      )
    );
    return h('nav', { className: cx('rr-pagination', props.className), 'aria-label': props.label || 'Pagination' }, kids);
  }

  /* ---- Breadcrumb --------------------------------------------------- */

  function Breadcrumb(props) {
    props = props || {};
    var items = props.items || [];
    return h(
      'nav',
      { className: cx('rr-breadcrumb', props.className), 'aria-label': props.label || 'Breadcrumb' },
      h(
        'ol',
        { className: 'rr-breadcrumb__list' },
        items.map(function (item, i) {
          var last = i === items.length - 1;
          return h('li', { key: i, style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' } }, [
            last
              ? h('span', { className: 'rr-breadcrumb__current', key: 'c', 'aria-current': 'page' }, item.label)
              : h('a', { className: 'rr-breadcrumb__link', key: 'l', href: item.href || '#', onClick: item.onClick }, item.label),
            last ? null : h('span', { className: 'rr-breadcrumb__sep', key: 's', 'aria-hidden': 'true' }, '/')
          ]);
        })
      )
    );
  }

  /* ---- Skeleton ----------------------------------------------------- */

  function Skeleton(props) {
    props = props || {};
    var variant = props.variant || 'text';
    var style = Object.assign({}, props.style);
    if (props.width != null) style.width = typeof props.width === 'number' ? props.width + 'px' : props.width;
    if (props.height != null) style.height = typeof props.height === 'number' ? props.height + 'px' : props.height;
    if (variant === 'circle' && props.size != null) {
      style.width = style.height = props.size + 'px';
    }
    var lines = variant === 'text' ? props.lines || 1 : 1;
    if (lines > 1) {
      var out = [];
      for (var i = 0; i < lines; i++) {
        var last = i === lines - 1;
        out.push(
          h('span', {
            key: i,
            className: 'rr-skeleton rr-skeleton--text',
            style: Object.assign({}, style, last ? { width: '62%' } : null)
          })
        );
      }
      return h('span', { className: cx('rr-skeleton-stack', props.className), 'aria-hidden': 'true' }, out);
    }
    return h('span', {
      className: cx('rr-skeleton', 'rr-skeleton--' + variant, props.className),
      style: style,
      'aria-hidden': 'true'
    });
  }

  /* ---- EmptyState --------------------------------------------------- */

  function EmptyState(props) {
    props = props || {};
    return h('div', { className: cx('rr-empty', props.compact && 'rr-empty--compact', props.wash && 'rr-wash rr-grain', props.wash === 'brand' && 'rr-wash--brand', props.className) }, [
      props.icon ? h('span', { className: 'rr-empty__icon', key: 'i' }, props.icon) : null,
      h('h3', { className: 'rr-empty__title', key: 't' }, props.title),
      props.description ? h('p', { className: 'rr-empty__desc', key: 'd' }, props.description) : null,
      props.action ? h('div', { className: 'rr-empty__actions', key: 'a' }, props.action) : null
    ]);
  }

  /* ---- Accordion ---------------------------------------------------- */

  function Accordion(props) {
    props = props || {};
    var items = props.items || [];
    var multiple = !!props.multiple;
    var initial = props.defaultOpen != null ? [].concat(props.defaultOpen) : [];
    var state = React.useState(initial);
    var open = state[0];
    var setOpen = state[1];
    function toggle(id) {
      setOpen(function (cur) {
        var isOpen = cur.indexOf(id) !== -1;
        if (isOpen) return cur.filter(function (x) { return x !== id; });
        return multiple ? cur.concat([id]) : [id];
      });
    }
    return h(
      'div',
      { className: cx('rr-accordion', props.className) },
      items.map(function (item) {
        var isOpen = open.indexOf(item.id) !== -1;
        return h('div', { className: 'rr-accordion__item', key: item.id }, [
          h(
            'button',
            {
              type: 'button',
              key: 'h',
              className: 'rr-accordion__trigger',
              'aria-expanded': String(isOpen),
              'aria-controls': 'acc-panel-' + item.id,
              id: 'acc-trigger-' + item.id,
              disabled: item.disabled,
              onClick: function () { toggle(item.id); }
            },
            [
              h('span', { key: 't', className: 'rr-accordion__label' }, item.title),
              item.meta ? h('span', { key: 'm', className: 'rr-accordion__meta' }, item.meta) : null,
              h('span', { key: 'c', className: cx('rr-accordion__chevron', isOpen && 'rr-accordion__chevron--open') }, Icons.chevronDown({ width: 16, height: 16 }))
            ]
          ),
          h(
            'div',
            {
              key: 'p',
              id: 'acc-panel-' + item.id,
              role: 'region',
              'aria-labelledby': 'acc-trigger-' + item.id,
              className: 'rr-accordion__panel',
              hidden: !isOpen
            },
            item.content
          )
        ]);
      })
    );
  }

  /* ---- Stepper ------------------------------------------------------ */

  function Stepper(props) {
    props = props || {};
    var steps = props.steps || [];
    var current = props.current || 0;
    return h(
      'nav',
      { className: cx('rr-stepper', props.orientation === 'vertical' && 'rr-stepper--vertical', props.className), 'aria-label': props.label || 'Progress' },
      h(
        'ol',
        { className: 'rr-stepper__list' },
        steps.map(function (step, i) {
          var state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return h(
            'li',
            { key: step.id || i, className: 'rr-stepper__step rr-stepper__step--' + state, 'aria-current': state === 'current' ? 'step' : undefined },
            [
              h('span', { className: 'rr-stepper__marker', key: 'm' }, state === 'done' ? Icons.check({ width: 14, height: 14 }) : i + 1),
              h('span', { className: 'rr-stepper__text', key: 't' }, [
                h('span', { className: 'rr-stepper__label', key: 'l' }, step.label),
                step.description ? h('span', { className: 'rr-stepper__desc', key: 'd' }, step.description) : null
              ]),
              i < steps.length - 1 ? h('span', { className: 'rr-stepper__line', key: 'r', 'aria-hidden': 'true' }) : null
            ]
          );
        })
      )
    );
  }

  /* ---- Stat --------------------------------------------------------- */

  function sparkPath(values, w, hgt) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var stepX = values.length > 1 ? w / (values.length - 1) : 0;
    return values.map(function (v, i) {
      var x = i * stepX;
      var y = hgt - ((v - min) / span) * hgt;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
  }

  function Stat(props) {
    props = props || {};
    var trend = props.trend;
    var dir = props.delta == null ? null : props.delta > 0 ? 'up' : props.delta < 0 ? 'down' : 'flat';
    var good = props.upIsGood === false ? dir === 'down' : dir === 'up';
    var deltaClass = dir === 'flat' ? 'rr-stat__delta--flat' : good ? 'rr-stat__delta--good' : 'rr-stat__delta--bad';
    var spark = null;
    if (trend && trend.length > 1) {
      var w = 120;
      var hgt = 32;
      var pad = 3;
      var d = sparkPath(trend, w - pad * 2, hgt - pad * 2);
      var minV = Math.min.apply(null, trend);
      var maxV = Math.max.apply(null, trend);
      var lastY = hgt - pad - ((trend[trend.length - 1] - minV) / (maxV - minV || 1)) * (hgt - pad * 2);
      spark = h(
        'svg',
        { className: 'rr-stat__spark', width: w, height: hgt, viewBox: '0 0 ' + w + ' ' + hgt, 'aria-hidden': 'true', focusable: 'false' },
        [
          h('path', { key: 'p', d: d, transform: 'translate(' + pad + ',' + pad + ')', fill: 'none', strokeWidth: 2, strokeLinecap: 'butt', strokeLinejoin: 'miter', className: 'rr-stat__spark-line' }),
          h('circle', { key: 'c', cx: w - pad, cy: lastY, r: 4, className: 'rr-stat__spark-dot' })
        ]
      );
    }
    return h('div', { className: cx('rr-stat', props.wash && 'rr-wash rr-grain', props.wash === 'brand' && 'rr-wash--brand', props.className) }, [
      h('span', { className: 'rr-stat__label', key: 'l' }, props.label),
      h('span', { className: 'rr-stat__value', key: 'v' }, props.value),
      h('div', { className: 'rr-stat__foot', key: 'f' }, [
        dir
          ? h('span', { className: cx('rr-stat__delta', deltaClass), key: 'd' }, [
              h('span', { className: 'rr-stat__arrow', key: 'a', 'aria-hidden': 'true' }, dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'),
              h('span', { key: 't' }, (props.delta > 0 ? '+' : '') + props.delta + (props.deltaSuffix || '%')),
              props.period ? h('span', { className: 'rr-stat__period', key: 'p' }, props.period) : null
            ])
          : props.period
          ? h('span', { className: 'rr-stat__period', key: 'p' }, props.period)
          : null,
        spark
      ])
    ]);
  }

  /* ---- Menu --------------------------------------------------------- */

  function useDismiss(open, close) {
    var ref = React.useRef(null);
    React.useEffect(
      function () {
        if (!open) return undefined;
        function onDown(e) {
          if (ref.current && !ref.current.contains(e.target)) close();
        }
        function onKey(e) {
          if (e.key === 'Escape') close();
        }
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return function () {
          document.removeEventListener('mousedown', onDown);
          document.removeEventListener('keydown', onKey);
        };
      },
      [open, close]
    );
    return ref;
  }

  function Menu(props) {
    props = props || {};
    var items = props.items || [];
    var st = React.useState(!!props.defaultOpen);
    var open = st[0];
    var setOpen = st[1];
    var close = React.useCallback(function () { setOpen(false); }, []);
    var ref = useDismiss(open, close);
    var actionable = items.filter(function (i) { return i.type !== 'separator' && !i.disabled; });
    var iconOnly = !!props.icon && (props.label == null || props.label === '');
    /* The accessible name. A label that is a node (an icon and text) has no string to give,
       so it needs ariaLabel; a string label names itself. */
    var name = props.ariaLabel || (typeof props.label === 'string' ? props.label : undefined);
    function onKeyDown(e) {
      if (!open) return;
      var nodes = ref.current ? ref.current.querySelectorAll('[role="menuitem"]:not([disabled])') : [];
      if (!nodes.length) return;
      var idx = Array.prototype.indexOf.call(nodes, document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nodes[(idx + 1) % nodes.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nodes[(idx - 1 + nodes.length) % nodes.length].focus();
      }
    }
    return h('div', { className: cx('rr-menu', props.className), ref: ref, onKeyDown: onKeyDown }, [
      h(
        'button',
        {
          type: 'button',
          key: 'trigger',
          /* An icon with no visible label is an icon button: same sizes as IconButton, and its
             name comes from ariaLabel, because a node cannot be read out as a name. */
          className: iconOnly
            ? cx('rr-iconbtn', 'rr-iconbtn--' + (props.variant || 'ghost'), 'rr-iconbtn--' + (props.size || 'md'))
            : cx('rr-btn', 'rr-btn--' + (props.variant || 'secondary'), 'rr-btn--' + (props.size || 'md')),
          'aria-haspopup': 'menu',
          'aria-expanded': String(open),
          'aria-label': iconOnly || typeof props.label !== 'string' ? name : undefined,
          title: iconOnly ? name : undefined,
          onClick: function () { setOpen(!open); }
        },
        iconOnly
          ? h('span', { className: 'rr-btn__icon', style: { fontSize: props.size === 'sm' ? '14px' : '18px' } }, props.icon)
          : [props.icon ? h('span', { key: 'i', className: 'rr-btn__icon' }, props.icon) : null,
             h('span', { key: 'l' }, props.label), h('span', { key: 'c', className: 'rr-btn__icon' }, Icons.chevronDown({ width: 16, height: 16 }))]
      ),
      open
        ? h(
            'div',
            { key: 'list', className: cx('rr-menu__list', props.align === 'right' && 'rr-menu__list--right', props.placement === 'up' && 'rr-menu__list--up'), role: 'menu', 'aria-label': name },
            items.map(function (item, i) {
              if (item.type === 'separator') return h('div', { key: 's' + i, className: 'rr-menu__sep', role: 'separator' });
              return h(
                'button',
                {
                  type: 'button',
                  key: item.id || i,
                  role: 'menuitem',
                  className: cx('rr-menu__item', item.tone === 'danger' && 'rr-menu__item--danger'),
                  disabled: item.disabled,
                  onClick: function () {
                    if (item.onSelect) item.onSelect(item);
                    if (props.onSelect) props.onSelect(item);
                    setOpen(false);
                  }
                },
                [
                  item.icon ? h('span', { key: 'i', className: 'rr-menu__icon' }, item.icon) : null,
                  h('span', { key: 'l', className: 'rr-menu__label' }, item.label),
                  item.shortcut ? h('span', { key: 'k', className: 'rr-menu__shortcut' }, item.shortcut) : null
                ]
              );
            })
          )
        : null,
      actionable.length === 0 && open ? h('span', { key: 'empty' }) : null
    ]);
  }

  /* ---- Combobox ----------------------------------------------------- */

  function Combobox(props) {
    props = props || {};
    var options = props.options || [];
    var autoId = useStableId('rr-combo');
    var id = props.id || autoId;
    var st = React.useState('');
    var query = st[0];
    var setQuery = st[1];
    var so = React.useState(!!props.defaultOpen);
    var open = so[0];
    var setOpen = so[1];
    var sa = React.useState(0);
    var active = sa[0];
    var setActive = sa[1];
    var sv = React.useState(props.defaultValue || null);
    var value = props.value !== undefined ? props.value : sv[0];
    var setValue = sv[1];
    var close = React.useCallback(function () { setOpen(false); }, []);
    var ref = useDismiss(open, close);

    var norm = options.map(function (o) { return typeof o === 'string' ? { value: o, label: o } : o; });
    var selected = norm.filter(function (o) { return o.value === value; })[0];
    var text = open ? query : selected ? selected.label : '';
    var matches = norm.filter(function (o) {
      if (props.filter === false) return true;   /* the consumer filtered already (a server search) */
      return !open || !query || o.label.toLowerCase().indexOf(query.toLowerCase()) !== -1;
    });

    function commit(opt) {
      if (!opt || opt.disabled) return;
      if (props.value === undefined) setValue(opt.value);
      if (props.onChange) props.onChange(opt.value, opt);
      setQuery('');
      setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) { setOpen(true); setActive(0); return; }
        var next = e.key === 'ArrowDown' ? active + 1 : active - 1;
        if (next < 0) next = matches.length - 1;
        if (next >= matches.length) next = 0;
        setActive(next);
      } else if (e.key === 'Enter') {
        if (open) { e.preventDefault(); commit(matches[active]); }
      } else if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }

    var control = h('div', { className: 'rr-combo', ref: ref }, [
      h('div', { className: 'rr-select-wrap', key: 'w' }, [
        h('input', {
          key: 'i',
          id: id,
          className: cx('rr-control', 'rr-control--' + (props.size || 'md'), 'rr-combo__input'),
          role: 'combobox',
          autoComplete: 'off',
          'aria-expanded': String(open),
          'aria-controls': id + '-list',
          'aria-autocomplete': 'list',
          'aria-activedescendant': open && matches[active] ? id + '-opt-' + active : undefined,
          'aria-invalid': props.error ? 'true' : undefined,
          'aria-describedby': props.error || props.hint ? id + '-msg' : undefined,
          placeholder: props.placeholder || 'Search',
          disabled: props.disabled,
          value: text,
          onChange: function (e) { setQuery(e.target.value); setOpen(true); setActive(0); },
          onFocus: function () { setOpen(true); },
          onKeyDown: onKeyDown
        }),
        h('span', { className: 'rr-select-wrap__caret', key: 'c' }, Icons.search({ width: '100%', height: '100%' }))
      ]),
      open
        ? h(
            'ul',
            { key: 'l', className: 'rr-combo__list', role: 'listbox', id: id + '-list' },
            matches.length
              ? matches.map(function (o, i) {
                  return h(
                    'li',
                    {
                      key: o.value,
                      id: id + '-opt-' + i,
                      role: 'option',
                      'aria-selected': String(o.value === value),
                      'aria-disabled': o.disabled ? 'true' : undefined,
                      className: cx('rr-combo__option', i === active && 'rr-combo__option--active', o.value === value && 'rr-combo__option--selected'),
                      onMouseEnter: function () { setActive(i); },
                      onMouseDown: function (e) { e.preventDefault(); commit(o); }
                    },
                    [
                      h('span', { key: 'l' }, o.label),
                      o.description ? h('span', { key: 'd', className: 'rr-combo__option-desc' }, o.description) : null,
                      o.value === value ? h('span', { key: 'c', className: 'rr-combo__check' }, Icons.check({ width: 14, height: 14 })) : null
                    ]
                  );
                })
              : h('li', { className: 'rr-combo__empty', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false' }, props.emptyText || 'No matches')
          )
        : null
    ]);
    return Field(Object.assign({}, props, { id: id }), control);
  }

  /* ---- DatePicker --------------------------------------------------- */

  var DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function ymd(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    var parts = String(v).split('-');
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /* ---- Dates ---------------------------------------------------------
     Two components, because there are two jobs. A date somebody already
     knows - a birthday, the day a contract was signed - is typed, and three
     text fields beat a calendar for it every time: nobody scrolls back forty
     years. A date somebody is choosing is picked, and then a calendar earns
     its place because the day of the week matters. The calendar is never the
     only way in, which is the one unqualified rule GOV.UK publishes on dates. */

  function monthNames(locale, style) {
    var out = [];
    try {
      var f = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
      for (var m = 0; m < 12; m++) out.push(f.format(new Date(Date.UTC(2020, m, 15))));
    } catch (e) {
      out = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      if (style === 'short') out = out.map(function (x) { return x.slice(0, 3); });
    }
    return out;
  }
  function weekdayNames(locale, style, weekStart) {
    var out = [];
    try {
      var f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
      /* 2021-08-01 was a Sunday */
      for (var i = 0; i < 7; i++) out.push(f.format(new Date(Date.UTC(2021, 7, 1 + ((weekStart + i) % 7)))));
    } catch (e) { out = ['S','M','T','W','T','F','S']; }
    return out;
  }
  /* CLDR puts the United States, India and Korea all on Sunday. A Monday-first
     calendar is wrong in all three of this company's markets, which is what the
     system shipped until a real screen was built on it. */
  var WEEK_START = { 'en-GB': 1, 'de': 1, 'fr': 1, 'ko': 0, 'en-US': 0, 'en-IN': 0, 'hi': 0 };
  function weekStartFor(locale) {
    if (WEEK_START[locale] != null) return WEEK_START[locale];
    var base = String(locale || 'en').split('-')[0];
    return WEEK_START[base] != null ? WEEK_START[base] : 0;
  }

  /* A month typed as a word. GOV.UK found hundreds of people writing "jan" into
     a field that only took digits, and getting an error for being right. */
  function parseMonth(text, locale) {
    var t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    if (/^\d{1,2}$/.test(t)) { var n = parseInt(t, 10); return n >= 1 && n <= 12 ? n : null; }
    var long = monthNames(locale, 'long'), short = monthNames(locale, 'short');
    for (var i = 0; i < 12; i++) {
      var L = long[i].toLowerCase(), S = short[i].toLowerCase().replace('.', '');
      if (L === t || S === t || L.indexOf(t) === 0) return i + 1;
    }
    return null;
  }

  /* The ISO value three fields add up to, or null. Exported because a caller
     holding a seeded value has no change event to have learned it from. */
  function dateParts(v, locale) {
    v = v || {};
    var m = parseMonth(v.month, locale || docLocale());
    var d = parseInt(v.day, 10), y = parseInt(v.year, 10);
    if (!m || !d || !y || d < 1 || d > 31) return null;
    if (d > new Date(y, m, 0).getDate()) return null;
    return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function DateInput(props) {
    props = props || {};
    var autoId = useStableId('rr-dateinput');
    var id = props.id || autoId;
    var locale = props.locale || docLocale();
    var v = props.value || {};
    function set(k, val) {
      var next = { day: v.day, month: v.month, year: v.year };
      next[k] = val;
      next.iso = dateParts(next, locale);
      if (props.onChange) props.onChange(next, k);
    }
    /* text with a numeric keypad, never type=number: Chrome silently drops letters
       from it, the scroll wheel changes the value, and a screen reader announces an
       unlabeled spin button. It would also refuse the month names above. */
    function part(k, label, width, auto) {
      var fid = id + '-' + k;
      return h('div', { className: 'rr-dateinput__part rr-dateinput__part--' + width, key: k }, [
        h('label', { className: 'rr-dateinput__label', htmlFor: fid, key: 'l' }, label),
        h('input', {
          key: 'i', id: fid, type: 'text', inputMode: k === 'month' ? 'text' : 'numeric',
          className: 'rr-control rr-control--md', autoComplete: props.birthday ? auto : undefined,
          spellCheck: 'false',
          value: v[k] == null ? '' : v[k],
          'aria-describedby': props.error || props.hint ? id + '-msg' : undefined,
          'aria-invalid': props.error ? 'true' : undefined,
          onChange: function (e) { set(k, e.target.value); }
        })
      ]);
    }
    var order = (props.order || 'dmy').split('');
    var parts = { d: part('day', props.dayLabel || 'Day', 'two', 'bday-day'),
                  m: part('month', props.monthLabel || 'Month', 'three', 'bday-month'),
                  y: part('year', props.yearLabel || 'Year', 'four', 'bday-year') };
    return h('fieldset', { className: cx('rr-dateinput', props.className) }, [
      h('legend', { className: 'rr-dateinput__legend', key: 'g' }, [
        props.label || 'Date',
        props.required ? h('span', { className: 'rr-field__req', key: 'r', 'aria-hidden': 'true' }, '*') : null
      ]),
      props.hint && !props.error
        ? h('p', { className: 'rr-field__hint', id: id + '-msg', key: 'h' }, props.hint) : null,
      props.error
        ? h('p', { className: 'rr-field__error', id: id + '-msg', key: 'e' }, props.error) : null,
      h('div', { className: 'rr-dateinput__row', key: 'r' }, order.map(function (k) { return parts[k]; }))
    ]);
  }

  function DatePicker(props) {
    props = props || {};
    var autoId = useStableId('rr-date');
    var id = props.id || autoId;
    var locale = props.locale || docLocale();
    var sv = React.useState(props.defaultValue || null);
    var value = props.value !== undefined ? props.value : sv[0];
    var setValue = sv[1];
    var selected = parseDate(value);
    var today = new Date();
    var sm = React.useState(selected || today);
    var month = sm[0], setMonth = sm[1];
    var so = React.useState(!!props.defaultOpen);
    var open = so[0], setOpen = so[1];
    var close = React.useCallback(function () { setOpen(false); }, []);
    var ref = useDismiss(open, close);

    var weekStart = props.weekStart != null ? props.weekStart : weekStartFor(locale);
    var first = new Date(month.getFullYear(), month.getMonth(), 1);
    var startPad = (first.getDay() - weekStart + 7) % 7;
    var daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    var cells = [];
    var i;
    for (i = 0; i < startPad; i++) cells.push(null);
    for (i = 1; i <= daysInMonth; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));

    function commit(d) {
      if (props.value === undefined) setValue(ymd(d));
      if (props.onChange) props.onChange(ymd(d), d);
    }
    function pick(d) { commit(d); setOpen(false); }
    function shiftMonth(n) { setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); }

    function fmt(d) {
      if (props.format) return props.format(d);
      try { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d); }
      catch (e) { return ymd(d); }
    }
    var typed = React.useState(null);
    var draft = typed[0], setDraft = typed[1];
    var shown = draft != null ? draft : (selected ? fmt(selected) : '');

    function acceptTyped(text) {
      var t = String(text || '').trim();
      if (!t) { if (props.value === undefined) setValue(null); if (props.onChange) props.onChange(null, null); setDraft(null); return; }
      var d = parseDate(t);
      if (!d) {
        /* "4 Mar 2026", "Mar 4 2026", "2026. 3. 4." - the forms people type */
        var nums = t.match(/\d+/g) || [];
        var mo = parseMonth((t.match(/[A-Za-zÀ-ɏ가-힣]+/) || [])[0], locale);
        if (nums.length >= 3) d = new Date(+nums[0] > 31 ? +nums[0] : +nums[2], (mo || +nums[1]) - 1, +nums[0] > 31 ? +nums[2] : +nums[0]);
        else if (mo && nums.length === 2) d = new Date(+nums[1] > 31 ? +nums[1] : +nums[0], mo - 1, +nums[1] > 31 ? +nums[0] : +nums[1]);
      }
      if (d && !isNaN(d.getTime())) { commit(d); setMonth(d); setDraft(null); }
      else setDraft(t);
    }

    var control = h('div', { className: cx('rr-datepicker', props.className), ref: ref }, [
      h('div', { className: 'rr-datepicker__field', key: 'f' }, [
        /* typed first. A calendar that is the only way in locks out anyone whose
           JavaScript failed, who is using a screen reader, or who simply knows
           the date and would rather write it than hunt for it. */
        h('input', {
          key: 'in', id: id, type: 'text', inputMode: 'numeric', spellCheck: 'false',
          className: cx('rr-control', 'rr-control--' + (props.size || 'md'), 'rr-datepicker__input'),
          placeholder: props.placeholder || fmt(new Date(2026, 2, 4)),
          value: shown,
          disabled: props.disabled,
          'aria-invalid': props.error ? 'true' : undefined,
          'aria-describedby': props.error || props.hint ? id + '-msg' : undefined,
          onChange: function (e) { setDraft(e.target.value); },
          onBlur: function (e) { acceptTyped(e.target.value); }
        }),
        h(IconButton, {
          key: 'b', label: props.calendarLabel || 'Choose a date from a calendar',
          size: 'sm', className: 'rr-datepicker__open', disabled: props.disabled,
          'aria-expanded': String(open), 'aria-haspopup': 'dialog',
          onClick: function () { setOpen(!open); }
        }, Icons.calendar({ width: '100%', height: '100%' }))
      ]),
      open
        ? h('div', { key: 'cal', className: 'rr-cal', role: 'dialog', 'aria-label': props.calendarLabel || 'Choose a date' }, [
            h('div', { className: 'rr-cal__head', key: 'h' }, [
              h(IconButton, { key: 'p', label: props.prevLabel || 'Previous month', size: 'sm', onClick: function () { shiftMonth(-1); } }, Icons.chevronLeft({ width: '100%', height: '100%' })),
              h('span', { key: 'm', className: 'rr-cal__month', 'aria-live': 'polite' },
                (function () {
                  try { return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month); }
                  catch (e) { return month.getFullYear() + '-' + (month.getMonth() + 1); }
                })()),
              h(IconButton, { key: 'n', label: props.nextLabel || 'Next month', size: 'sm', onClick: function () { shiftMonth(1); } }, Icons.chevronRight({ width: '100%', height: '100%' }))
            ]),
            h('div', { className: 'rr-cal__days', key: 'w' },
              weekdayNames(locale, 'narrow', weekStart).map(function (d, k) {
                return h('span', { key: k, 'aria-hidden': 'true' }, d);
              })),
            h('div', { className: 'rr-cal__grid', key: 'g', role: 'grid' },
              cells.map(function (d, k) {
                if (!d) return h('span', { key: 'p' + k, className: 'rr-cal__pad' });
                var isSel = selected && ymd(selected) === ymd(d);
                var isToday = ymd(today) === ymd(d);
                return h('button', {
                  key: ymd(d), type: 'button',
                  className: cx('rr-cal__day', isSel && 'rr-cal__day--on', isToday && 'rr-cal__day--today'),
                  'aria-pressed': isSel ? 'true' : undefined,
                  'aria-label': fmt(d),
                  onClick: function () { pick(d); }
                }, d.getDate());
              })),
            h('div', { className: 'rr-cal__foot', key: 'f' }, [
              h(Button, { key: 't', size: 'sm', variant: 'ghost',
                onClick: function () { pick(new Date()); } }, props.todayLabel || 'Today'),
              h(Button, { key: 'c', size: 'sm', variant: 'ghost', onClick: function () {
                if (props.value === undefined) setValue(null);
                if (props.onChange) props.onChange(null, null);
                setDraft(null); setOpen(false);
              } }, props.clearLabel || 'Clear')
            ])
          ])
        : null
    ]);
    return Field(Object.assign({}, props, { id: id }), control);
  }
  /* ---- Drawer ------------------------------------------------------- */

  function Drawer(props) {
    props = props || {};
    if (props.open === false) return null;
    var titleId = nextId('rr-drawer-title');
    var side = props.side || 'right';
    return h(
      'div',
      {
        className: cx('rr-drawer-scrim', props.className),
        onClick: function (e) {
          if (e.target === e.currentTarget && props.onClose) props.onClose();
        }
      },
      h(
        'div',
        {
          className: cx('rr-drawer', 'rr-drawer--' + side),
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
          style: props.width ? { width: props.width } : null
        },
        [
          h('div', { className: 'rr-drawer__head', key: 'h' }, [
            h('div', { key: 't', className: 'rr-drawer__titles' }, [
              h('h2', { className: 'rr-drawer__title', id: titleId, key: 'a' }, props.title),
              props.description ? h('p', { className: 'rr-drawer__desc', key: 'b' }, props.description) : null
            ]),
            props.onClose
              ? h(IconButton, { key: 'c', label: props.closeLabel || 'Close', size: 'sm', onClick: props.onClose }, Icons.close({ width: '100%', height: '100%' }))
              : null
          ]),
          h('div', { className: 'rr-drawer__body', key: 'b' }, props.children),
          props.footer ? h('div', { className: 'rr-drawer__footer', key: 'f' }, props.footer) : null
        ]
      )
    );
  }

  /* ---- FileUpload --------------------------------------------------- */

  function formatBytes(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function FileUpload(props) {
    props = props || {};
    var id = React.useRef(nextId('rr-upload')).current;
    var sd = React.useState(false);
    var over = sd[0];
    var setOver = sd[1];
    var inputRef = React.useRef(null);
    var files = props.files || [];
    function emit(list) {
      if (props.onFiles) props.onFiles(Array.prototype.slice.call(list));
    }
    return h('div', { className: cx('rr-upload', props.className) }, [
      h(
        'div',
        {
          key: 'zone',
          className: cx('rr-upload__zone', over && 'rr-upload__zone--over', props.invalid && 'rr-upload__zone--invalid'),
          onDragOver: function (e) { e.preventDefault(); setOver(true); },
          onDragLeave: function () { setOver(false); },
          onDrop: function (e) { e.preventDefault(); setOver(false); emit(e.dataTransfer.files); }
        },
        [
          h('input', {
            key: 'input',
            ref: inputRef,
            id: id,
            type: 'file',
            className: 'rr-upload__input',
            multiple: props.multiple,
            accept: props.accept,
            onChange: function (e) { emit(e.target.files); }
          }),
          h('span', { key: 'i', className: 'rr-upload__icon' }, Icons.plus({ width: '100%', height: '100%' })),
          h('label', { key: 't', className: 'rr-upload__title', htmlFor: id }, props.title || 'Drop files here'),
          h('span', { key: 'h', className: 'rr-upload__hint' }, props.hint || 'or browse from your computer'),
          props.accept || props.maxLabel
            ? h('span', { key: 'a', className: 'rr-upload__meta' }, [props.accept, props.maxLabel].filter(Boolean).join(' · '))
            : null
        ]
      ),
      files.length
        ? h(
            'ul',
            { key: 'files', className: 'rr-upload__files' },
            files.map(function (f, i) {
              return h('li', { key: f.name + i, className: 'rr-upload__file' }, [
                h('span', { key: 'n', className: 'rr-upload__file-name' }, f.name),
                h('span', { key: 's', className: 'rr-upload__file-size' }, formatBytes(f.size)),
                props.onRemove
                  ? h(IconButton, { key: 'r', label: 'Remove ' + f.name, size: 'sm', onClick: function () { props.onRemove(f, i); } }, Icons.close({ width: '100%', height: '100%' }))
                  : null
              ]);
            })
          )
        : null
    ]);
  }

  /* ---- Message ------------------------------------------------------ */

  function Message(props) {
    props = props || {};
    var role = props.role || 'assistant';
    return h('div', { className: cx('rr-msg', 'rr-msg--' + role, props.className) }, [
      h('span', { className: 'rr-msg__mark', key: 'm', 'aria-hidden': 'true' }, props.mark || initials(props.author || (role === 'user' ? 'You' : 'Redrob'))),
      h('div', { className: 'rr-msg__body', key: 'b' }, [
        h('span', { className: 'rr-msg__author', key: 'a' }, props.author || (role === 'user' ? 'You' : 'Redrob')),
        h('div', { className: 'rr-msg__bubble', key: 'c' }, h('div', { className: 'rr-msg__content' }, props.children)),
        props.footer ? h('div', { className: 'rr-msg__footer', key: 'f' }, props.footer) : null
      ])
    ]);
  }

  /* ---- Streaming ---------------------------------------------------- */

  function Streaming(props) {
    props = props || {};
    if (props.state === 'thinking') {
      return h('span', { className: cx('rr-streaming__status', props.className), role: 'status', 'aria-live': 'polite' }, [
        h('span', { className: 'rr-spinner', key: 's', style: { fontSize: '13px' } }),
        h('span', { key: 't' }, props.label || 'Thinking'),
        props.onStop
          ? h(Button, { key: 'b', size: 'sm', variant: 'secondary', className: 'rr-streaming__stop', onClick: props.onStop }, props.stopLabel || 'Stop')
          : null
      ]);
    }
    return h('span', { className: cx('rr-streaming', props.className) }, [
      /* label is the line that says what it is doing; children is the text it is
         producing. A caller passing only label used to get a bare Stop button. */
      props.label ? h('span', { className: 'rr-streaming__label', key: 'l' }, props.label) : null,
      h('span', { key: 't' }, props.children),
      props.state !== 'done' ? h('span', { className: 'rr-streaming__caret', key: 'c', 'aria-hidden': 'true' }) : null,
      props.state !== 'done' && props.onStop
        ? h(Button, { key: 'b', size: 'sm', variant: 'secondary', className: 'rr-streaming__stop', onClick: props.onStop }, props.stopLabel || 'Stop')
        : null
    ]);
  }

  /* ---- Citation ----------------------------------------------------- */

  function Citation(props) {
    props = props || {};
    var label = props.source || props.title;
    /* No href, no link: a citation that jumps to the top of the page is worse than none. */
    return h(
      props.href ? 'a' : 'span',
      {
        className: cx('rr-cite', !props.href && 'rr-cite--static', props.className),
        href: props.href || undefined,
        target: props.href ? '_blank' : undefined,
        rel: props.href ? 'noreferrer' : undefined,
        title: props.title,
        'aria-label': 'Source ' + (props.index != null ? props.index + ': ' : '') + (props.title || label || '')
      },
      [
        props.index != null ? h('span', { className: 'rr-cite__index', key: 'i' }, props.index) : null,
        label ? h('span', { className: 'rr-cite__source', key: 's' }, label) : null
      ]
    );
  }

  /* ---- AgentAction ----------------------------------------------------- */

  var TOOL_STATE_LABEL = { running: 'Running', done: 'Done', error: 'Failed' };

  function AgentAction(props) {
    props = props || {};
    var state = props.state || 'done';
    var st = React.useState(!!props.defaultOpen);
    var open = st[0];
    var setOpen = st[1];
    var id = React.useRef(nextId('rr-action')).current;
    var stateIcon = state === 'running' ? null : state === 'error' ? Icons.danger : Icons.success;
    return h('div', { className: cx('rr-action', props.className) }, [
      h(
        'button',
        {
          type: 'button',
          key: 'h',
          className: 'rr-action__head',
          'aria-expanded': String(open),
          'aria-controls': id,
          onClick: function () { setOpen(!open); }
        },
        [
          h('span', { className: 'rr-action__icon', key: 'i' }, Icons.tool({ width: '100%', height: '100%' })),
          h('span', { className: 'rr-action__name', key: 'n' }, props.name),
          h('span', { className: 'rr-action__summary', key: 's' }, props.summary),
          h('span', { className: cx('rr-action__state', 'rr-action__state--' + state), key: 't' }, [
            state === 'running' ? h('span', { className: 'rr-spinner', key: 'p', style: { fontSize: '12px' } }) : h('span', { key: 'p', style: { display: 'inline-flex', width: 14, height: 14 } }, stateIcon({ width: '100%', height: '100%' })),
            h('span', { key: 'l' }, props.stateLabel || TOOL_STATE_LABEL[state]),
            props.duration ? h('span', { key: 'd', style: { fontWeight: 400, color: 'var(--ink-muted)' } }, props.duration) : null
          ]),
          h('span', { className: cx('rr-accordion__chevron', open && 'rr-accordion__chevron--open'), key: 'c' }, Icons.chevronDown({ width: 14, height: 14 }))
        ]
      ),
      h('div', { className: 'rr-action__body', id: id, key: 'b', hidden: !open }, props.children)
    ]);
  }

  /* ---- Confidence --------------------------------------------------- */

  var CONF_LEVELS = { low: 1, medium: 2, high: 3 };

  function Confidence(props) {
    props = props || {};
    var level = props.level || 'medium';
    var filled = CONF_LEVELS[level] || 2;
    var bars = [];
    for (var i = 0; i < 3; i++) {
      bars.push(h('span', { key: i, className: cx('rr-confidence__bar', i < filled && 'rr-confidence__bar--on') }));
    }
    return h('span', { className: cx('rr-confidence', 'rr-confidence--' + level, props.className) }, [
      h('span', { className: 'rr-confidence__bars', key: 'b', 'aria-hidden': 'true' }, bars),
      /* A passed label is used as written (it may be Korean); only the default is composed. */
      h('span', { className: 'rr-confidence__label', key: 'l' }, props.label || (level + ' confidence')),
      props.note ? h('span', { className: 'rr-confidence__note', key: 'n' }, props.note) : null
    ]);
  }

  /* ---- ApprovalStep ----------------------------------------------- */

  function ApprovalStep(props) {
    props = props || {};
    return h('div', { className: cx('rr-approval', props.className), role: 'group', 'aria-label': props.title }, [
      h('div', { className: 'rr-approval__head', key: 'h' }, [
        h('span', { className: 'rr-approval__icon', key: 'i' }, Icons.shield({ width: '100%', height: '100%' })),
        h('div', { key: 'b', style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
          h('span', { className: 'rr-approval__title', key: 't' }, props.title),
          props.description ? h('span', { className: 'rr-approval__what', key: 'w' }, props.description) : null
        ])
      ]),
      props.detail ? h('div', { className: 'rr-approval__detail', key: 'd' }, props.detail) : null,
      h('div', { className: 'rr-approval__actions', key: 'a' }, [
        h(Button, { key: 'approve', size: 'sm', onClick: props.onApprove }, props.approveLabel || 'Approve'),
        h(Button, { key: 'reject', size: 'sm', variant: 'secondary', onClick: props.onReject }, props.rejectLabel || 'Reject'),
        props.onAlways
          ? h(Button, { key: 'always', size: 'sm', variant: 'ghost', onClick: props.onAlways }, props.alwaysLabel || 'Always allow this')
          : null
      ])
    ]);
  }

  /* ---- AgentTimeline ------------------------------------------------- */

  function AgentTimeline(props) {
    props = props || {};
    var steps = props.steps || [];
    return h(
      'div',
      { className: cx('rr-timeline', props.className) },
      h(
        'ol',
        { className: 'rr-timeline__list', 'aria-label': props.label || 'Agent steps' },
        steps.map(function (step, i) {
          var state = step.state || 'todo';
          return h('li', { key: step.id || i, className: 'rr-timeline__step rr-timeline__step--' + state, 'aria-current': state === 'active' ? 'step' : undefined }, [
            h('span', { className: 'rr-timeline__rail', key: 'r', 'aria-hidden': 'true' }, [
              h('span', { className: 'rr-timeline__dot', key: 'd' }),
              i < steps.length - 1 ? h('span', { className: 'rr-timeline__line', key: 'l' }) : null
            ]),
            h('div', { className: 'rr-timeline__body', key: 'b' }, [
              h('span', { className: 'rr-timeline__label', key: 'l' }, [
                step.label,
                step.meta ? h('span', { className: 'rr-timeline__meta', key: 'm', style: { marginLeft: '8px', fontWeight: 400 } }, step.meta) : null
              ]),
              step.detail ? h('span', { className: 'rr-timeline__detail', key: 'd' }, step.detail) : null,
              step.children ? h('div', { key: 'c', style: { marginTop: '4px' } }, step.children) : null
            ])
          ]);
        })
      )
    );
  }

  /* ---- PromptSuggestions --------------------------------------------- */

  function PromptSuggestions(props) {
    props = props || {};
    var items = props.items || [];
    return h(
      'div',
      { className: cx('rr-prompts', props.className), role: 'list', 'aria-label': props.label || 'Suggested prompts' },
      items.map(function (item, i) {
        var text = typeof item === 'string' ? item : item.label;
        /* the list item wraps the button, so it is still announced as a button */
        return h('span', { role: 'listitem', key: i, className: 'rr-prompts__item' }, h(
          'button',
          {
            type: 'button',
            className: 'rr-prompt',
            onClick: function () { if (props.onSelect) props.onSelect(typeof item === 'string' ? item : item.value || item.label, item); }
          },
          [
            h('span', { className: 'rr-prompt__icon', key: 'i' }, Icons.sparkle({ width: '100%', height: '100%' })),
            h('span', { key: 't' }, text)
          ]
        ));
      })
    );
  }

  /* ---- ModelPicker ----------------------------------------------------- */

  /* The model control in the composer. A person who does not know one model
     from another says what they do and what they want done; the picker answers
     with the top five combinations of model, effort and harness for exactly
     that, from the Redrob Leaderboard, each with a reason and a monthly price in
     the currency of the page's language. The ranking and prices are data. */

  /* The page language picks the currency; the rates come with the data. */
  var LANG_CURRENCY = { ko: 'KRW', hi: 'INR', 'en-IN': 'INR', bn: 'INR', ja: 'JPY', 'zh-Hans': 'CNY', es: 'EUR', fr: 'EUR', pt: 'BRL' };
  var CURRENCY_STEP = { KRW: 100, INR: 10, JPY: 10 };

  function currencyFor(locale, map) {
    map = map || LANG_CURRENCY;
    if (!locale) return 'USD';
    return map[locale] || map[String(locale).split('-')[0]] || 'USD';
  }

  function EffortMeter(props) {
    var e = props.effort || {};
    var of = e.of || 3;
    var bars = [];
    for (var i = 1; i <= of; i++) bars.push(h('span', { key: i, className: i <= (e.level || 0) ? 'is-on' : null }));
    return h('span', { className: 'rr-model__effort', title: e.label ? e.label + ', ' + e.level + ' of ' + of + ' on this maker’s scale' : null }, [
      h('span', { key: 'm', className: 'rr-model__steps', 'aria-hidden': 'true' }, bars),
      h('span', { key: 'l' }, e.label + ' effort')
    ]);
  }

  function effortOrdinal(n) { var t = n % 100, u = n % 10; return n + (t > 10 && t < 14 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); }

  /* Effort, set by the person on one pick: the maker's own scale as a radio group, the level it
     was ranked at marked, and one line on the level chosen: its place on this task, or that it
     has none, and what a month costs against the ranked price. Shared by ModelPicker and ModelGuide.
     props: pick, place (the pick's place on the task), chosen (a level number, null for ranked),
     onSelect(level), price(monthly), per, title, labels { effort, ranked, reset }, note(ctx), className. */
  function EffortTune(props) {
    var k = props.pick || {};
    var levels = k.efforts || [];
    var rankedLevel = (k.effort || {}).level;
    var ranked = levels.filter(function (l) { return l.level === rankedLevel; })[0] || k.effort || {};
    var chosen = props.chosen != null ? levels.filter(function (l) { return l.level === props.chosen; })[0] : null;
    var custom = !!chosen && chosen.level !== rankedLevel;
    var eff = custom ? chosen : ranked;
    var L = props.labels || {};
    var id = useStableId('rr-effort');
    var per = props.per || '/mo';
    function note() {
      var l = eff;
      var money = l.monthly == null ? null : props.price(l.monthly);
      var times = custom && ranked.monthly ? l.monthly / ranked.monthly : null;
      var ctx = { level: l, ranked: ranked, custom: custom, place: custom ? l.place : props.place, times: times, price: money, per: per };
      if (props.note) return props.note(ctx);
      if (!custom) return [l.label + ' is the effort it was ranked at' + (props.place ? ', ' + effortOrdinal(props.place) + ' for this task' : '') + '. ', money, money ? per + '.' : null];
      var rel = times == null ? '' : times >= 1.05 ? ', ' + (Math.round(times * 10) / 10) + ' times the ranked price'
        : times <= 0.95 ? ', ' + Math.round((1 - times) * 100) + '% less than the ranked price' : '';
      return [l.place ? l.label + ' is ' + effortOrdinal(l.place) + ' for this task. ' : l.label + ' is not ranked for this task, so there is no score to go on. ',
        money ? 'About ' : null, money, money ? per + rel + '.' : null];
    }
    return h('div', { className: cx('rr-effort', props.className) }, [
      h('div', { key: 'h', className: 'rr-effort__head' }, [
        h('p', { key: 't', id: id, className: 'rr-effort__title' }, [(L.effort || 'Effort') + ' ',
          props.title ? h('span', { key: 's' }, props.title) : null]),
        custom ? h('button', { key: 'r', type: 'button', className: 'rr-model__back', onClick: function () { props.onSelect(ranked); } }, (L.reset || 'Back to') + ' ' + ranked.label) : null
      ]),
      h('div', { key: 'l', className: 'rr-effort__levels', role: 'radiogroup', 'aria-labelledby': id,
        onKeyDown: function (e) {
          var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          var i = 0;
          levels.forEach(function (l, j) { if (l.level === eff.level) i = j; });
          var j = Math.max(0, Math.min(levels.length - 1, i + d));
          props.onSelect(levels[j]);
          var el = e.currentTarget.children[j]; if (el) el.focus();
        } },
        levels.map(function (l) {
          var on = l.level === eff.level;
          return h('button', { key: l.level, type: 'button', role: 'radio', 'aria-checked': String(on), tabIndex: on ? 0 : -1,
            className: cx('rr-effort__level', on && 'is-on'), onClick: function () { props.onSelect(l); } }, [
            h('span', { key: 'l' }, l.label),
            l.level === rankedLevel ? h('span', { key: 'r', className: 'rr-effort__mark' }, L.ranked || 'Ranked') : null
          ]);
        })),
      h('p', { key: 'n', className: 'rr-effort__note', 'aria-live': 'polite' }, note())
    ]);
  }

  function ModelPicker(props) {
    props = props || {};
    var professions = props.professions || [];
    var limit = props.limit || 5;
    var locale = props.locale || docLocale();
    var base = props.currency || 'USD';
    var rates = props.rates || {};
    var shown = currencyFor(props.locale || (typeof document !== 'undefined' && document.documentElement.lang) || locale, props.currencyByLang);
    if (shown !== base && rates[shown] == null) shown = base;
    var firstProf = professions.filter(function (p) { return !p.disabled; })[0] || {};
    /* Redrob Auto (props.auto) and the product it sits in (props.here). */
    var auto = !!props.auto;
    var here = props.here;

    var so = React.useState(!!props.defaultOpen);
    var open = so[0];
    var setOpen = so[1];
    var sp = React.useState(props.defaultProfession || firstProf.id);
    var prof = professions.filter(function (p) { return p.id === sp[0]; })[0] || firstProf;
    var tasks = prof.tasks || [];
    var stk = React.useState(props.defaultTask || (auto ? 'auto' : tasks[0] && tasks[0].id));
    var taskMode = props.task !== undefined ? props.task : stk[0];
    var matchedId = taskMode === 'auto' ? (props.matchedTask || (tasks[0] && tasks[0].id)) : taskMode;
    var task = tasks.filter(function (t) { return t.id === matchedId; })[0] || tasks[0] || {};
    var picks = (task.picks || []).slice(0, limit);
    function away(k) { return !!here && k.harness !== here; }
    var autoPick = picks.filter(function (k) { return !away(k); })[0];

    var sv = React.useState(props.defaultValue !== undefined ? props.defaultValue : (auto ? null : picks[0] && picks[0].id));
    var value = props.value !== undefined ? props.value : sv[0];
    /* The effort the person sets on a pinned model: a level on its own scale, or null for the ranked one. */
    var se = React.useState(props.defaultEffort != null ? props.defaultEffort : null);
    var effortSet = props.effort !== undefined ? props.effort : se[0];

    var all = [];
    professions.forEach(function (p) {
      (p.tasks || []).forEach(function (t) { (t.picks || []).forEach(function (k) { all.push(k); }); });
    });
    var current = all.filter(function (k) { return k.id === value; })[0] || (auto ? null : picks[0]) || null;
    var isAuto = auto && !current;
    var cur = current || {};
    var tunable = !!current && !!cur.efforts && cur.efforts.length > 1 && !away(cur);
    var chosenEffort = tunable && effortSet != null ? cur.efforts.filter(function (l) { return l.level === effortSet; })[0] : null;
    var custom = !!chosenEffort && chosenEffort.level !== (cur.effort || {}).level;
    var eff = custom ? chosenEffort : (cur.effort || null);

    var close = React.useCallback(function () { setOpen(false); }, []);
    var ref = useDismiss(open, close);
    var titleId = React.useRef(nextId('rr-model')).current;

    function choose(k) {
      if (away(k)) return;
      if (props.value === undefined) sv[1](k.id);
      if (props.effort === undefined) se[1](null);
      if (props.onChange) props.onChange(k, { profession: prof, task: task, taskMode: taskMode });
      setOpen(false);
    }
    /* A level on the pinned model's scale. A level that is itself a place in the list selects that place. */
    function setEffort(l) {
      var other = l.pick && l.pick !== cur.id ? picks.filter(function (k) { return k.id === l.pick; })[0] : null;
      if (other && !away(other)) {
        if (props.value === undefined) sv[1](other.id);
        if (props.effort === undefined) se[1](null);
        if (props.onChange) props.onChange(other, { profession: prof, task: task, taskMode: taskMode });
        return;
      }
      var next = l.level === (cur.effort || {}).level ? null : l.level;
      if (props.effort === undefined) se[1](next);
      if (props.onEffortChange) props.onEffortChange(next == null ? null : l, cur);
    }
    function chooseAuto() {
      if (props.value === undefined) sv[1](null);
      if (props.effort === undefined) se[1](null);
      if (props.onChange) props.onChange(null, { profession: prof, task: task, taskMode: taskMode });
      setOpen(false);
    }
    function setTask(id) {
      if (props.task === undefined) stk[1](id);
      if (props.onTaskChange) props.onTaskChange(id, prof);
    }

    function price(k) {
      if (k.monthly == null) return null;
      var amt = shown === base ? k.monthly : k.monthly * rates[shown];
      var step = CURRENCY_STEP[shown];
      var small = shown === base && amt < 1;
      amt = step ? Math.max(step, Math.round(amt / step) * step) : (small ? amt : Math.round(amt));
      return h('span', { className: 'rr-model__price', key: 'p' }, [
        h(Money, { key: 'm', amount: amt, currency: shown, locale: locale, decimals: small ? undefined : false }),
        h('span', { key: 'u', className: 'rr-model__per' }, props.perLabel || '/mo')
      ]);
    }

    var src = props.source || {};
    var meta = [src.name, src.edition].filter(Boolean).join(', ');
    var tune = tunable
      ? h(EffortTune, { key: 'e', className: 'rr-model__tune', pick: cur, place: picks.indexOf(current) + 1 || null, chosen: effortSet,
          onSelect: setEffort, per: props.perLabel, note: props.effortNote,
          price: function (m) { return guidePrice(m, shown, base, rates, locale, 'rr-effort__price'); },
          title: 'for ' + (cur.short || cur.model) + ' on ' + cur.harness,
          labels: { effort: props.effortLabel, ranked: props.rankedLabel, reset: props.resetEffortLabel } })
      : null;

    var panel = open
      ? h('div', { key: 'p', className: 'rr-model__panel', role: 'dialog', 'aria-labelledby': titleId }, [
          h('div', { key: 'q', className: 'rr-model__ask' }, [
            h(Select, { key: 'p', size: 'sm', label: props.professionLabel || 'I work as', value: prof.id,
              options: professions.map(function (p) {
                return { value: p.id, label: p.disabled ? p.label + ' (soon)' : p.label, disabled: !!p.disabled };
              }),
              onChange: function (e) {
                var next = professions.filter(function (p) { return p.id === e.target.value; })[0];
                sp[1](e.target.value);
                if (next && next.tasks && next.tasks[0]) setTask(auto ? 'auto' : next.tasks[0].id);
              } }),
            h(Select, { key: 't', size: 'sm', label: props.taskLabel || 'I want to', value: auto ? taskMode : task.id,
              options: (auto ? [{ value: 'auto', label: props.autoTaskLabel || 'Match each message (Redrob Auto)' }] : [])
                .concat(tasks.map(function (t) { return { value: t.id, label: t.label }; })),
              onChange: function (e) { setTask(e.target.value); } })
          ]),
          isAuto
            ? h('div', { key: 'a', className: 'rr-model__auto' }, [
                h('span', { key: 'i', className: 'rr-model__autoicon', 'aria-hidden': 'true' }, Icons.sparkle({ width: 18, height: 18 })),
                h('span', { key: 't' }, [
                  h('b', { key: 'b' }, props.autoLabel || 'Redrob Auto'),
                  h('small', { key: 's' }, taskMode === 'auto'
                    ? (props.autoText || 'Reads each message once you send it, and gives it to the highest place below that runs ' + (here ? 'in ' + here.replace(/^Redrob /, '') : 'here') + '. One chat can use several AIs, and every answer says which it used. Choose one below to use it instead.')
                    : (props.autoTaskText || 'Always for this task in this chat: the highest place below that runs ' + (here ? 'in ' + here.replace(/^Redrob /, '') : 'here') + ', following the ranking when it changes each month.'))
                ])
              ])
            : null,
          h('div', { key: 'h', className: 'rr-model__head' }, [
            h('p', { key: 't', id: titleId, className: 'rr-model__title' },
              task.title || ('Top ' + picks.length + ' \u00b7 ' + (prof.label || '') + ' \u00b7 ' + (task.label || ''))),
            meta || task.usage
              ? h('p', { key: 'm', className: 'rr-model__meta' }, [isAuto && taskMode === 'auto' ? (props.matchedLabel || 'Your last message was matched to this task.') : null, meta, src.note, task.usage].filter(Boolean).join(' · '))
              : null
          ]),
          h('div', { key: 'l', className: 'rr-model__list', role: 'listbox', 'aria-labelledby': titleId },
            picks.map(function (k, i) {
              var on = !!current && k.id === current.id;
              var off = away(k);
              return h('button', {
                type: 'button', key: k.id, role: 'option', 'aria-selected': String(on), 'aria-disabled': off ? 'true' : undefined, disabled: off,
                className: cx('rr-model__item', off && 'rr-model__item--away'), onClick: function () { choose(k); }
              }, [
                h('span', { key: 'r', className: 'rr-model__rank' }, String(i + 1)),
                h('span', { key: 'b', className: 'rr-model__body' }, [
                  h('span', { key: 'n', className: 'rr-model__name' }, [
                    h('span', { key: 'm' }, k.model),
                    h('span', { key: 'o', className: 'rr-model__on' }, 'on ' + k.harness),
                    isAuto && autoPick && k.id === autoPick.id ? h('span', { key: 'a', className: 'rr-model__autotag' }, [h('span', { key: 'i', 'aria-hidden': 'true' }, Icons.sparkle({ width: 11, height: 11 })), props.autoPickLabel || 'Redrob Auto\u2019s pick']) : null,
                    on ? h('span', { key: 'c', className: 'rr-model__check', 'aria-label': 'Selected' }, Icons.check({ width: 14, height: 14 })) : null
                  ]),
                  on && custom
                    ? h('span', { key: 'e', className: 'rr-model__effortrow' }, [h(EffortMeter, { key: 'm', effort: k.effort }),
                        h('span', { key: 'y', className: 'rr-model__yours' }, (props.yoursLabel || 'you set') + ' ' + chosenEffort.label)])
                    : h(EffortMeter, { key: 'e', effort: k.effort }),
                  k.why || off ? h('span', { key: 'w', className: 'rr-model__why' }, [off ? (props.awayLabel || 'Not in ' + here.replace(/^Redrob /, '') + '. ') : null, k.why]) : null
                ]),
                price(k)
              ]);
            })),
          tune,
          here || (auto && current)
            ? h('div', { key: 'n', className: 'rr-model__foot' }, [
                auto && current ? h('button', { key: 'b', type: 'button', className: 'rr-model__back', onClick: chooseAuto }, props.backLabel || 'Back to Redrob Auto') : null,
                here && !current ? h('span', { key: 'x' }, props.awayNote || 'Grayed out: ranked, but runs in another app. Choose one that runs here to use it for this chat.') : null
              ])
            : null,
          props.onOpenGuide || props.guideHref
            ? h('a', { key: 'g', className: 'rr-model__guide', href: props.guideHref || '#',
                onClick: props.onOpenGuide ? function (e) { e.preventDefault(); setOpen(false); props.onOpenGuide(task, prof); } : undefined }, [
                props.guideLabel || 'Compare them in the Model Guide',
                h('span', { key: 'i', 'aria-hidden': 'true' }, Icons.arrowRight({ width: 14, height: 14 }))
              ])
            : null,
          props.basis
            ? h('details', { key: 'f', className: 'rr-model__basis' }, [
                h('summary', { key: 's' }, props.basisLabel || 'How this is ranked and priced'),
                h('div', { key: 'b' }, props.basis)
              ])
            : null
        ])
      : null;

    return h('div', {
      className: cx('rr-model', props.className), ref: ref,
      'data-placement': props.placement || 'bottom', 'data-align': props.align || 'start'
    }, [
      h('button', {
        type: 'button', key: 't', className: 'rr-model__trigger',
        'aria-haspopup': 'dialog', 'aria-expanded': String(open),
        'aria-label': (props.label || 'Model') + ': ' + (isAuto ? (props.autoLabel || 'Redrob Auto') + (taskMode !== 'auto' ? ', ' + task.label : '') : (cur.model || '') + (eff ? ', ' + eff.label + ' effort' + (custom ? ', ' + (props.yoursLabel || 'you set') + ' it' : '') : '') + (cur.harness ? ', on ' + cur.harness : '')),
        onClick: function () { setOpen(!open); }
      }, [
        isAuto ? h('span', { key: 'i', className: 'rr-model__trig-auto', 'aria-hidden': 'true' }, Icons.sparkle({ width: 15, height: 15 })) : null,
        h('span', { key: 'n', className: 'rr-model__trig-name' }, isAuto ? (props.autoLabel || 'Redrob Auto') : (cur.short || cur.model)),
        isAuto ? (taskMode !== 'auto' ? h('span', { key: 'e', className: 'rr-model__trig-effort' }, task.label) : null)
          : eff ? h('span', { key: 'e', className: 'rr-model__trig-effort' }, eff.label) : null,
        h('span', { key: 'c', className: 'rr-model__trig-caret' }, Icons.chevronDown({ width: 14, height: 14 }))
      ]),
      panel
    ]);
  }

  /* ---- ModelGuide ------------------------------------------------------ */

  /* The Redrob Leaderboard for one profession and one task: the five best
     combinations of model, harness and effort this month, each with an excerpt
     of what it was asked and what it wrote, and what a month of the work costs.
     Simple mode answers "which one?"; advanced mode shows how the score was
     calculated, for the people who will want to check it. All of it is data. */

  var GUIDE_DIMS = [
    { key: 'quality', label: 'Quality', hint: 'Graded against the task rubric' },
    { key: 'reliability', label: 'Reliability', hint: 'Runs that passed the rubric bar' },
    { key: 'speed', label: 'Speed', hint: 'Median time per task, against the fastest' },
    { key: 'cost', label: 'Cost', hint: 'Monthly cost, against the cheapest' }
  ];

  function guidePrice(monthly, shown, base, rates, locale, cls) {
    if (monthly == null) return null;
    var amt = shown === base ? monthly : monthly * rates[shown];
    var step = CURRENCY_STEP[shown];
    var small = shown === base && amt < 1;
    amt = step ? Math.max(step, Math.round(amt / step) * step) : (small ? amt : Math.round(amt));
    return h(Money, { amount: amt, currency: shown, locale: locale, decimals: small ? undefined : false, className: cls });
  }

  function guideTotal(k, w) {
    if (!k.score) return null;
    var t = 0;
    GUIDE_DIMS.forEach(function (d) { t += (w[d.key] || 0) * (k.score[d.key] || 0); });
    return Math.round(t * 10) / 10;
  }

  function ModelGuide(props) {
    props = props || {};
    var professions = props.professions || [];
    var limit = props.limit || 5;
    var locale = props.locale || docLocale();
    var base = props.currency || 'USD';
    var rates = props.rates || {};
    var shown = currencyFor(props.locale || (typeof document !== 'undefined' && document.documentElement.lang) || locale, props.currencyByLang);
    if (shown !== base && rates[shown] == null) shown = base;
    var src = props.source || {};

    var firstProf = professions.filter(function (p) { return !p.disabled; })[0] || {};
    /* profession and task can be controlled, so a ModelPicker can open the guide on its own task */
    var sp = React.useState(props.defaultProfession || firstProf.id);
    var profId = props.profession !== undefined ? props.profession : sp[0];
    var prof = professions.filter(function (p) { return p.id === profId; })[0] || firstProf;
    var tasks = prof.tasks || [];
    var st = React.useState(props.defaultTask || (tasks[0] && tasks[0].id));
    var taskId = props.task !== undefined ? props.task : st[0];
    var task = tasks.filter(function (t) { return t.id === taskId; })[0] || tasks[0] || {};
    var picks = (task.picks || []).slice(0, limit);
    function choose(pid, tid) {
      if (props.profession === undefined) sp[1](pid);
      if (props.task === undefined) st[1](tid);
      sk[1](null);
      if (props.onTaskChange) props.onTaskChange(tid, pid);
    }
    var sm = React.useState(props.defaultMode || 'simple');
    var mode = props.mode !== undefined ? props.mode : sm[0];
    var sk = React.useState(null);
    var current = picks.filter(function (k) { return k.id === sk[0]; })[0] || picks[0];
    /* A level the reader tries on the open pick, or null for the ranked one; reset when the pick changes. */
    var sge = React.useState({ id: null, level: null });
    var tryLevel = current && sge[0].id === current.id ? sge[0].level : null;
    function tryEffort(l) {
      var other = l.pick && current && l.pick !== current.id ? picks.filter(function (k) { return k.id === l.pick; })[0] : null;
      if (other) { sk[1](other.id); sge[1]({ id: null, level: null }); return; }
      sge[1]({ id: current.id, level: l.level === (current.effort || {}).level ? null : l.level });
    }
    var w = task.weights || props.weights || { quality: 0.55, reliability: 0.25, speed: 0.05, cost: 0.15 };
    var headId = useStableId('rr-guide');
    var adv = mode === 'advanced';

    function setMode(m) {
      if (props.mode === undefined) sm[1](m);
      if (props.onModeChange) props.onModeChange(m);
    }
    function modeSwitch() {
      return h('div', { className: 'rr-guide__mode', role: 'radiogroup', 'aria-label': props.modeLabel || 'View' },
        [['simple', props.simpleLabel || 'Simple'], ['advanced', props.advancedLabel || 'Advanced']].map(function (m) {
          return h('button', { key: m[0], type: 'button', role: 'radio', 'aria-checked': String(mode === m[0]),
            className: 'rr-guide__modeopt', onClick: function () { setMode(m[0]); } }, m[1]);
        }));
    }

    function row(k, i) {
      var on = current && k.id === current.id;
      var total = guideTotal(k, w);
      return h('li', { key: k.id }, h('button', {
        type: 'button', className: 'rr-guide__row', 'aria-pressed': String(on),
        onClick: function () { sk[1](k.id); }
      }, [
        h('span', { key: 'r', className: 'rr-model__rank' }, String(i + 1)),
        h('span', { key: 'b', className: 'rr-model__body' }, [
          h('span', { key: 'n', className: 'rr-model__name' }, [
            h('span', { key: 'm' }, k.model),
            h('span', { key: 'o', className: 'rr-model__on' }, 'on ' + k.harness)
          ]),
          h(EffortMeter, { key: 'e', effort: k.effort }),
          !adv && k.why ? h('span', { key: 'w', className: 'rr-model__why' }, k.why) : null,
          adv && k.score ? h('span', { key: 's', className: 'rr-guide__bar', 'aria-hidden': 'true' },
            GUIDE_DIMS.map(function (d) {
              return h('span', { key: d.key, className: 'rr-guide__seg rr-guide__seg--' + d.key,
                style: { width: ((w[d.key] || 0) * (k.score[d.key] || 0)) + '%' } });
            })) : null
        ]),
        h('span', { key: 'p', className: 'rr-guide__rowend' }, [
          adv && total != null
            ? h('span', { key: 's', className: 'rr-guide__score' }, [
                h('b', { key: 'v' }, total.toFixed(1)),
                k.score.ci ? h('span', { key: 'c' }, ' ±' + k.score.ci.toFixed(1)) : null
              ])
            : h('span', { key: 'm', className: 'rr-model__price' }, [
                guidePrice(k.monthly, shown, base, rates, locale),
                h('span', { key: 'u', className: 'rr-model__per' }, props.perLabel || '/mo')
              ]),
          adv
            ? h('span', { key: 'x', className: 'rr-guide__small' }, [
                guidePrice(k.monthly, shown, base, rates, locale),
                h('span', { key: 'u' }, props.perLabel || '/mo')
              ])
            : null
        ])
      ]));
    }

    function breakdown(k) {
      var total = guideTotal(k, w);
      var s = k.score || {};
      var m = k.measured || {};
      var body = GUIDE_DIMS.map(function (d) {
        return h('tr', { key: d.key }, [
          h('th', { key: 'a', scope: 'row' }, [h('span', { key: 'k', className: 'rr-guide__key rr-guide__seg--' + d.key }), d.label]),
          h('td', { key: 'b' }, m[d.key] || '-'),
          h('td', { key: 'c', className: 'rr-guide__num' }, s[d.key] != null ? s[d.key].toFixed(1) : '-'),
          h('td', { key: 'd', className: 'rr-guide__num' }, '× ' + (w[d.key] || 0).toFixed(2)),
          h('td', { key: 'e', className: 'rr-guide__num' }, ((w[d.key] || 0) * (s[d.key] || 0)).toFixed(1))
        ]);
      });
      body.push(h('tr', { key: 't', className: 'rr-guide__totalrow' }, [
        h('th', { key: 'a', scope: 'row' }, 'Score'),
        h('td', { key: 'b' }, s.ci ? '95% interval ±' + s.ci.toFixed(1) : ''),
        h('td', { key: 'c' }), h('td', { key: 'd' }),
        h('td', { key: 'e', className: 'rr-guide__num' }, total != null ? total.toFixed(1) : '-')
      ]));
      return h('div', { className: 'rr-guide__calc' }, [
        h('p', { key: 'h', className: 'rr-guide__label' }, props.calcLabel || 'How this score was calculated'),
        h('div', { key: 't', className: 'rr-guide__tablewrap' }, h('table', { className: 'rr-guide__table' }, [
          h('thead', { key: 'h' }, h('tr', null, ['Dimension', 'Measured', 'Score', 'Weight', 'Points'].map(function (c, i) {
            return h('th', { key: i, scope: 'col', className: i > 1 ? 'rr-guide__num' : null }, c);
          }))),
          h('tbody', { key: 'b' }, body)
        ])),
        task.formula ? h('p', { key: 'f', className: 'rr-guide__formula' }, h('code', null, task.formula)) : null,
        h('dl', { key: 'd', className: 'rr-guide__facts' }, (k.facts || []).map(function (f, i) {
          return h('div', { key: i }, [h('dt', { key: 't' }, f[0]), h('dd', { key: 'd' }, f[1])]);
        })),
        k.note ? h('p', { key: 'n', className: 'rr-guide__note' }, [h('b', { key: 'b' }, (props.noteLabel || 'Graders’ note') + ' '), k.note]) : null
      ]);
    }

    function detail(k, i) {
      if (!k) return null;
      var sample = k.sample || {};
      return h('div', { className: 'rr-guide__detail', 'aria-live': 'polite' }, [
        h('div', { key: 'h', className: 'rr-guide__dhead' }, [
          h('div', { key: 'a' }, [
            h('p', { key: 'r', className: 'rr-guide__rank' }, [
              '#' + (i + 1) + ' for ' + (task.label || '').toLowerCase(),
              i === 0 ? h(Badge, { key: 'b', tone: 'brand', size: 'sm' }, props.topLabel || 'Best pick') : null
            ]),
            h('h3', { key: 'n', className: 'rr-guide__dname' }, [k.model, h('span', { key: 'o' }, ' on ' + k.harness)]),
            h(EffortMeter, { key: 'e', effort: k.effort })
          ]),
          h('div', { key: 'p', className: 'rr-guide__cost' }, [
            h('span', { key: 'v', className: 'rr-guide__costv' }, [guidePrice(k.monthly, shown, base, rates, locale),
              h('span', { key: 'u', className: 'rr-model__per' }, props.perLabel || '/mo')]),
            task.usage ? h('span', { key: 'u', className: 'rr-guide__costu' }, task.usage) : null
          ])
        ]),
        k.why ? h('p', { key: 'w', className: 'rr-guide__why' }, k.why) : null,
        k.efforts && k.efforts.length > 1
          ? h(EffortTune, { key: 'e', className: 'rr-guide__tune', pick: k, place: i + 1, chosen: tryLevel, onSelect: tryEffort,
              per: props.perLabel, note: props.effortNote, labels: { effort: props.effortLabel || 'Try another effort', ranked: props.rankedLabel, reset: props.resetEffortLabel },
              price: function (m) { return guidePrice(m, shown, base, rates, locale, 'rr-effort__price'); },
              title: props.effortHint || 'The sample below was written at the ranked effort.' })
          : null,
        h('div', { key: 's', className: 'rr-guide__sample' }, [
          h('div', { key: 'q', className: 'rr-guide__turn' }, [
            h('p', { key: 'l', className: 'rr-guide__label' }, props.promptLabel || 'What it was asked'),
            h('blockquote', { key: 't', className: 'rr-guide__prompt' }, task.prompt || sample.prompt)
          ]),
          h('div', { key: 'a', className: 'rr-guide__turn' }, [
            h('p', { key: 'l', className: 'rr-guide__label' }, [
              props.outputLabel || 'What it wrote',
              sample.illustrative ? h('span', { key: 'i', className: 'rr-guide__illus' }, props.illustrativeLabel || 'Sample output, illustrative') : null
            ]),
            /* the whole output, in its own scrolling box; focusable so the keyboard can scroll it */
            h('div', { key: 't', className: 'rr-guide__output', tabIndex: 0, role: 'region',
              'aria-label': (props.outputLabel || 'What it wrote') + ': ' + k.model }, sample.output),
            sample.more ? h('p', { key: 'm', className: 'rr-guide__cut' }, sample.more) : null
          ])
        ]),
        adv ? breakdown(k) : null,
        h('div', { key: 'c', className: 'rr-guide__actions' }, [
          h(Button, { key: 'b', variant: 'primary', onClick: function () {
              var lv = tryLevel != null && k.efforts ? k.efforts.filter(function (l) { return l.level === tryLevel; })[0] : null;
              if (props.onUse) props.onUse(k, { profession: prof, task: task, effort: lv || null }); } },
            (props.useLabel || 'Use this in the chat')),
          k.runHref ? h('a', { key: 'a', className: 'rr-guide__runlink', href: k.runHref }, [props.runLabel || 'See the full run',
            h('span', { key: 'i', 'aria-hidden': 'true' }, Icons.arrowRight({ width: 14, height: 14 }))]) : null
        ])
      ]);
    }

    var meta = [src.name, src.edition, src.note].filter(Boolean).join(' · ');

    return h('section', { className: cx('rr-guide', adv && 'rr-guide--advanced', props.className), 'aria-labelledby': headId }, [
      h('div', { key: 'top', className: 'rr-guide__top' }, [
        h('div', { key: 'a' }, [
          h('h2', { key: 't', id: headId, className: 'rr-guide__title' }, props.title || 'Model Guide'),
          props.lede ? h('p', { key: 'l', className: 'rr-guide__lede' }, props.lede) : null
        ]),
        modeSwitch()
      ]),
      h('div', { key: 'ask', className: 'rr-guide__ask' }, [
        h(Select, { key: 'p', size: 'sm', label: props.professionLabel || 'I work as', value: prof.id,
          options: professions.map(function (p) { return { value: p.id, label: p.label, disabled: !!p.disabled }; }),
          onChange: function (e) {
            var next = professions.filter(function (p) { return p.id === e.target.value; })[0];
            choose(e.target.value, next && next.tasks && next.tasks[0] ? next.tasks[0].id : null);
          } }),
        h(Select, { key: 't', size: 'sm', label: props.taskLabel || 'I want to', value: task.id,
          options: tasks.map(function (t) { return { value: t.id, label: t.label }; }),
          onChange: function (e) { choose(prof.id, e.target.value); } })
      ]),
      h('div', { key: 'head', className: 'rr-guide__head' }, [
        h('p', { key: 't', className: 'rr-guide__rtitle' }, task.title || ('Top ' + limit + ' · ' + (prof.label || '') + ' · ' + (task.label || ''))),
        h('p', { key: 'm', className: 'rr-guide__meta' }, [meta, task.basis].filter(Boolean).join(' · '))
      ]),
      picks.length
        ? h('div', { key: 'grid', className: 'rr-guide__grid' }, [
            h('ol', { key: 'l', className: 'rr-guide__list', 'aria-label': task.title || task.label }, picks.map(row)),
            detail(current, picks.indexOf(current))
          ])
        : h('div', { key: 'e', className: 'rr-guide__empty' }, [
            h('p', { key: 't', className: 'rr-guide__emptyt' }, props.emptyTitle || 'Not ranked yet'),
            h('p', { key: 'd' }, task.emptyText || props.emptyText || 'This task is being tested. Its top five publish with the next monthly edition.')
          ]),
      props.method
        ? h('details', { key: 'm', className: 'rr-guide__method', open: adv || undefined }, [
            h('summary', { key: 's' }, props.methodLabel || 'How Redrob tests and ranks'),
            h('div', { key: 'b' }, props.method)
          ])
        : null
    ]);
  }

  /* ---- Composer -------------------------------------------------------- */

  /* Where a person writes to the agent: the shape every chat product now shares,
     so nobody has to learn it. One rounded field, the text on top, and one row
     under it: add on the left; the model and a round Send on the right. Enter
     sends, Shift+Enter starts a new line. While the agent works, Send is Stop. */

  function Composer(props) {
    props = props || {};
    var st = React.useState(props.defaultValue || '');
    var value = props.value !== undefined ? props.value : st[0];
    var taRef = React.useRef(null);
    var id = React.useRef(nextId('rr-composer')).current;
    var maxRows = props.maxRows || 8;

    React.useEffect(function () {
      var ta = taRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      var lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
      ta.style.height = Math.min(ta.scrollHeight, lh * maxRows) + 'px';
    }, [value, maxRows]);

    function set(v) {
      if (props.value === undefined) st[1](v);
      if (props.onChange) props.onChange(v);
    }
    function submit() {
      if (props.busy || props.disabled || !String(value).trim()) return;
      if (props.onSubmit) props.onSubmit(value);
      if (props.value === undefined) st[1]('');
    }
    var empty = !String(value).trim();

    var form = h('form', {
      className: cx('rr-composer', props.busy && 'rr-composer--busy', props.className),
      onSubmit: function (e) { e.preventDefault(); submit(); }
    }, [
      props.context ? h('div', { key: 'x', className: 'rr-composer__context' }, props.context) : null,
      h('label', { key: 'l', htmlFor: id, className: 'rr-visually-hidden' }, props.label || 'Message'),
      h('textarea', {
        key: 't', id: id, ref: taRef, rows: 1, className: 'rr-composer__input',
        placeholder: props.placeholder, value: value, disabled: props.disabled,
        onChange: function (e) { set(e.target.value); },
        onKeyDown: function (e) {
          if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent && e.nativeEvent.isComposing) && e.keyCode !== 229) { e.preventDefault(); submit(); }
        }
      }),
      h('div', { key: 'b', className: 'rr-composer__bar' }, [
        h('div', { key: 'a', className: 'rr-composer__lead' },
          props.leading !== undefined ? props.leading
            : h('button', { type: 'button', className: 'rr-composer__tool', 'aria-label': props.addLabel || 'Add files', onClick: props.onAdd },
                Icons.plus({ width: 18, height: 18 }))),
        h('div', { key: 'r', className: 'rr-composer__trail' }, [
          props.tools ? h('span', { key: 'm', className: 'rr-composer__tools' }, props.tools) : null,
          props.busy
            ? h('button', { key: 's', type: 'button', className: 'rr-composer__send rr-composer__send--stop',
                'aria-label': props.stopLabel || 'Stop', onClick: props.onStop }, Icons.stop({ width: 14, height: 14 }))
            : h('button', { key: 's', type: 'submit', className: 'rr-composer__send',
                'aria-label': props.submitLabel || 'Send', disabled: empty || props.disabled }, Icons.arrowUp({ width: 18, height: 18 }))
        ])
      ])
    ]);
    /* status: a ComposerStatus under the field. Its panels open above the
       whole composer, so the group is what they are positioned against. */
    if (!props.status) return form;
    return h('div', { className: 'rr-composer-group' }, [
      h(React.Fragment, { key: 'f' }, form),
      h('div', { key: 's', className: 'rr-composer-group__status' }, props.status)
    ]);
  }


  /* =====================================================================
     The evidence layer. Ten components for work whose whole value is a
     claim about a body of material somebody else will be held to. Each
     one exists to make a claim checkable: what was asked, what was read,
     what the machine found, and the passage it found it in.
     ===================================================================== */

  /* ---- Criteria ------------------------------------------------------- */

  var WEIGHT_LABEL = { required: 'Must have', preferred: 'Good to have', excluded: 'Must not have' };

  function Criteria(props) {
    props = props || {};
    var items = props.items || [];
    return h('div', { className: cx('rr-criteria', props.className) }, [
      h(SectionMark, { key: 'm', label: props.title || 'What I am looking for' }),
      props.request
        ? h('p', { className: 'rr-criteria__request', key: 'q' }, '“' + props.request + '”')
        : null,
      h('ul', { className: 'rr-criteria__list', key: 'l' }, items.map(function (it, i) {
        var weight = it.weight || 'required';
        return h('li', { className: cx('rr-criteria__row', 'rr-criteria__row--' + weight, it.off && 'rr-criteria__row--off'), key: it.id || i }, [
          h('span', { className: cx('rr-criteria__weight', 'rr-criteria__weight--' + weight), key: 'w' }, WEIGHT_LABEL[weight] || weight),
          h('span', { className: 'rr-criteria__body', key: 'b' }, [
            h('span', { className: 'rr-criteria__label', key: 'l' }, it.label),
            it.detail ? h('span', { className: 'rr-criteria__detail', key: 'd' }, it.detail) : null
          ]),
          it.source === 'inferred'
            ? h('span', { className: 'rr-criteria__guess', key: 'g', title: 'You did not say this. I read it into the request.' }, [
                h('span', { className: 'rr-criteria__guessIcon', key: 'i' }, Icons.sparkle({ width: 13, height: 13 })),
                h('span', { key: 't' }, 'My assumption')
              ])
            : null,
          props.onRemove
            ? h('button', { type: 'button', className: 'rr-criteria__drop', key: 'x', 'aria-label': 'Drop this condition', onClick: function () { props.onRemove(it, i); } }, Icons.close({ width: 14, height: 14 }))
            : null
        ]);
      })),
      props.onAdd || props.note
        ? h('div', { className: 'rr-criteria__foot', key: 'f' }, [
            props.note ? h('span', { className: 'rr-criteria__note', key: 'n' }, props.note) : null,
            props.onAdd ? h(Button, { key: 'a', size: 'sm', variant: 'secondary', iconLeft: Icons.plus({ width: 14, height: 14 }), onClick: props.onAdd }, props.addLabel || 'Add a condition') : null
          ])
        : null
    ]);
  }

  /* ---- SourceSet ------------------------------------------------------ */

  var SRC_STATE = { read: 'Read', partial: 'Partly read', skipped: 'Not read', pending: 'Still reading' };

  function SourceSet(props) {
    props = props || {};
    var sources = props.sources || [];
    var read = props.read, total = props.total;
    if (read == null || total == null) {
      var r = 0, t = 0;
      sources.forEach(function (s) {
        var c = s.count || 0; t += c;
        if (s.state === 'skipped') return;
        r += s.state === 'partial' ? (s.readCount != null ? s.readCount : Math.round(c / 2)) : c;
      });
      if (read == null) read = r;
      if (total == null) total = t;
    }
    var pct = total ? Math.max(0, Math.min(100, (read / total) * 100)) : 0;
    var missed = Math.max(0, total - read);
    return h('div', { className: cx('rr-sourceset', props.className) }, [
      h('div', { className: 'rr-sourceset__head', key: 'h' }, [
        h('span', { className: 'rr-sourceset__title', key: 't' }, props.title || 'What this answer looked at'),
        props.updated ? h('span', { className: 'rr-sourceset__updated', key: 'u' }, props.updated) : null
      ]),
      total
        ? h('p', { className: 'rr-sourceset__count', key: 'c' }, [
            h('strong', { key: 'a' }, read.toLocaleString() + ' of ' + total.toLocaleString()),
            h('span', { key: 'b' }, ' ' + (props.unit || 'documents') + ' read')
          ])
        : null,
      total
        ? h('div', { className: 'rr-sourceset__bar', key: 'b', role: 'img', 'aria-label': read + ' of ' + total + ' read' }, [
            h('span', { className: 'rr-sourceset__fill', key: 'f', style: { width: pct + '%' } })
          ])
        : null,
      h('ul', { className: 'rr-sourceset__list', key: 'l' }, sources.map(function (s, i) {
        var state = s.state || 'read';
        return h('li', { className: cx('rr-sourceset__row', 'rr-sourceset__row--' + state), key: s.id || i }, [
          h('span', { className: 'rr-sourceset__icon', key: 'i' }, (s.icon || Icons.stack)({ width: 16, height: 16 })),
          h('span', { className: 'rr-sourceset__body', key: 'b' }, [
            h('span', { className: 'rr-sourceset__name', key: 'n' }, s.name),
            s.reason ? h('span', { className: 'rr-sourceset__reason', key: 'r' }, s.reason) : null
          ]),
          s.count != null ? h('span', { className: 'rr-sourceset__num', key: 'c' }, s.count.toLocaleString()) : null,
          h('span', { className: cx('rr-sourceset__state', 'rr-sourceset__state--' + state), key: 's' }, s.stateLabel || SRC_STATE[state] || state)
        ]);
      })),
      missed
        ? h('p', { className: 'rr-sourceset__missed', key: 'm' }, props.missedNote || (missed.toLocaleString() + ' ' + (props.unit || 'documents') + ' were not read. The answer cannot speak for them.'))
        : null
    ]);
  }

  /* ---- Evidence -------------------------------------------------------- */

  function markPassage(passage, quote) {
    if (!passage) return null;
    if (!quote || typeof passage !== 'string') return passage;
    var at = passage.indexOf(quote);
    if (at === -1) return passage;
    return [
      passage.slice(0, at),
      h('mark', { className: 'rr-evidence__mark', key: 'm' }, quote),
      passage.slice(at + quote.length)
    ];
  }

  function Evidence(props) {
    props = props || {};
    return h('figure', { className: cx('rr-evidence', props.className) }, [
      props.claim
        ? h('div', { className: 'rr-evidence__claim', key: 'c' }, [
            h('span', { className: 'rr-evidence__claimLabel', key: 'l' }, props.claimLabel || 'Put forward as proof of'),
            h('span', { className: 'rr-evidence__claimText', key: 't' }, props.claim)
          ])
        : null,
            /* passage is the surrounding text and quote marks the part relied on. A caller
         who passes only quote used to get an empty bordered box; now the quote stands
         on its own and nothing is drawn if neither is there. */
      (props.passage || props.quote)
        ? h('blockquote', { className: 'rr-evidence__passage', key: 'p' },
            props.passage ? markPassage(props.passage, props.quote) : props.quote)
        : null,
      h('figcaption', { className: 'rr-evidence__foot', key: 'f' }, [
        h('span', { className: 'rr-evidence__icon', key: 'i' }, Icons.highlight({ width: 15, height: 15 })),
        props.href
          ? h('a', { className: 'rr-evidence__source', key: 's', href: props.href, target: '_blank', rel: 'noreferrer' }, [
              h('span', { key: 'n' }, props.source),
              h('span', { className: 'rr-evidence__ext', key: 'e' }, Icons.external({ width: 13, height: 13 }))
            ])
          : h('span', { className: 'rr-evidence__source', key: 's' }, props.source),
        props.meta ? h('span', { className: 'rr-evidence__meta', key: 'm' }, props.meta) : null,
        props.actions ? h('span', { className: 'rr-evidence__actions', key: 'a' }, props.actions) : null
      ])
    ]);
  }

  /* ---- ReviewGrid ------------------------------------------------------ */

  var CELL_STATE = { answered: null, unsure: 'Not sure', none: 'Not found', pending: null };

  function ReviewCell(props) {
    var cell = props.cell || {};
    var state = cell.state || (cell.value ? 'answered' : 'none');
    var open = props.onOpen && state !== 'pending';
    var inner = [
      state === 'pending'
        ? h('span', { className: 'rr-skeleton rr-review__wait', key: 'w' })
        : h('span', { className: 'rr-review__value', key: 'v' }, cell.value || CELL_STATE[state]),
      state === 'unsure' ? h('span', { className: 'rr-review__flag', key: 'f', title: 'Needs a person' }, Icons.flag({ width: 13, height: 13 })) : null,
      cell.source != null && state !== 'pending' ? h('span', { className: 'rr-review__src', key: 's' }, cell.source) : null
    ];
    return h(
      'td',
      { className: cx('rr-review__cell', 'rr-review__cell--' + state) },
      open
        ? h('button', { type: 'button', className: 'rr-review__open', onClick: function () { props.onOpen(props.row, props.col, cell); } }, inner)
        : inner
    );
  }

  function ReviewGrid(props) {
    props = props || {};
    var cols = props.columns || [];
    var rows = props.rows || [];
    var unsure = 0;
    rows.forEach(function (r) { cols.forEach(function (c) { var x = (r.cells || {})[c.key]; if (x && x.state === 'unsure') unsure += 1; }); });
    return h('div', { className: cx('rr-review', props.className) }, [
      props.caption || props.title
        ? h('div', { className: 'rr-review__head', key: 'h' }, [
            h('span', { className: 'rr-review__title', key: 't' }, props.title || props.caption),
            unsure ? h(Badge, { key: 'b', tone: 'warning', size: 'sm' }, unsure + (unsure === 1 ? ' answer needs a person' : ' answers need a person')) : null
          ])
        : null,
      h('div', { className: 'rr-review__scroll', key: 's' },
        h('table', { className: 'rr-review__table' }, [
          h('thead', { key: 'h' }, h('tr', null, [h('th', { className: 'rr-review__corner', key: 'c', scope: 'col' }, props.rowLabel || 'Document')].concat(
            cols.map(function (c) { return h('th', { key: c.key, scope: 'col', style: c.width ? { width: c.width } : null }, c.label); })
          ))),
          h('tbody', { key: 'b' }, rows.map(function (r, i) {
            return h('tr', { key: r.id || i }, [
              h('th', { className: 'rr-review__rowhead', key: '_h', scope: 'row' }, [
                props.onOpenRow
                  ? h('button', { type: 'button', className: 'rr-review__rowbtn', key: 'b', onClick: function () { props.onOpenRow(r, i); } }, r.label)
                  : h('span', { className: 'rr-review__rowname', key: 'n' }, r.label),
                r.sub ? h('span', { className: 'rr-review__rowsub', key: 's' }, r.sub) : null
              ])
            ].concat(cols.map(function (c) {
              return h(ReviewCell, { key: c.key, cell: (r.cells || {})[c.key], row: r, col: c, onOpen: props.onOpenCell });
            })));
          }))
        ])
      ),
      props.footNote ? h('p', { className: 'rr-review__foot', key: 'f' }, props.footNote) : null
    ]);
  }

  /* ---- MatchBreakdown -------------------------------------------------- */

  var MET_ICON = { met: 'success', partly: 'minus', missing: 'close', unknown: 'info' };
  var MET_LABEL = { met: 'Meets this', partly: 'Partly', missing: 'Does not', unknown: 'No evidence either way' };

  function MatchBreakdown(props) {
    props = props || {};
    var items = props.items || [];
    var met = items.filter(function (i) { return i.state === 'met'; }).length;
    var counted = items.filter(function (i) { return i.state !== 'unknown'; }).length || items.length;
    return h('div', { className: cx('rr-match', props.className) }, [
      props.name
        ? h('div', { className: 'rr-match__head', key: 'h' }, [
            h('span', { className: 'rr-match__body', key: 'b' }, [
              h('span', { className: 'rr-match__name', key: 'n' }, props.name),
              props.sub ? h('span', { className: 'rr-match__sub', key: 's' }, props.sub) : null
            ]),
            h('span', { className: 'rr-match__verdict', key: 'v' }, props.verdict || ('Meets ' + met + ' of ' + counted))
          ])
        : null,
      h('ul', { className: 'rr-match__list', key: 'l' }, items.map(function (it, i) {
        var state = it.state || 'unknown';
        return h('li', { className: cx('rr-match__row', 'rr-match__row--' + state), key: it.id || i }, [
          h('span', { className: cx('rr-match__icon', 'rr-match__icon--' + state), key: 'i', title: MET_LABEL[state] }, Icons[MET_ICON[state]]({ width: 16, height: 16 })),
          h('span', { className: 'rr-match__cell', key: 'c' }, [
            h('span', { className: 'rr-match__label', key: 'l' }, it.label),
            it.evidence
              ? (props.onOpen
                  ? h('button', { type: 'button', className: 'rr-match__evidence rr-match__evidence--link', key: 'e', onClick: function () { props.onOpen(it, i); } }, it.evidence)
                  : h('span', { className: 'rr-match__evidence', key: 'e' }, it.evidence))
              : h('span', { className: 'rr-match__evidence rr-match__evidence--none', key: 'e' }, it.noEvidence || 'Nothing in the sources speaks to this'),
            h('span', { className: 'rr-match__sr', key: 'v' }, MET_LABEL[state])
          ])
        ]);
      }))
    ]);
  }

  /* ---- Redline --------------------------------------------------------- */

  var REDLINE_STATE = { kept: 'Kept', reverted: 'Put back' };

  function Redline(props) {
    props = props || {};
    var parts = props.parts || [];
    var state = props.state || 'open';
    return h('div', { className: cx('rr-redline', 'rr-redline--' + state, props.className) }, [
      props.label || props.source
        ? h('div', { className: 'rr-redline__head', key: 'h' }, [
            h('span', { className: 'rr-redline__icon', key: 'i' }, Icons.clause({ width: 15, height: 15 })),
            h('span', { className: 'rr-redline__label', key: 'l' }, props.label),
            props.source ? h('span', { className: 'rr-redline__source', key: 's' }, props.source) : null
          ])
        : null,
      h('p', { className: 'rr-redline__text', key: 't' }, parts.map(function (p, i) {
        var kind = p.kind || 'same';
        if (kind === 'same') return h('span', { key: i }, p.text);
        return h(kind === 'out' ? 'del' : 'ins', { className: 'rr-redline__' + kind, key: i }, p.text);
      })),
      props.why ? h('p', { className: 'rr-redline__why', key: 'w' }, [h('span', { className: 'rr-redline__whyLabel', key: 'l' }, 'Why'), props.why]) : null,
      state === 'open' && (props.onKeep || props.onRevert)
        ? h('div', { className: 'rr-redline__actions', key: 'a' }, [
            props.onKeep ? h(Button, { key: 'k', size: 'sm', onClick: props.onKeep }, props.keepLabel || 'Keep this wording') : null,
            props.onRevert ? h(Button, { key: 'r', size: 'sm', variant: 'secondary', onClick: props.onRevert }, props.revertLabel || 'Put it back') : null
          ])
        : state !== 'open'
          ? h('div', { className: 'rr-redline__settled', key: 'd' }, [
              h('span', { key: 'i', className: 'rr-redline__settledIcon' }, (state === 'kept' ? Icons.success : Icons.history)({ width: 14, height: 14 })),
              h('span', { key: 't' }, props.stateLabel || REDLINE_STATE[state])
            ])
          : null
    ]);
  }

  /* ---- Finding --------------------------------------------------------- */

  var SEV_LABEL = { high: 'Serious', medium: 'Worth a look', low: 'Minor', note: 'Note' };

  function Finding(props) {
    props = props || {};
    var sev = props.severity || 'medium';
    var state = props.state || 'open';
    return h('div', { className: cx('rr-finding', 'rr-finding--' + sev, state !== 'open' && 'rr-finding--settled', props.className) }, [
      h('div', { className: 'rr-finding__head', key: 'h' }, [
        h('span', { className: cx('rr-finding__sev', 'rr-finding__sev--' + sev), key: 's' }, [
          h('span', { className: 'rr-finding__sevIcon', key: 'i' }, (sev === 'note' ? Icons.info : Icons.flag)({ width: 13, height: 13 })),
          h('span', { key: 'l' }, props.severityLabel || SEV_LABEL[sev] || sev)
        ]),
        h('span', { className: 'rr-finding__title', key: 't' }, props.title),
        state !== 'open' ? h('span', { className: 'rr-finding__state', key: 'x' }, state === 'accepted' ? 'Accepted' : 'Set aside') : null
      ]),
      props.where
        ? h('button', {
            type: 'button', key: 'w', className: cx('rr-finding__where', !props.onOpen && 'rr-finding__where--static'),
            disabled: !props.onOpen, onClick: props.onOpen
          }, [h('span', { key: 'i', className: 'rr-finding__whereIcon' }, Icons.pin({ width: 13, height: 13 })), h('span', { key: 't' }, props.where)])
        : null,
      props.detail ? h('p', { className: 'rr-finding__detail', key: 'd' }, props.detail) : null,
      props.evidence ? h('div', { className: 'rr-finding__evidence', key: 'e' }, props.evidence) : null,
      props.suggestion
        ? h('p', { className: 'rr-finding__do', key: 'x' }, [h('span', { className: 'rr-finding__doLabel', key: 'l' }, props.suggestionLabel || 'What to do'), props.suggestion])
        : null,
      props.actions ? h('div', { className: 'rr-finding__actions', key: 'a' }, props.actions) : null
    ]);
  }

  /* ---- Playbook -------------------------------------------------------- */

  function Playbook(props) {
    props = props || {};
    var steps = props.steps || [];
    var gates = steps.filter(function (s) { return s.approval; }).length;
    return h('div', { className: cx('rr-playbook', props.className) }, [
      h('div', { className: 'rr-playbook__head', key: 'h' }, [
        h('span', { className: 'rr-playbook__icon', key: 'i' }, Icons.route({ width: 18, height: 18 })),
        h('span', { className: 'rr-playbook__body', key: 'b' }, [
          h('span', { className: 'rr-playbook__name', key: 'n' }, props.name),
          props.purpose ? h('span', { className: 'rr-playbook__purpose', key: 'p' }, props.purpose) : null
        ]),
        props.onRun ? h(Button, { key: 'r', size: 'sm', onClick: props.onRun }, props.runLabel || 'Run it') : null
      ]),
      steps.length
        ? h('ol', { className: 'rr-playbook__steps', key: 's' }, steps.map(function (s, i) {
            return h('li', { className: cx('rr-playbook__step', s.approval && 'rr-playbook__step--gate'), key: s.id || i }, [
              h('span', { className: 'rr-playbook__n', key: 'n' }, i + 1),
              h('span', { className: 'rr-playbook__cell', key: 'c' }, [
                h('span', { className: 'rr-playbook__label', key: 'l' }, s.label),
                s.detail ? h('span', { className: 'rr-playbook__detail', key: 'd' }, s.detail) : null
              ]),
              s.approval
                ? h('span', { className: 'rr-playbook__gate', key: 'g' }, [
                    h('span', { className: 'rr-playbook__gateIcon', key: 'i' }, Icons.shield({ width: 13, height: 13 })),
                    h('span', { key: 't' }, s.approvalLabel || 'Asks you first')
                  ])
                : null
            ]);
          }))
        : null,
      h('div', { className: 'rr-playbook__foot', key: 'f' }, [
        h('span', { key: 'g', className: 'rr-playbook__foothalf' }, gates
          ? ('Stops for you ' + (gates === 1 ? 'once' : gates === 2 ? 'twice' : gates + ' times'))
          : 'Runs straight through without stopping'),
        h('span', { key: 'm', className: 'rr-playbook__meta' }, [props.owner, props.runs, props.lastRun].filter(Boolean).join(' · '))
      ])
    ]);
  }

  /* ---- Shortlist ------------------------------------------------------- */

  function Shortlist(props) {
    props = props || {};
    var items = props.items || [];
    return h('div', { className: cx('rr-shortlist', !items.length && 'rr-shortlist--empty', props.className), role: 'region', 'aria-label': props.title || 'Your shortlist' }, [
      h('div', { className: 'rr-shortlist__head', key: 'h' }, [
        h('span', { className: 'rr-shortlist__title', key: 't' }, props.title || 'Your shortlist'),
        h('span', { className: 'rr-shortlist__count', key: 'c' }, items.length + (props.limit ? ' of ' + props.limit : ''))
      ]),
      items.length
        ? h('ul', { className: 'rr-shortlist__items', key: 'i' }, items.map(function (it, i) {
            return h('li', { className: 'rr-shortlist__item', key: it.id || i }, [
              h('span', { className: 'rr-shortlist__cell', key: 'c' }, [
                h('span', { className: 'rr-shortlist__label', key: 'l' }, it.label),
                it.sub ? h('span', { className: 'rr-shortlist__sub', key: 's' }, it.sub) : null
              ]),
              props.onRemove
                ? h('button', { type: 'button', className: 'rr-shortlist__drop', key: 'x', 'aria-label': 'Take ' + it.label + ' off the list', onClick: function () { props.onRemove(it, i); } }, Icons.close({ width: 13, height: 13 }))
                : null
            ]);
          }))
        : h('p', { className: 'rr-shortlist__none', key: 'n' }, props.empty || 'Nothing on it yet. Add anything worth a second look.'),
      props.actions ? h('div', { className: 'rr-shortlist__actions', key: 'a' }, props.actions) : null
    ]);
  }

  /* ---- DecisionNotice -------------------------------------------------- */

  function noticeList(title, arr, cls, key) {
    if (!arr || !arr.length) return null;
    return h('div', { className: 'rr-notice__col', key: key }, [
      h('span', { className: 'rr-notice__colTitle', key: 't' }, title),
      h('ul', { className: cx('rr-notice__items', cls), key: 'l' }, arr.map(function (x, i) {
        return h('li', { key: i }, x);
      }))
    ]);
  }

  function DecisionNotice(props) {
    props = props || {};
    return h('section', { className: cx('rr-notice', props.tone === 'quiet' && 'rr-notice--quiet', props.className), 'aria-label': props.title || 'How this decision was made' }, [
      h('div', { className: 'rr-notice__head', key: 'h' }, [
        h('span', { className: 'rr-notice__icon', key: 'i' }, Icons.scales({ width: 17, height: 17 })),
        h('span', { className: 'rr-notice__title', key: 't' }, props.title || 'How this decision was made')
      ]),
      props.decision ? h('p', { className: 'rr-notice__decision', key: 'd' }, props.decision) : null,
      (props.used || props.notUsed)
        ? h('div', { className: 'rr-notice__cols', key: 'c' }, [
            noticeList(props.usedLabel || 'What it looked at', props.used, 'rr-notice__items--used', 'u'),
            noticeList(props.notUsedLabel || 'What it did not look at', props.notUsed, 'rr-notice__items--not', 'n')
          ])
        : null,
      props.humanReview
        ? h('p', { className: 'rr-notice__human', key: 'r' }, [
            h('span', { className: 'rr-notice__humanIcon', key: 'i' }, Icons.user({ width: 14, height: 14 })),
            h('span', { key: 't' }, props.humanReview)
          ])
        : null,
      props.rights && props.rights.length
        ? h('div', { className: 'rr-notice__rights', key: 'g' }, [
            h('span', { className: 'rr-notice__colTitle', key: 't' }, props.rightsLabel || 'What you can ask for'),
            h('ul', { className: 'rr-notice__items', key: 'l' }, props.rights.map(function (x, i) { return h('li', { key: i }, x); }))
          ])
        : null,
      (props.auditHref || props.contact)
        ? h('div', { className: 'rr-notice__foot', key: 'f' }, [
            props.auditHref
              ? h('a', { className: 'rr-notice__link', key: 'a', href: props.auditHref, target: '_blank', rel: 'noreferrer' }, [
                  h('span', { key: 't' }, props.auditLabel || 'Read the independent audit of this tool'),
                  h('span', { className: 'rr-notice__ext', key: 'e' }, Icons.external({ width: 13, height: 13 }))
                ])
              : null,
            props.contact ? h('span', { className: 'rr-notice__contact', key: 'c' }, props.contact) : null
          ])
        : null
    ]);
  }


  /* =====================================================================
     The web layer. A public site is not a product screen: it has one h1,
     a navigation that is navigation, a footer that is links rather than a
     filing cabinet, a consent surface that must exist before a tag loads, and
     sections built from edges rather than from cards.

     Three of these ship with a constraint removed rather than documented.
     Hero has no alignment prop, because every framework's hero centers and
     50-not-generated.md names the centered hero as the tell. FeatureRow
     takes one subject, not an array, because an array becomes a three-up
     grid the first time somebody passes three. Band has no centering
     escape hatch for the same reason.
     ===================================================================== */

  /* ---- PageShell ------------------------------------------------------ */

  function PageShell(props) {
    props = props || {};
    var lang = props.lang || 'en';
    React.useEffect(function () {
      if (typeof document === 'undefined') return;
      document.documentElement.setAttribute('lang', lang);
    }, [lang]);
    return h('div', { className: cx('rr-pageshell', props.className), 'data-lang': lang }, [
      h('a', { className: 'rr-pageshell__skip', href: '#' + (props.mainId || 'main'), key: 's' },
        props.skipLabel || (lang === 'ko' ? '본문으로 건너뛰기' : 'Skip to the content')),
      props.header ? h('header', { className: 'rr-pageshell__header', key: 'h', role: 'banner' }, props.header) : null,
      h('main', { className: 'rr-pageshell__main', key: 'm', id: props.mainId || 'main', tabIndex: -1 }, props.children),
      props.footer ? h('footer', { className: 'rr-pageshell__footer', key: 'f', role: 'contentinfo' }, props.footer) : null
    ]);
  }

  /* ---- Band ----------------------------------------------------------- */

  var BAND_GROUND = { base: '', raised: 'rr-band--raised', sunken: 'rr-band--sunken', brand: 'rr-band--brand', wash: 'rr-band--wash', deep: 'rr-band--deep' };

  /* A product's own page wears its grounds (20-color.md, The three product grounds):
     `product` on a Band sets that product's light ground (on base or wash) or brand
     ground (on brand), with the cut in its colors when `threshold` is on. Never the
     spectrum: that seam belongs to suite surfaces. */
  var PRODUCTS_GROUND = PRODUCT_KEYS_GROUND;

  function Band(props) {
    props = props || {};
    var ground = props.ground || 'base';
    var Tag = props.as || 'section';
    return h(Tag, {
      className: cx('rr-band', BAND_GROUND[ground] || '', props.threshold && 'rr-band--threshold',
                    PRODUCTS_GROUND[props.product] && 'rr-band--product rr-band--p-' + props.product,
                    props.size && 'rr-band--' + props.size, props.grain !== false && ground !== 'base' && 'rr-grain',
                    props.texture && 'rr-tex', props.texture && 'rr-tex--' + props.texture,
                    props.texture && props.textureScale && 'rr-tex--' + props.textureScale,
                    props.texture && props.textureFade !== false && 'rr-tex--fade',
                    props.className),
      'aria-labelledby': props.labelledBy,
      id: props.id
    }, [
      /* On brand, the threshold is the cut the social cards draw: its own layer, because
         the band's ::before already carries the grain. */
      props.threshold && (ground === 'brand' || PRODUCTS_GROUND[props.product])
        ? h('div', { className: cx('rr-band__cut', props.threshold === 'spectrum' && !props.product && 'rr-band__cut--spectrum'), key: 'cut', 'aria-hidden': 'true' },
            props.threshold === 'spectrum' && !props.product ? h('span', { className: 'rr-band__spectrum' }) : null)
        : null,
      h('div', { className: cx('rr-band__rail', props.wide && 'rr-band__rail--wide'), key: 'rail' }, props.children)
    ]);
  }

  /* ---- ThemeSwitch ----------------------------------------------------- */

  /* System, Light, Dark: three icon segments, one radio group. It writes
     data-theme on the document (or `target`), which is all the tokens read.
     System removes a fixed choice and follows prefers-color-scheme, live. It never
     applies anything on mount unless `storageKey` holds a saved choice, so a page
     that set its own theme is not overridden by a control it happens to contain. */

  var THEME_OPTS = [
    { id: 'system', icon: 'monitor', label: 'System' },
    { id: 'light', icon: 'sun', label: 'Light' },
    { id: 'dark', icon: 'moon', label: 'Dark' }
  ];

  function themeTarget(t) {
    if (t) return t;
    return typeof document !== 'undefined' ? document.documentElement : null;
  }
  function systemDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  function applyTheme(el, mode) {
    if (!el) return;
    el.setAttribute('data-theme-mode', mode);
    el.setAttribute('data-theme', mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode);
  }

  function ThemeSwitch(props) {
    props = props || {};
    var labels = props.labels || {};
    var initial = function () {
      if (props.defaultValue) return props.defaultValue;
      var saved = null;
      if (props.storageKey) { try { saved = window.localStorage.getItem(props.storageKey); } catch (e) { saved = null; } }
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
      var el = themeTarget(props.target);
      var m = el && el.getAttribute('data-theme-mode');
      if (m) return m;
      var t = el && el.getAttribute('data-theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    };
    var st = React.useState(initial);
    var mode = props.value !== undefined ? props.value : st[0];
    var name = React.useRef(nextId('rr-theme')).current;

    /* A saved choice applies on mount; nothing else does. */
    React.useEffect(function () {
      if (!props.storageKey) return;
      var saved = null;
      try { saved = window.localStorage.getItem(props.storageKey); } catch (e) { saved = null; }
      if (saved) applyTheme(themeTarget(props.target), saved);
    }, []);

    /* System follows the OS while it is chosen. */
    React.useEffect(function () {
      if (mode !== 'system') return undefined;
      var mq; try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return undefined; }
      var el = themeTarget(props.target);
      function on() { if (el && el.getAttribute('data-theme-mode') === 'system') applyTheme(el, 'system'); }
      if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
      return function () { if (mq.removeEventListener) mq.removeEventListener('change', on); else if (mq.removeListener) mq.removeListener(on); };
    }, [mode]);

    /* Two switches on one page (the header and its mobile drawer) stay in step. */
    React.useEffect(function () {
      var el = themeTarget(props.target);
      if (!el || typeof MutationObserver === 'undefined' || props.value !== undefined) return undefined;
      var ob = new MutationObserver(function () {
        var m = el.getAttribute('data-theme-mode');
        if (m) st[1](m);
      });
      ob.observe(el, { attributes: true, attributeFilter: ['data-theme-mode'] });
      return function () { ob.disconnect(); };
    }, []);

    function choose(id) {
      if (props.value === undefined) st[1](id);
      applyTheme(themeTarget(props.target), id);
      if (props.storageKey) { try { window.localStorage.setItem(props.storageKey, id); } catch (e) { /* private window */ } }
      if (props.onChange) props.onChange(id);
    }
    function onKey(e) {
      var i = THEME_OPTS.map(function (o) { return o.id; }).indexOf(mode);
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = THEME_OPTS[(i + 1) % 3];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = THEME_OPTS[(i + 2) % 3];
      if (next) {
        e.preventDefault(); choose(next.id);
        var btn = e.currentTarget.querySelector('[data-theme-opt="' + next.id + '"]');
        if (btn) btn.focus();
      }
    }

    return h('div', {
      className: cx('rr-theme', props.size === 'sm' && 'rr-theme--sm', props.className),
      role: 'radiogroup', 'aria-label': props.label || 'Theme', onKeyDown: onKey
    }, THEME_OPTS.map(function (o) {
      var on = o.id === mode;
      var text = labels[o.id] || o.label;
      return h('button', {
        type: 'button', key: o.id, role: 'radio', 'aria-checked': String(on), 'aria-label': text, title: text,
        'data-theme-opt': o.id, name: name, tabIndex: on ? 0 : -1,
        className: 'rr-theme__opt', onClick: function () { choose(o.id); }
      }, Icons[o.icon]({ width: 16, height: 16 }));
    }));
  }

  /* ---- SiteHeader ----------------------------------------------------- */

  function SiteHeader(props) {
    props = props || {};
    var sections = (props.sections || []).slice(0, 6);
    var st = React.useState(null); var open = st[0]; var setOpen = st[1];
    var mt = React.useState(false); var menu = mt[0]; var setMenu = mt[1];
    var id = React.useRef(nextId('rr-nav')).current;
    React.useEffect(function () {
      if (typeof document === 'undefined') return;
      function esc(e) { if (e.key === 'Escape') { setOpen(null); setMenu(false); } }
      document.addEventListener('keydown', esc);
      return function () { document.removeEventListener('keydown', esc); };
    }, []);
    function panel(s, i) {
      if (!s.items || !s.items.length) {
        return h('a', { className: 'rr-siteheader__link', key: i, href: s.href }, s.label);
      }
      var isOpen = open === i;
      return h('div', { className: 'rr-siteheader__section', key: i,
        onMouseEnter: function () { setOpen(i); }, onMouseLeave: function () { setOpen(null); } }, [
        h('button', { type: 'button', key: 'b', className: cx('rr-siteheader__link', isOpen && 'rr-siteheader__link--open'),
          'aria-expanded': String(isOpen), 'aria-controls': id + '-' + i,
          onClick: function () { setOpen(isOpen ? null : i); } }, [
          h('span', { key: 'l' }, s.label),
          h('span', { key: 'c', className: cx('rr-siteheader__chev', isOpen && 'rr-siteheader__chev--open') }, Icons.chevronDown({ width: 13, height: 13 }))
        ]),
        h('div', { className: cx('rr-siteheader__panel', isOpen && 'rr-siteheader__panel--open'), key: 'p', id: id + '-' + i, hidden: !isOpen },
          h('ul', { className: 'rr-siteheader__list' }, (s.items || []).map(function (it, j) {
            return h('li', { key: j }, h('a', { className: 'rr-siteheader__item', href: it.href }, [
              h('span', { className: 'rr-siteheader__itemLabel', key: 'l' }, it.label),
              it.detail ? h('span', { className: 'rr-siteheader__itemDetail', key: 'd' }, it.detail) : null
            ]));
          })))
      ]);
    }
    return h('div', { className: cx('rr-siteheader', props.stuck && 'rr-siteheader--stuck', props.className) }, [
      h('a', { className: 'rr-siteheader__mark', key: 'm', href: props.homeHref || '/', 'aria-label': props.homeLabel || 'Redrob, home' },
        props.mark),
      h('nav', { className: 'rr-siteheader__nav', key: 'n', 'aria-label': props.navLabel || 'Main' },
        sections.map(panel)),
      h('div', { className: 'rr-siteheader__end', key: 'e' }, [
        props.theme ? h('span', { key: 't', className: 'rr-siteheader__theme' }, props.theme) : null,
        props.lang ? h('span', { key: 'l', className: 'rr-siteheader__lang' }, props.lang) : null,
        props.action ? h('span', { key: 'a', className: 'rr-siteheader__action' }, props.action) : null,
        h('button', { type: 'button', key: 'b', className: 'rr-siteheader__toggle',
          'aria-expanded': String(menu), 'aria-controls': id + '-m',
          'aria-label': props.menuLabel || 'Menu', onClick: function () { setMenu(!menu); } },
          (menu ? Icons.close : Icons.menu)({ width: 20, height: 20 }))
      ]),
      h('div', { className: cx('rr-siteheader__drawer', menu && 'rr-siteheader__drawer--open'), key: 'd', id: id + '-m', hidden: !menu }, [
        h('ul', { className: 'rr-siteheader__mlist', key: 'l' }, sections.map(function (s, i) {
          return h('li', { key: i, className: 'rr-siteheader__mitem' }, [
            s.href ? h('a', { key: 'a', className: 'rr-siteheader__mlink', href: s.href }, s.label)
                   : h('span', { key: 'a', className: 'rr-siteheader__mlink' }, s.label),
            (s.items || []).length ? h('ul', { key: 'u', className: 'rr-siteheader__msub' }, s.items.map(function (it, j) {
              return h('li', { key: j }, h('a', { href: it.href }, it.label));
            })) : null
          ]);
        })),
        /* The theme travels into the drawer on a phone, where the bar has no room for it. */
        props.theme && menu ? h('div', { key: 't', className: 'rr-siteheader__mtheme' }, [
          h('span', { key: 'l' }, props.themeLabel || 'Theme'), props.theme
        ]) : null
      ])
    ]);
  }

  /* ---- SiteFooter ----------------------------------------------------- */

  function SiteFooter(props) {
    props = props || {};
    var cols = props.columns || [];
    return h('div', { className: cx('rr-sitefooter', props.className) }, [
      h('div', { className: 'rr-sitefooter__top', key: 't' }, [
        h('div', { className: 'rr-sitefooter__brand', key: 'b' }, [
          props.mark ? h('span', { className: 'rr-sitefooter__mark', key: 'm' }, props.mark) : null,
          props.line ? h('p', { className: 'rr-sitefooter__line', key: 'l' }, props.line) : null,
          props.action ? h('div', { className: 'rr-sitefooter__action', key: 'a' }, props.action) : null
        ]),
        h('div', { className: 'rr-sitefooter__cols', key: 'c' }, cols.map(function (col, i) {
          return h('div', { className: 'rr-sitefooter__col', key: i }, [
            h('span', { className: 'rr-sitefooter__colTitle', key: 't' }, col.title),
            h('ul', { className: 'rr-sitefooter__colList', key: 'l' }, (col.items || []).map(function (it, j) {
              /* `divider` starts a second group in the column (the endorsed brands under the
                 suite); `external` marks a link that leaves redrob.io. */
              return h('li', { key: j, className: it.divider ? 'rr-sitefooter__divider' : undefined },
                h('a', { href: it.href, rel: it.external ? 'noopener' : undefined }, [
                  h('span', { key: 't' }, it.label),
                  it.external ? h('span', { key: 'x', className: 'rr-sitefooter__ext', 'aria-label': '(opens another site)' },
                    Icons.external({ width: 12, height: 12, 'aria-hidden': 'true' })) : null
                ]));
            }))
          ]);
        }))
      ]),
      h('div', { className: 'rr-sitefooter__foot', key: 'f' }, [
        h('span', { className: 'rr-sitefooter__legal', key: 'c' }, props.copyright),
        h('ul', { className: 'rr-sitefooter__legalLinks', key: 'l' }, (props.legal || []).map(function (it, j) {
          return h('li', { key: j }, it.onClick
            ? h('button', { type: 'button', className: 'rr-sitefooter__legalBtn', onClick: it.onClick }, it.label)
            : h('a', { href: it.href }, it.label));
        }))
      ])
    ]);
  }

  /* ---- LangSwitch ----------------------------------------------------- */

  function LangSwitch(props) {
    props = props || {};
    var langs = props.langs || [];
    var current = props.current;
    var inlineUpTo = props.inlineUpTo == null ? 3 : props.inlineUpTo;
    var st = React.useState(false); var open = st[0]; var setOpen = st[1];
    var close = React.useCallback(function () { setOpen(false); }, []);
    var ref = useDismiss(open, close);
    var id = React.useRef(nextId('rr-lang')).current;
    var here = null;
    for (var k = 0; k < langs.length; k++) if (langs[k].code === current) here = langs[k];

    function entry(l, i) {
      var on = l.code === current;
      /* href is the SAME page in the other language. A switch that lands on the home page
         is the border this company is named after reversing, so a language with no
         counterpart for this page renders as unavailable, never as a link home. */
      var missing = !l.href;
      var dir = l.dir || (/^(ar|he|fa|ur)\b/.test(l.code || '') ? 'rtl' : undefined);
      return on
        ? h('span', { className: 'rr-lang__on', 'aria-current': 'true', lang: l.code, dir: dir }, l.label)
        : missing
          ? h('span', { className: 'rr-lang__off', lang: l.code, dir: dir,
                        title: props.missingLabel || 'This page is not in ' + l.label + ' yet' }, l.label)
          : h('a', { className: 'rr-lang__link', href: l.href, lang: l.code, hrefLang: l.code, dir: dir,
                     rel: 'alternate', onClick: props.onChange && function () { props.onChange(l); } }, l.label);
    }

    /* Two languages fit on a line. Twelve do not, and a site that will carry twelve should
       not be laid out as though it carries two. Past `inlineUpTo` this becomes a disclosure. */
    if (langs.length > inlineUpTo) {
      /* placement 'up' for a switch at the foot of a sidebar or page; align 'left' when it sits at a left edge. */
      return h('div', { ref: ref, className: cx('rr-lang', 'rr-lang--menu', props.placement === 'up' && 'rr-lang--up', props.align === 'left' && 'rr-lang--left', props.className) }, [
        h('button', { type: 'button', key: 'b', className: 'rr-lang__trigger',
          'aria-expanded': String(open), 'aria-controls': id, 'aria-label': props.label ? props.label + ', ' + ((here && here.label) || '') : undefined,
          onClick: function () { setOpen(!open); } }, [
          h('span', { key: 'i', className: 'rr-lang__icon', 'aria-hidden': 'true' }, Icons.translate({ width: 15, height: 15 })),
          h('span', { key: 'l', lang: here && here.code }, (here && here.label) || props.label || 'Language'),
          h('span', { key: 'c', className: cx('rr-lang__chev', open && 'rr-lang__chev--open') }, Icons.chevronDown({ width: 13, height: 13 }))
        ]),
        h('ul', { className: cx('rr-lang__menu', open && 'rr-lang__menu--open'), key: 'm', id: id, hidden: !open },
          langs.map(function (l, i) {
            return h('li', { key: l.code || i, className: 'rr-lang__row' }, entry(l, i));
          }))
      ]);
    }
    return h('div', { className: cx('rr-lang', props.className) }, [
      h('span', { className: 'rr-lang__icon', key: 'i', 'aria-hidden': 'true' }, Icons.translate({ width: 15, height: 15 })),
      h('ul', { className: 'rr-lang__list', key: 'l', role: 'list' }, langs.map(function (l, i) {
        return h('li', { key: l.code || i, className: 'rr-lang__item' }, entry(l, i));
      }))
    ]);
  }

  /* ---- ConsentBar ----------------------------------------------------- */

  function ConsentBar(props) {
    props = props || {};
    var cats = props.categories || [];
    var st = React.useState(false); var open = st[0]; var setOpen = st[1];
    var pick = React.useState(function () {
      var o = {}; cats.forEach(function (c) { o[c.id] = !!c.required; }); return o;
    });
    var chosen = pick[0], setChosen = pick[1];
    var id = React.useRef(nextId('rr-consent')).current;
    function decide(all) {
      var o = {};
      cats.forEach(function (c) { o[c.id] = c.required ? true : all === null ? !!chosen[c.id] : all; });
      props.onDecide && props.onDecide(o);
    }
    return h('div', { className: cx('rr-consent', props.className), role: 'dialog',
      'aria-label': props.title || 'Cookies', 'aria-describedby': id }, [
      h('div', { className: 'rr-consent__body', key: 'b' }, [
        h('p', { className: 'rr-consent__text', key: 't', id: id }, props.children),
        open
          ? h('ul', { className: 'rr-consent__cats', key: 'c' }, cats.map(function (c, i) {
              return h('li', { className: 'rr-consent__cat', key: c.id || i }, [
                h(Checkbox, { key: 'x', label: c.label, hint: c.detail,
                  checked: c.required ? true : !!chosen[c.id], disabled: !!c.required,
                  onChange: function (e) { var o = {}; for (var k in chosen) o[k] = chosen[k]; o[c.id] = e.target.checked; setChosen(o); } }),
                c.required ? h('span', { className: 'rr-consent__req', key: 'r' }, props.requiredLabel || 'Always on') : null
              ]);
            }))
          : null
      ]),
      h('div', { className: 'rr-consent__actions', key: 'a' }, [
        /* Decline is first and is a real button, not a link in the small print. */
        h(Button, { key: 'n', size: 'sm', variant: 'secondary', onClick: function () { decide(false); } },
          props.declineLabel || 'Only what is needed'),
        open
          ? h(Button, { key: 's', size: 'sm', variant: 'secondary', onClick: function () { decide(null); } },
              props.saveLabel || 'Save my choices')
          : h(Button, { key: 'o', size: 'sm', variant: 'ghost', onClick: function () { setOpen(true); } },
              props.chooseLabel || 'Choose'),
        h(Button, { key: 'y', size: 'sm', onClick: function () { decide(true); } },
          props.acceptLabel || 'Accept all')
      ])
    ]);
  }

  /* ---- Hero ----------------------------------------------------------- */

  /* The film behind a hero. Decorative to a screen reader (the credit line says what it
     is), silent, looping, and never a cost the reader did not choose: it does not play
     under reduced motion, on Save-Data or below 768px, where the poster stands in. A
     film that moves for more than five seconds needs a way to stop it (WCAG 2.2.2), so
     the credit row carries Pause. The row also carries the AI label, which the law in
     all three markets asks for on synthetic video (46-imagery.md). */
  function HeroFilm(props) {
    var film = props.film || {};
    var ref = React.useRef(null);
    var st = React.useState(false); var playing = st[0]; var setPlaying = st[1];
    React.useEffect(function () {
      var v = ref.current;
      if (!v || typeof window === 'undefined') return;
      var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
      var save = navigator.connection && navigator.connection.saveData;
      if (mq('(prefers-reduced-motion: reduce)') || save || mq('(max-width: 767px)')) return;
      var p = v.play();
      if (p && p.then) p.then(function () { setPlaying(true); }).catch(function () {});
    }, []);
    function toggle() {
      var v = ref.current; if (!v) return;
      if (v.paused) { var p = v.play(); if (p && p.then) p.then(function () { setPlaying(true); }).catch(function () {}); }
      else { v.pause(); setPlaying(false); }
    }
    return [
      h('div', { className: 'rr-hero__film', key: 'film', 'aria-hidden': 'true' },
        h('video', { ref: ref, muted: true, loop: true, playsInline: true, preload: 'none',
                     poster: film.poster, disablePictureInPicture: true },
          [film.webm ? h('source', { key: 'w', src: film.webm, type: 'video/webm' }) : null,
           film.src ? h('source', { key: 'm', src: film.src, type: 'video/mp4' }) : null])),
      h('div', { className: 'rr-hero__filmbar', key: 'bar' }, [
        h('span', { className: 'rr-hero__filmcredit', key: 'c' }, film.label || 'AI-generated'),
        h('button', { type: 'button', className: 'rr-hero__filmtoggle', key: 't', onClick: toggle,
                      'aria-label': playing ? (film.pauseLabel || 'Pause the film') : (film.playLabel || 'Play the film') },
          /* An icon, not a word: the control is for the few who need it, and it must not
             compete with the call to action. The hit area stays 44px (::before). */
          h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': 'true', focusable: 'false' },
            playing
              ? [h('rect', { key: 'a', x: 1.5, y: 1, width: 2.2, height: 8, rx: .6, fill: 'currentColor' }),
                 h('rect', { key: 'b', x: 6.3, y: 1, width: 2.2, height: 8, rx: .6, fill: 'currentColor' })]
              : h('path', { d: 'M2.5 1.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86L3.26.77A.5.5 0 0 0 2.5 1.2z', fill: 'currentColor' })))
      ])
    ];
  }

  function Hero(props) {
    props = props || {};
    /* No alignment prop, by design. The heading (Display on the homepage and landing
       pages, a Statement elsewhere) on a wash, nothing in a box, from the left rail. */
    var filmParts = props.film ? h(HeroFilm, { film: props.film, key: 'fp' }) : null;
    return h('div', { className: cx('rr-hero', props.media && !props.film && 'rr-hero--media', props.film && 'rr-hero--film', props.className) }, [
      h('div', { className: 'rr-hero__body', key: 'b' }, [
        props.mark ? h('div', { className: 'rr-hero__mark', key: 'm' }, props.mark) : null,
        h('div', { className: 'rr-hero__statement', key: 's' }, props.children),
        props.lede ? h('p', { className: 'rr-hero__lede', key: 'l' }, props.lede) : null,
        (props.action || props.secondary)
          ? h('div', { className: 'rr-hero__actions', key: 'a' }, [
              props.action ? h('span', { key: 'p' }, props.action) : null,
              /* the second path is a link, never a second button - two equal buttons is
                 the generated hero's own signature */
              props.secondary ? h('a', { key: 's', className: 'rr-hero__second', href: props.secondaryHref || '#' }, [
                h('span', { key: 't' }, props.secondary),
                h('span', { key: 'i', className: 'rr-hero__secondIcon' }, Icons.arrowRight({ width: 15, height: 15 }))
              ]) : null
            ])
          : null,
        props.foot ? h('p', { className: 'rr-hero__foot', key: 'f' }, props.foot) : null,
        filmParts
      ]),
      props.media && !props.film ? h('div', { className: 'rr-hero__media', key: 'm' }, props.media) : null
    ]);
  }


  /* ---- FeatureRow ------------------------------------------------------ */

  function FeatureRow(props) {
    props = props || {};
    /* One subject. Not an array - an array becomes a three-up grid the first time
       somebody passes three, which is the tell 50-not-generated.md names. */
    var flip = (props.index || 0) % 2 === 1;
    return h('div', { className: cx('rr-feature', flip && 'rr-feature--flip', props.bleed && 'rr-feature--bleed', props.className) }, [
      h('div', { className: 'rr-feature__body', key: 'b' }, [
        props.mark ? h('div', { className: 'rr-feature__mark', key: 'm' }, props.mark) : null,
        h('h3', { className: 'rr-feature__title', key: 't' }, props.title),
        props.children ? h('div', { className: 'rr-feature__text', key: 'x' }, props.children) : null,
        props.points && props.points.length
          ? h('ul', { className: 'rr-feature__points', key: 'p' }, props.points.map(function (p, i) {
              return h('li', { key: i }, [
                h('span', { className: 'rr-feature__tick', key: 'i', 'aria-hidden': 'true' }),
                h('span', { key: 't' }, p)
              ]);
            }))
          : null,
        props.action ? h('div', { className: 'rr-feature__action', key: 'a' }, props.action) : null
      ]),
      props.media ? h('div', { className: 'rr-feature__media', key: 'm' }, props.media) : null
    ]);
  }

  /* ---- Figure ---------------------------------------------------------- */

  function Figure(props) {
    props = props || {};
    var ratio = props.ratio || '16 / 10';
    /* No bleed prop here. Running a picture off the page edge needs to know where
       that edge is, which is the row's business, not the figure's: FeatureRow owns
       --rail-inset and bleeds its own media slot. Figure carried a `bleed` prop for
       months that emitted a class no stylesheet ever defined, so it silently did
       nothing. Better no prop than a prop that no-ops. */
    return h('figure', { className: cx('rr-figure', props.className) }, [
      h('div', { className: 'rr-figure__frame', key: 'f', style: { aspectRatio: ratio } },
        props.children || h('img', { src: props.src, srcSet: props.srcSet, alt: props.alt || '', loading: props.eager ? 'eager' : 'lazy', decoding: 'async' })),
      h('figcaption', { className: 'rr-figure__caption', key: 'c' }, [
        h('span', { key: 't' }, props.caption),
        props.credit ? h('span', { className: 'rr-figure__credit', key: 'r' }, props.credit) : null
      ])
    ]);
  }

  /* ---- LogoRow --------------------------------------------------------- */

  function LogoRow(props) {
    props = props || {};
    var logos = props.logos || [];
    return h('div', { className: cx('rr-logorow', props.className) }, [
      /* The number and the period it is measured against. Without them a row of marks is
         decoration, and it is the third beat of the named tell. */
      props.claim ? h('p', { className: 'rr-logorow__claim', key: 'c' }, [
        h('span', { key: 't' }, props.claim),
        props.period ? h('span', { className: 'rr-logorow__period', key: 'p' }, props.period) : null
      ]) : null,
      h('ul', { className: 'rr-logorow__marks', key: 'm', 'aria-label': props.label || 'Customers and partners' }, logos.map(function (l, i) {
        /* scale is an optical correction per mark, measured, not a ranking: a compact
           symbol reads smaller than a long wordmark at the same height (49-optical.md). */
        var img = h('img', { src: l.src, alt: l.alt || l.name || '', loading: 'lazy', decoding: 'async',
                             style: l.scale ? { '--logo-scale': l.scale } : undefined });
        return h('li', { key: l.name || i, className: 'rr-logorow__mark' },
          l.href ? h('a', { href: l.href, rel: 'noreferrer' }, img) : img);
      })),
      props.note ? h('p', { className: 'rr-logorow__note', key: 'n' }, props.note) : null
    ]);
  }

  /* ---- CustomerStory --------------------------------------------------- */

  function CustomerStory(props) {
    props = props || {};
    return h('article', { className: cx('rr-story', props.className) }, [
      h('div', { className: 'rr-story__head', key: 'h' }, [
        props.logo ? h('span', { className: 'rr-story__logo', key: 'l' }, props.logo) : null,
        h('span', { className: 'rr-story__who', key: 'w' }, [
          h('span', { className: 'rr-story__customer', key: 'c' }, props.customer),
          props.sector ? h('span', { className: 'rr-story__sector', key: 's' }, props.sector) : null
        ])
      ]),
      /* The figure carries the story, not the quote. Quote is capped at one per page and
         that cap is load-bearing: an employer often will not consent to being named, and a
         candidate's words are personal data about the person the system decided about. */
      h('div', { className: 'rr-story__figure', key: 'f' }, [
        h('span', { className: 'rr-story__value', key: 'v' }, props.figure),
        h('span', { className: 'rr-story__label', key: 'l' }, props.figureLabel)
      ]),
      props.period ? h('p', { className: 'rr-story__period', key: 'p' }, props.period) : null,
      props.children ? h('div', { className: 'rr-story__body', key: 'b' }, props.children) : null,
      props.quote ? h('div', { className: 'rr-story__quote', key: 'q' }, props.quote) : null,
      props.href
        ? h('a', { className: 'rr-story__more', key: 'm', href: props.href }, [
            h('span', { key: 't' }, props.moreLabel || 'Read the whole story'),
            h('span', { key: 'i', className: 'rr-story__moreIcon' }, Icons.arrowRight({ width: 15, height: 15 }))
          ])
        : null
    ]);
  }

  /* ---- Form ------------------------------------------------------------ */

  function Form(props) {
    props = props || {};
    var state = props.state || 'idle';
    var errors = props.errors || [];
    var sumRef = React.useRef(null);
    var id = React.useRef(nextId('rr-form')).current;
    /* The error summary takes focus. A summary that only renders is a summary a screen
       reader never reaches, which is the most common way a form fails WCAG in practice. */
    React.useEffect(function () {
      if (errors.length && sumRef.current) sumRef.current.focus();
    }, [errors.length]);

    if (state === 'done') {
      return h('div', { className: cx('rr-form', 'rr-form--done', props.className), role: 'status' }, [
        h('span', { className: 'rr-form__doneIcon', key: 'i' }, Icons.success({ width: 22, height: 22 })),
        h('div', { className: 'rr-form__doneBody', key: 'b' }, [
          h('p', { className: 'rr-form__doneTitle', key: 't' }, props.doneTitle || 'Thank you.'),
          h('p', { className: 'rr-form__doneText', key: 'x' }, props.doneText)
        ])
      ]);
    }
    return h('form', {
      className: cx('rr-form', props.className), noValidate: true,
      onSubmit: function (e) { e.preventDefault(); props.onSubmit && props.onSubmit(e); }
    }, [
      props.title ? h('h2', { className: 'rr-form__title', key: 't', id: id + '-t' }, props.title) : null,
      props.description ? h('p', { className: 'rr-form__desc', key: 'd' }, props.description) : null,
      errors.length
        ? h('div', { className: 'rr-form__errors', key: 'e', role: 'alert', tabIndex: -1,
                     ref: function (n) { sumRef.current = n; } }, [
            h('p', { className: 'rr-form__errorsTitle', key: 't' },
              props.errorsTitle || (errors.length === 1 ? 'One thing needs fixing' : errors.length + ' things need fixing')),
            h('ul', { className: 'rr-form__errorsList', key: 'l' }, errors.map(function (er, i) {
              return h('li', { key: i }, er.field
                ? h('a', { href: '#' + er.field }, er.message)
                : h('span', null, er.message));
            }))
          ])
        : null,
      h('div', { className: 'rr-form__fields', key: 'f' }, props.children),
      /* a honeypot, which is the only spam defense that costs a real person nothing */
      h('div', { className: 'rr-form__trap', key: 'h', 'aria-hidden': 'true' },
        h('input', { type: 'text', name: props.trapName || 'company_website', tabIndex: -1, autoComplete: 'off' })),
      props.consent ? h('div', { className: 'rr-form__consent', key: 'c' }, props.consent) : null,
      h('div', { className: 'rr-form__foot', key: 'a' }, [
        h(Button, { key: 's', type: 'submit', size: 'lg', loading: state === 'pending', disabled: state === 'pending' },
          state === 'pending' ? (props.pendingLabel || 'Sending') : (props.submitLabel || 'Send')),
        props.note ? h('span', { className: 'rr-form__note', key: 'n' }, props.note) : null
      ])
    ]);
  }

  /* ---- PriceTable ------------------------------------------------------ */

  function PriceTable(props) {
    props = props || {};
    var plans = props.plans || [];
    var rows = props.rows || [];
    function cell(v) {
      if (v === true) return h('span', { className: 'rr-price__yes', title: 'Included' }, Icons.check({ width: 16, height: 16 }));
      if (v === false || v == null) return h('span', { className: 'rr-price__no', 'aria-label': 'Not included' }, Icons.minus({ width: 16, height: 16 }));
      return h('span', { className: 'rr-price__val' }, v);
    }
    return h('div', { className: cx('rr-price', props.className) }, [
      h('div', { className: 'rr-price__scroll', key: 's' },
        h('table', { className: 'rr-price__table' }, [
          h('thead', { key: 'h' }, h('tr', null, [h('th', { key: '_', scope: 'col' }, props.rowLabel || 'What you get')].concat(
            plans.map(function (p) {
              return h('th', { key: p.id || p.name, scope: 'col' }, h('div', { className: 'rr-price__planCell' }, [
                h('span', { className: 'rr-price__plan', key: 'n' }, p.name),
                /* One price: the one set for the market this page is being read in. Each
                   market's number is set locally and never converted from another - a price
                   converted from somewhere else is on this company's own list of borders. */
                h('p', { className: 'rr-price__price', key: 'p' }, [
                  h('span', { className: 'rr-price__amount', key: 'a' }, p.price),
                  p.per ? h('span', { className: 'rr-price__per', key: 'n' }, p.per) : null
                ]),
                p.detail ? h('span', { className: 'rr-price__detail', key: 'd' }, p.detail) : null,
                p.action ? h('span', { className: 'rr-price__action', key: 'x' }, p.action) : null
              ]));
            })
          ))),
          h('tbody', { key: 'b' }, rows.map(function (r, i) {
            if (r.group) return h('tr', { key: i, className: 'rr-price__groupRow' },
              h('th', { colSpan: plans.length + 1, scope: 'colgroup' }, r.group));
            return h('tr', { key: i }, [
              h('th', { key: '_', scope: 'row' }, [
                h('span', { key: 'l' }, r.label),
                r.detail ? h('span', { className: 'rr-price__rowDetail', key: 'd' }, r.detail) : null
              ])
            ].concat(plans.map(function (p) {
              return h('td', { key: p.id || p.name }, cell((r.values || {})[p.id || p.name]));
            })));
          }))
        ])),
      props.footNote ? h('p', { className: 'rr-price__foot', key: 'f' }, props.footNote) : null
    ]);
  }

  /* ---- ArticleLayout --------------------------------------------------- */

  function ArticleLayout(props) {
    props = props || {};
    /* `story` is the same object the index lists take (PubStory), so a post goes from
       PostList to its page unchanged. Anything passed directly wins over the story. */
    var st = props.story || {};
    var toc = props.contents || [];
    var kicker = props.kicker || st.kind;
    var standfirst = props.standfirst || st.summary;
    var authors = [].concat(props.authors || st.authors || (props.author ? [{ name: props.author, avatar: props.avatar }] : []))
      .map(function (a) { return typeof a === 'string' ? { name: a } : a; })
      .filter(function (a) { return a && a.name; });
    var date = props.date || st.date, dateTime = props.dateTime || st.dateTime;
    var reading = props.reading || st.reading;
    var f = props.finding || st.finding, paper = props.paper || st.paper;
    var faces = authors.filter(function (a) { return a.avatar; });
    function face(a, i) {
      return h('span', { className: 'rr-article__avatar', key: 'a' + i },
        typeof a.avatar === 'string' ? h('img', { src: a.avatar, alt: '', width: 28, height: 28 }) : a.avatar);
    }
    function nameOf(a, i) {
      var n = a.href ? h('a', { href: a.href, className: 'rr-article__author', key: 'n' }, a.name)
                     : h('span', { className: 'rr-article__author', key: 'n' }, a.name);
      return h('span', { key: 'p' + i, className: 'rr-article__person' }, [n,
        a.role ? h('span', { className: 'rr-article__role', key: 'r' }, ', ' + a.role) : null]);
    }
    /* "A", "A and B", "A, B and C" - every author named, none folded into "et al." */
    /* With roles, "A, Role and B, Role" misreads, so people are set apart by a middot. */
    var withRoles = authors.some(function (a) { return a.role; });
    var names = [];
    authors.forEach(function (a, i) {
      if (i > 0) names.push(withRoles ? ' · ' : (i === authors.length - 1 ? ' and ' : ', '));
      names.push(nameOf(a, i));
    });
    return h('article', { className: cx('rr-article', props.className) }, [
      h('header', { className: 'rr-article__head', key: 'h' }, [
        kicker ? h(SectionMark, { key: 'k', label: kicker }) : null,
        /* titleAs: 'h2' where the page's h1 is already set above (a StoryHeader claim). */
        h(props.titleAs || 'h1', { className: 'rr-article__title', key: 't' }, props.title || st.title),
        standfirst ? h('p', { className: 'rr-article__standfirst', key: 's' }, standfirst) : null,
        f ? h('p', { className: 'rr-article__finding', key: 'f' }, [
          h('span', { className: 'rr-article__findingValue', key: 'v' }, f.value),
          h('span', { className: 'rr-article__findingLabel', key: 'l' }, [f.label, f.period ? h('span', { key: 'p', className: 'rr-article__findingPeriod' }, ', ' + f.period) : null])
        ]) : null,
        h('div', { className: 'rr-article__meta', key: 'm' }, [
          authors.length ? h('span', { className: 'rr-article__by', key: 'b' }, [
            faces.length ? h('span', { className: 'rr-article__avatars', key: 'fa', 'aria-hidden': 'true' }, faces.map(face)) : null,
            h('span', { className: 'rr-article__names', key: 'n' }, names)
          ]) : null,
          date ? h('time', { className: 'rr-article__date', key: 'd', dateTime: dateTime }, date) : null,
          reading ? h('span', { className: 'rr-article__reading', key: 'r' }, reading) : null,
          paper ? h('a', { className: 'rr-article__paper', href: paper.href, key: 'pp' }, [
            h('span', { key: 'i', 'aria-hidden': 'true', className: 'rr-article__paperIcon' }, Icons.fileText({ width: 14, height: 14 })),
            paper.label || 'Method and data'
          ]) : null
        ])
      ]),
      toc.length
        ? h('nav', { className: 'rr-article__toc', key: 'c', 'aria-label': props.contentsLabel || 'On this page' }, [
            h('span', { className: 'rr-article__tocTitle', key: 't' }, props.contentsLabel || 'On this page'),
            h('ol', { className: 'rr-article__tocList', key: 'l' }, toc.map(function (t, i) {
              return h('li', { key: i }, h('a', { href: '#' + t.id }, t.label));
            }))
          ])
        : null,
      h('div', { className: 'rr-article__body', key: 'b' }, props.children),
      props.tags && props.tags.length
        ? h('div', { className: 'rr-article__tags', key: 't' }, props.tags.map(function (t, i) {
            return h('a', { key: i, className: 'rr-article__tag', href: t.href }, t.label);
          }))
        : null
    ]);
  }


  /* ==== Publications: Research, News and Blog ============================
     One set of components for all three index pages. The pages differ because their
     stories carry different fields (a finding and authors for Research, a year for News,
     an author and reading time for the Blog), never because a component was told which
     page it is on. There is no `variant` prop anywhere in this block, on purpose.

     The story shape, shared by PostList, NewsSection and IndexHeader's picture:
       { id, href, title, summary, kind, date, dateTime, authors[], reading,
         finding: { value, label, period }, paper: { href, label }, image }            */

  /* A picture with its disclosure. Written once: IndexHeader and NewsSection both use it,
     so a change to the labeling rule is a change in one place. A generated picture that
     omits `label` still says "AI-generated"; only `generated: false` (a photograph or a
     product render) may carry no disclosure, and then `label` is its credit. */
  function pubPicture(img, o) {
    o = o || {};
    var label = img.generated === false ? img.label : (img.label || 'AI-generated');
    var pic = h('picture', { key: 'p' }, [
      img.webp ? h('source', { key: 's', type: 'image/webp', srcSet: img.webp, sizes: o.sizes || '100vw' }) : null,
      h('img', { key: 'i', src: img.src, alt: o.decorative ? '' : (img.alt || ''),
                 loading: o.eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: o.eager ? 'high' : undefined,
                 style: img.position ? { objectPosition: img.position } : undefined })
    ]);
    return h('figure', { className: cx('rr-pubpic', o.className), key: o.key }, [
      o.href
        ? h('a', { className: 'rr-pubpic__frame', href: o.href, tabIndex: -1, 'aria-hidden': 'true', key: 'f' }, pic)
        : h('div', { className: 'rr-pubpic__frame', key: 'f' }, pic),
      (img.caption || label) ? h('figcaption', { className: 'rr-pubpic__caption', key: 'c' }, [
        img.caption ? h('span', { key: 'cap' }, img.caption) : null,
        label ? h('span', { className: 'rr-pubpic__label', key: 'lab' }, label) : null
      ]) : null
    ]);
  }

  function pubYear(p) {
    var m = String(p.dateTime || p.date || '').match(/(\d{4})/);
    return m ? m[1] : '';
  }
  function pubAuthors(a) {
    if (!a) return null;
    a = [].concat(a).map(function (x) { return typeof x === 'string' ? x : (x && x.name); }).filter(Boolean);
    if (!a.length) return null;
    return a.length === 1 ? a[0] : a.length === 2 ? a[0] + ' and ' + a[1] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }

  /* One story. The title is the link; a stretched ::after makes the whole row clickable
     without wrapping a second link (the paper) inside the first. */
  function PubItem(props) {
    var p = props.item, lead = props.lead, H = props.heading || 'h2';
    var meta = [p.kind, p.date, p.reading].filter(Boolean).join(' · ');
    var by = pubAuthors(p.authors);
    var f = p.finding;
    return h('article', { className: cx('rr-pub', lead && 'rr-pub--lead', p.image && lead && 'rr-pub--media') }, [
      lead && p.image ? pubPicture(p.image, { className: 'rr-pub__media', key: 'img', decorative: true, sizes: '(min-width: 1180px) 560px, 100vw' }) : null,
      h('div', { className: 'rr-pub__body', key: 'b' }, [
        meta ? h('p', { className: 'rr-pub__meta', key: 'm' }, p.dateTime && p.date
          ? [p.kind ? p.kind + ' · ' : '', h('time', { key: 't', dateTime: p.dateTime }, p.date), p.reading ? ' · ' + p.reading : '']
          : meta) : null,
        h(H, { className: 'rr-pub__title', key: 't' }, h('a', { className: 'rr-pub__link', href: p.href }, p.title)),
        p.summary ? h('p', { className: 'rr-pub__summary', key: 's' }, p.summary) : null,
        f ? h('p', { className: 'rr-pub__finding', key: 'f' }, [
          h('span', { className: 'rr-pub__findingValue', key: 'v' }, f.value),
          h('span', { className: 'rr-pub__findingLabel', key: 'l' }, [f.label, f.period ? h('span', { key: 'p', className: 'rr-pub__findingPeriod' }, ', ' + f.period) : null])
        ]) : null,
        (by || p.paper) ? h('p', { className: 'rr-pub__foot', key: 'ft' }, [
          by ? h('span', { className: 'rr-pub__by', key: 'by' }, by) : null,
          p.paper ? h('a', { className: 'rr-pub__paper', href: p.paper.href, key: 'pp' }, [
            h('span', { key: 'i', 'aria-hidden': 'true', className: 'rr-pub__paperIcon' }, Icons.fileText({ width: 14, height: 14 })),
            p.paper.label || 'Method and data'
          ]) : null
        ]) : null
      ])
    ]);
  }

  /* ---- IndexHeader ---------------------------------------------------- */

  /* The top of Research, News and Blog: the page's name as the h1, one sentence for what
     is in it, the topics as links, and the page's one picture. */
  function IndexHeader(props) {
    props = props || {};
    var topics = props.topics || [];
    return h('header', { className: cx('rr-indexhead', props.className), lang: props.lang || 'en' }, [
      h('div', { className: 'rr-indexhead__text', key: 't' }, [
        h('h1', { className: 'rr-indexhead__title', key: 'h' }, props.title),
        props.lede ? h('p', { className: 'rr-indexhead__lede', key: 'l' }, props.lede) : null
      ]),
      topics.length
        ? h('nav', { className: 'rr-indexhead__topics', key: 'n', 'aria-label': props.topicsLabel || 'Topics' },
            h('ul', null, topics.map(function (t, i) {
              return h('li', { key: t.label || i },
                h('a', { href: t.href, 'aria-current': t.current ? 'page' : undefined,
                         className: cx('rr-indexhead__topic', t.current && 'is-current') }, t.label));
            })))
        : null,
      props.image ? pubPicture(props.image, { className: 'rr-indexhead__figure', key: 'f', eager: true,
                                              sizes: '(min-width: 1180px) 1180px, 100vw' }) : null
    ]);
  }

  /* ---- PostList -------------------------------------------------------- */

  /* The list under an IndexHeader. The newest story leads, notched; the rest sit on
     hairlines. `group="year"` sets the rest under year headings - the News archive. */
  function PostList(props) {
    props = props || {};
    var yid = React.useRef(nextId('rr-y')).current;
    var items = props.items || [];
    if (!items.length) return null;
    var lead = props.lead === false ? null : items[0];
    var rest = lead ? items.slice(1) : items;
    var grouped = props.group === 'year';
    var groups = [];
    if (grouped) {
      rest.forEach(function (p) {
        var y = pubYear(p), g = groups[groups.length - 1];
        if (!g || g.year !== y) groups.push(g = { year: y, items: [] });
        g.items.push(p);
      });
    }
    function list(arr, H) {
      return h('ul', { className: 'rr-posts__list' }, arr.map(function (p, i) {
        return h('li', { key: p.id || p.href + i, className: 'rr-posts__item' }, h(PubItem, { item: p, heading: H }));
      }));
    }
    return h('div', { className: cx('rr-posts', props.className) }, [
      lead ? h('div', { className: 'rr-posts__lead', key: 'l' }, h(PubItem, { item: lead, lead: true, heading: 'h2' })) : null,
      rest.length
        ? (grouped
            ? h('div', { className: 'rr-posts__groups', key: 'g' }, groups.map(function (g) {
                return h('section', { className: 'rr-posts__group', key: g.year, 'aria-labelledby': yid + '-' + g.year }, [
                  h('h2', { className: 'rr-posts__year', id: yid + '-' + g.year, key: 'y' }, g.year),
                  h('div', { key: 'l' }, list(g.items, 'h3'))
                ]);
              }))
            : h('div', { key: 'r' }, list(rest, 'h2')))
        : null
    ]);
  }

  /* ---- NewsSection ---------------------------------------------------- */

  /* News on the company homepage: a section, not a page. The lead story with its own
     picture beside three dated headlines, and a link to the News page. Laid out across,
     so it never reads as the top of an index page. */
  function NewsSection(props) {
    props = props || {};
    var lead = props.lead;
    var items = (props.items || []).slice(0, 3);
    var headId = React.useRef(props.id ? props.id + '-h' : nextId('rr-news-h')).current;
    return h('section', { className: cx('rr-news', props.className), lang: props.lang || 'en', 'aria-labelledby': headId }, [
      h('div', { className: 'rr-news__head', key: 'h' }, [
        h('h2', { className: 'rr-news__title', id: headId, key: 't' }, props.title || 'News'),
        props.href ? h('a', { className: 'rr-news__all', href: props.href, key: 'a' }, [
          h('span', { key: 't' }, props.allLabel || 'All news'),
          h('span', { key: 'i', className: 'rr-news__allIcon', 'aria-hidden': 'true' }, Icons.arrowRight({ width: 15, height: 15 }))
        ]) : null
      ]),
      h('div', { className: cx('rr-news__body', !(lead && lead.image) && 'rr-news__body--text'), key: 'b' }, [
        lead ? h('article', { className: 'rr-news__lead', key: 'l' }, [
          lead.image ? pubPicture(lead.image, { className: 'rr-news__figure', key: 'f', href: lead.href, decorative: true,
                                                sizes: '(min-width: 1180px) 680px, 100vw' }) : null,
          h('div', { className: 'rr-news__leadText', key: 'x' }, [
            h('p', { className: 'rr-news__meta', key: 'm' }, [lead.kind, lead.date].filter(Boolean).join(' · ')),
            h('h3', { className: 'rr-news__leadTitle', key: 't' }, h('a', { href: lead.href }, lead.title)),
            lead.summary ? h('p', { className: 'rr-news__summary', key: 's' }, lead.summary) : null
          ])
        ]) : null,
        items.length ? h('ol', { className: 'rr-news__list', key: 'r' }, items.map(function (p, i) {
          return h('li', { key: p.id || i, className: 'rr-news__item' }, [
            h('p', { className: 'rr-news__meta', key: 'm' }, [p.kind, p.date].filter(Boolean).join(' · ')),
            h('h3', { className: 'rr-news__itemTitle', key: 't' }, h('a', { href: p.href }, p.title))
          ]);
        })) : null
      ])
    ]);
  }

  /* ==== Company: Milestones, PeopleList ================================== */

  /* ---- Milestones ------------------------------------------------------ */

  /* The company's dated moments, oldest first. Across the rail on a wide screen, each
     year on the raked tick; down the page on a phone. Years only: a month is news, and
     news goes on the News page. The last item is where the company is now. */
  function Milestones(props) {
    props = props || {};
    var items = props.items || [];
    if (!items.length) return null;
    return h('ol', { className: cx('rr-miles', props.className), lang: props.lang || 'en',
                     'aria-label': props.label || 'Milestones', style: { '--rr-miles-n': items.length } },
      items.map(function (m, i) {
        return h('li', { key: m.year + '-' + i, className: cx('rr-miles__item', i === items.length - 1 && 'rr-miles__item--now') }, [
          h('span', { className: 'rr-miles__mark', key: 'k', 'aria-hidden': 'true' }, h('span', { className: 'rr-tick' })),
          h('p', { className: 'rr-miles__year', key: 'y' }, h('time', { dateTime: String(m.year) }, m.year)),
          h('p', { className: 'rr-miles__text', key: 't' }, m.text)
        ]);
      }));
  }

  /* ---- PeopleList ------------------------------------------------------ */

  /* Who runs the company: a name and a title each, on hairlines, in the order given.
     A photograph only where every person has a real one - a row of three faces and two
     initials reads as a ranking. Never a generated portrait (46-imagery.md). */
  function PeopleList(props) {
    props = props || {};
    var people = props.people || [];
    var photos = people.length && people.every(function (p) { return p.photo; });
    return h('ul', { className: cx('rr-people', photos && 'rr-people--photos', props.className), lang: props.lang || 'en',
                     'aria-label': props.label || 'Leadership' },
      people.map(function (p, i) {
        return h('li', { key: p.name || i, className: 'rr-people__item' }, [
          photos ? h('img', { key: 'ph', className: 'rr-people__photo', src: p.photo, alt: '', loading: 'lazy', decoding: 'async' }) : null,
          h('p', { className: 'rr-people__name', key: 'n' },
            p.href ? h('a', { href: p.href }, p.name) : p.name),
          p.title ? h('p', { className: 'rr-people__title', key: 't' }, p.title) : null,
          p.bio ? h('p', { className: 'rr-people__bio', key: 'b' }, p.bio) : null
        ]);
      }));
  }

  /* ---- StoryHeader ----------------------------------------------------- */

  function StoryHeader(props) {
    props = props || {};
    var facts = props.facts || [];
    return h('header', { className: cx('rr-storyhead', props.className) }, [
      h('div', { className: 'rr-storyhead__who', key: 'w' }, [
        props.logo ? h('span', { className: 'rr-storyhead__logo', key: 'l' }, props.logo) : null,
        h('span', { className: 'rr-storyhead__customer', key: 'c' }, props.customer),
        props.sector ? h('span', { className: 'rr-storyhead__sector', key: 's' }, props.sector) : null
      ]),
      h('h1', { className: 'rr-storyhead__claim', key: 'h' }, props.claim),
      facts.length
        ? h('dl', { className: 'rr-storyhead__facts', key: 'f' }, facts.map(function (f, i) {
            return h('div', { key: i, className: 'rr-storyhead__fact' }, [
              h('dt', { key: 'l' }, f.label),
              h('dd', { key: 'v' }, [
                /* The lead figure takes the display cut: set once, never re-rendered,
                   one per page, and at 52px it clears the 40px floor with room. The
                   figures 0 4 6 8 9 are among the glyphs the cut opens, so the number
                   the story is about carries the mark. The rest stay Pretendard. */
                h('span', { className: cx('rr-storyhead__value', i === 0 && 'rr-rake'), key: 'v' }, f.value),
                f.period ? h('span', { className: 'rr-storyhead__period', key: 'p' }, f.period) : null
              ])
            ]);
          }))
        : null
    ]);
  }

  /* ---- LegalDoc -------------------------------------------------------- */

  function LegalDoc(props) {
    props = props || {};
    var sections = props.sections || [];
    return h('div', { className: cx('rr-legal', props.className) }, [
      h('header', { className: 'rr-legal__head', key: 'h' }, [
        h('h1', { className: 'rr-legal__title', key: 't' }, props.title),
        h('p', { className: 'rr-legal__meta', key: 'm' }, [
          props.entity ? h('span', { className: 'rr-legal__entity', key: 'e' }, props.entity) : null,
          props.updated ? h('span', { key: 'u' }, (props.updatedLabel || 'Last changed') + ' ' + props.updated) : null,
          props.effective ? h('span', { key: 'f' }, (props.effectiveLabel || 'In force from') + ' ' + props.effective) : null
        ]),
        props.summary ? h('p', { className: 'rr-legal__summary', key: 's' }, props.summary) : null
      ]),
      sections.length
        ? h('nav', { className: 'rr-legal__toc', key: 'n', 'aria-label': props.contentsLabel || 'Contents' },
            h('ol', { className: 'rr-legal__tocList' }, sections.map(function (s, i) {
              return h('li', { key: i }, h('a', { href: '#' + s.id }, s.title));
            })))
        : null,
      h('div', { className: 'rr-legal__body', key: 'b' }, sections.map(function (s, i) {
        return h('section', { key: s.id || i, id: s.id, className: 'rr-legal__section' }, [
          h('h2', { className: 'rr-legal__h', key: 'h' }, [
            h('span', { className: 'rr-legal__n', key: 'n' }, (i + 1) + '.'),
            h('span', { key: 't' }, s.title)
          ]),
          h('div', { className: 'rr-legal__text', key: 'x' }, s.body)
        ]);
      })),
      props.history && props.history.length
        ? h('section', { className: 'rr-legal__history', key: 'v' }, [
            h('h2', { className: 'rr-legal__h', key: 'h' }, props.historyLabel || 'What has changed'),
            h('ul', { className: 'rr-legal__historyList', key: 'l' }, props.history.map(function (v, i) {
              return h('li', { key: i }, [
                h('span', { className: 'rr-legal__hDate', key: 'd' }, v.date),
                h('span', { key: 'w' }, v.what)
              ]);
            }))
          ])
        : null,
      props.contact ? h('p', { className: 'rr-legal__contact', key: 'c' }, props.contact) : null
    ]);
  }

  /* ==== The borders =====================================================
     Six controls, each at a place where an interface decides who gets to
     use it. They are the most opinionated things in this system on purpose:
     every one of them replaces a pattern that works in one country. */

  function docLocale() {
    if (typeof document === 'undefined') return 'en';
    var el = document.documentElement;
    return (el && el.lang) || 'en';
  }
  function viewerZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; }
  }

  /* ---- Name ---------------------------------------------------------- */

  /* One field. Not First and Last: a Korean name puts the family name first,
     a great many South Indian names are an initial and a given name with no
     family name at all, and some people have one name. W3C says it plainly -
     ask whether you need the parts before you split the field. spellcheck is
     off because a browser underlining somebody's name in red is a small,
     visible way of saying it is wrong. */
  function NameInput(props) {
    props = props || {};
    var autoId = useStableId('rr-name');
    var id = props.id || autoId;
    var v = props.value || {};
    function set(k, val) {
      if (props.onChange) {
        var next = {}; for (var x in v) next[x] = v[x];
        next[k] = val; props.onChange(next, k);
      }
    }
    function field(key, label, auto, hint, required) {
      var fid = id + '-' + key;
      return h('div', { className: 'rr-name__row', key: key },
        Field({ id: fid, label: label, hint: hint, required: required,
                error: props.error && props.error[key] },
          h('input', {
            id: fid, type: 'text',
            className: cx('rr-control', 'rr-control--' + (props.size || 'md')),
            autoComplete: auto,
            spellCheck: 'false',
            autoCorrect: 'off',
            maxLength: 120,
            value: v[key] == null ? '' : v[key],
            disabled: props.disabled,
            'aria-invalid': props.error && props.error[key] ? 'true' : undefined,
            'aria-describedby': (hint || (props.error && props.error[key])) ? fid + '-msg' : undefined,
            onChange: function (e) { set(key, e.target.value); }
          })));
    }
    return h('div', { className: cx('rr-name', props.className) }, [
      field('full', props.label || 'Full name', 'name', props.hint, props.required !== false),
      props.second
        ? field('second', props.secondLabel || 'Name in your own script', 'off',
                props.secondHint || 'Optional. Kept as you write it, and used where the document is in that script.')
        : null,
      props.preferred
        ? field('preferred', props.preferredLabel || 'What should we call you?', 'nickname',
                props.preferredHint || 'Optional. This is what appears in the product.')
        : null
    ]);
  }

  /* ---- Money --------------------------------------------------------- */

  /* Through Intl, which already knows that India groups 2,84,00,000 rather
     than 28,400,000, that Korea groups by ten thousands when it abbreviates,
     and that the won has no decimal places. A hand-rolled formatter gets all
     three wrong, and a hardcoded toFixed(2) renders an amount of won that
     does not exist. */
  function moneyParts(amount, currency, locale, opts) {
    opts = opts || {};
    var o = { style: 'currency', currency: currency };
    /* useGrouping 'always' because compact suppresses grouping by default, and
       ko-KR compact runs four digits before the unit: 2,840만, not 2840만. It
       changes nothing for en-IN 2.8Cr or en-US 28M, which are one digit. */
    if (opts.compact) { o.notation = 'compact'; o.useGrouping = 'always'; }
    /* decimals: false is for a headline figure. It does not round the amount, it
       stops Intl drawing .00 on a whole one. A currency with no minor unit, like
       the won, already has none and is unaffected. */
    if (opts.decimals === false) { o.minimumFractionDigits = 0; o.maximumFractionDigits = 0; }
    /* currencyDisplay is left alone by default. Passed 'narrowSymbol' it would
       render USD as a bare $ to a Korean reader, undoing the disambiguation
       CLDR does for free: ko-KR renders USD as US$ and that is correct. */
    if (opts.display) o.currencyDisplay = opts.display;
    try { return new Intl.NumberFormat(locale, o).formatToParts(amount); }
    catch (e) { return null; }
  }

  function Money(props) {
    props = props || {};
    var locale = props.locale || docLocale();
    var parts = moneyParts(props.amount, props.currency, locale,
      { compact: props.compact, display: props.display, decimals: props.decimals });
    if (!parts) {
      return h('span', { className: cx('rr-money', props.className) },
        String(props.amount) + ' ' + props.currency);
    }
    var kids = parts.map(function (p, i) {
      return h('span', {
        key: i,
        className: p.type === 'currency' ? 'rr-money__sym' : null
      }, p.value);
    });
    return h('span', {
      className: cx('rr-money', props.className),
      lang: props.locale || undefined,
      title: props.title
    }, kids);
  }

  /* ---- ConvertedAmount ----------------------------------------------- */

  /* A converted figure with no rate and no date hides a decision somebody
     made about you, which is the thing this company exists to reverse. So
     the rate, the benchmark it is measured against, any markup over that
     benchmark, and the date it was taken all show. The local amount leads;
     the conversion is the secondary reading, never the other way round. */
  function ConvertedAmount(props) {
    props = props || {};
    var locale = props.locale || docLocale();
    var conv = props.converted || {};
    var rateLine = [];
    if (props.rate != null) {
      /* significant digits, not fraction digits: a won-to-dollar rate is 0.000722
         and four decimal places would round it to 0.0007 */
      var one = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(props.rate);
      rateLine.push('1 ' + props.currency + ' = ' + one + ' ' + conv.currency);
    }
    if (props.benchmark) rateLine.push(props.benchmark);
    if (props.markup != null) {
      var pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(props.markup);
      rateLine.push(pct + ' over it');
    }
    if (props.at) rateLine.push(props.at);
    return h('div', { className: cx('rr-fx', props.className) }, [
      h('span', { className: 'rr-fx__local', key: 'a' },
        h(Money, { amount: props.amount, currency: props.currency, locale: locale,
                   decimals: props.decimals })),
      conv.amount != null
        ? h('span', { className: 'rr-fx__conv', key: 'b' }, [
            h('span', { key: 'e', className: 'rr-fx__eq', 'aria-hidden': 'true' }, '='),
            h(Money, { key: 'm', amount: conv.amount, currency: conv.currency, locale: locale,
                       display: 'code', decimals: props.decimals })
          ])
        : null,
      rateLine.length
        ? h('p', { className: 'rr-fx__rate', key: 'c' }, rateLine.join(' · '))
        : null,
      props.note ? h('p', { className: 'rr-fx__note', key: 'd' }, props.note) : null
    ]);
  }

  /* ---- Timestamp ------------------------------------------------------ */

  /* Stored in UTC, shown in the reader's zone, and always labeled. Seoul is
     UTC+9, Noida is UTC+5:30 and New York moves between -4 and -5, so an
     unlabeled time is wrong for somebody every day of the year, and the half
     hour breaks anything that assumed whole offsets. Two parties in two zones
     get both, because converting one of them away silently is the invisible
     kind of border. */
  function Timestamp(props) {
    props = props || {};
    var locale = props.locale || docLocale();
    var d = props.at instanceof Date ? props.at : new Date(props.at);
    if (isNaN(d.getTime())) return h('span', { className: 'rr-time' }, String(props.at));
    var zone = props.zone || viewerZone();
    var prec = props.precision || 'minute';

    function fmt(tz, withZone) {
      var o = { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' };
      if (prec !== 'date') { o.hour = 'numeric'; o.minute = '2-digit'; }
      if (prec === 'second') o.second = '2-digit';
      if (withZone && prec !== 'date') o.timeZoneName = props.zoneStyle || 'short';
      try { return new Intl.DateTimeFormat(locale, o).format(d); }
      catch (e) { return d.toISOString(); }
    }

    var absolute = fmt(zone, true);
    var text = absolute;
    if (props.relative) {
      var secs = Math.round((d.getTime() - Date.now()) / 1000);
      var units = [['year', 31536000], ['month', 2592000], ['week', 604800],
                   ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
      try {
        var rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        for (var i = 0; i < units.length; i++) {
          if (Math.abs(secs) >= units[i][1] || units[i][0] === 'second') {
            text = rtf.format(Math.round(secs / units[i][1]), units[i][0]);
            break;
          }
        }
      } catch (e) { /* keep the absolute */ }
    }

    var kids = [h('span', { key: 't' }, text)];
    if (props.originZone && props.originZone !== zone) {
      kids.push(h('span', { key: 'o', className: 'rr-time__origin' }, fmt(props.originZone, true)));
    }
    return h('time', {
      className: cx('rr-time', props.className),
      dateTime: d.toISOString(),
      /* the absolute value never leaves, even when the face shows "3 hours ago" */
      title: props.originZone ? absolute + ' · ' + fmt(props.originZone, true) : absolute
    }, kids);
  }

  /* ---- Address -------------------------------------------------------- */

  /* Korea writes an address from the largest thing to the smallest and the
     United States does the inverse, so one field order cannot serve both.
     The schema switches on country, and a country this system has not been
     taught falls back to one textarea, which is what GOV.UK recommends for
     addresses you cannot predict: people paste them. */
  var ADDRESS_SCHEMA = {
    KR: { fields: ['postal', 'level1', 'level2', 'line1', 'line2'],
          labels: { postal: 'Postal code', level1: 'Province or metropolitan city',
                    level2: 'City, county or district', line1: 'Road name and building number',
                    line2: 'Floor, unit, anything else' } },
    IN: { fields: ['line1', 'line2', 'level2', 'level1', 'postal'],
          labels: { line1: 'House or building', line2: 'Street, area or landmark',
                    level2: 'City or town', level1: 'State', postal: 'PIN code' } },
    US: { fields: ['line1', 'line2', 'level2', 'level1', 'postal'],
          labels: { line1: 'Street address', line2: 'Apartment, suite, floor',
                    level2: 'City', level1: 'State', postal: 'ZIP code' } }
  };
  var ADDRESS_AUTO = { line1: 'address-line1', line2: 'address-line2',
                       level2: 'address-level2', level1: 'address-level1', postal: 'postal-code' };
  /* accepted and then tidied, rather than refused: spaces, case and punctuation
     in a postcode are how people actually write them */
  function tidyPostal(s) { return String(s || '').toUpperCase().replace(/[^\w]/g, ''); }

  function AddressInput(props) {
    props = props || {};
    var autoId = useStableId('rr-addr');
    var id = props.id || autoId;
    var v = props.value || {};
    var schema = ADDRESS_SCHEMA[props.country];
    function set(k, val) {
      if (!props.onChange) return;
      var next = {}; for (var x in v) next[x] = v[x];
      next[k] = val; props.onChange(next, k);
    }
    if (!schema) {
      return h('div', { className: cx('rr-addr', props.className) },
        Field({ id: id, label: props.label || 'Address', error: typeof props.error === 'string' ? props.error : undefined,
                hint: props.hint || 'Write it the way it is written where it is. Paste is fine.' },
          h('textarea', {
            id: id, rows: 4, className: 'rr-control rr-textarea',
            autoComplete: 'street-address', spellCheck: 'false',
            value: v.free == null ? '' : v.free,
            onChange: function (e) { set('free', e.target.value); }
          })));
    }
    /* A fieldset, so the group keeps its label and hint; the first field takes the
       component's id, so a Form error link lands on it. */
    return h('fieldset', { className: cx('rr-addr', 'rr-addr--group', props.className) }, [
      h('legend', { key: 'lg', className: 'rr-field__label' }, props.label || 'Address'),
      props.hint ? h('p', { key: 'hn', className: 'rr-field__hint' }, props.hint) : null
    ].concat(
      schema.fields.map(function (k, i) {
        var fid = i === 0 ? id : id + '-' + k;
        return h('div', { className: cx('rr-addr__row', k === 'postal' && 'rr-addr__row--short'), key: k },
          Field({ id: fid, label: schema.labels[k], error: props.error && props.error[k] },
            h('input', {
              id: fid, type: 'text', className: 'rr-control rr-control--md',
              autoComplete: ADDRESS_AUTO[k], spellCheck: 'false',
              inputMode: k === 'postal' ? 'numeric' : undefined,
              value: v[k] == null ? '' : v[k],
              onChange: function (e) { set(k, e.target.value); },
              onBlur: k === 'postal' ? function (e) { set(k, tidyPostal(e.target.value)); } : undefined
            })));
      })));
  }

  /* ---- Phone ---------------------------------------------------------- */

  /* One field and a country, stored as E.164. Not three boxes, not a mask,
     not a regex: a Korean mobile is 010-xxxx-xxxx and loses its leading zero
     internationally, an Indian one is ten digits behind +91, and no single
     pattern covers them. This does the canonical form and says out loud that
     it does not do full validation. */
  var DIAL = { KR: '82', IN: '91', US: '1' };
  function toE164(country, local) {
    var cc = DIAL[country];
    var digits = String(local || '').replace(/\D/g, '');
    if (!cc) return digits ? '+' + digits : '';
    if (digits.charAt(0) === '0') digits = digits.slice(1);   /* the trunk zero never travels */
    return digits ? '+' + cc + digits : '';
  }

  function PhoneInput(props) {
    props = props || {};
    var autoId = useStableId('rr-phone');
    var id = props.id || autoId;
    var v = props.value || {};
    var country = v.country || props.country || 'KR';
    function emit(next) {
      next.e164 = toE164(next.country, next.local);
      if (props.onChange) props.onChange(next);
    }
    return h('div', { className: cx('rr-phone', props.className) },
      Field({ id: id, label: props.label || 'Phone number', hint: props.hint ||
              'Write it the way you would say it. The country code is added for you.',
              error: props.error },
        h('div', { className: 'rr-phone__row' }, [
          h('select', {
            key: 'c', className: 'rr-control rr-control--md rr-phone__country',
            'aria-label': props.countryLabel || 'Country code',
            value: country,
            onChange: function (e) { emit({ country: e.target.value, local: v.local }); }
          }, (props.countries || ['KR', 'IN', 'US']).map(function (c) {
            return h('option', { key: c, value: c }, c + ' +' + (DIAL[c] || ''));
          })),
          h('input', {
            key: 'n', id: id, type: 'tel', className: 'rr-control rr-control--md rr-phone__num',
            autoComplete: 'tel-national', inputMode: 'tel', spellCheck: 'false',
            value: v.local == null ? '' : v.local,
            onChange: function (e) { emit({ country: country, local: e.target.value }); }
          })
        ])));
  }

  /* ==== Charts =========================================================
     The marks follow the rest of the system: square corners, butt caps,
     hairlines rather than a grid, and any diagonal the design puts there on
     the brand's 40 degrees. The second half is the part that is this
     company's: a chart says what is missing from it, what in it is
     estimated, when it was measured and what it leaves out. That is the
     argument the evidence layer already makes about documents, applied to
     numbers. */

  /* Validated with the dataviz validator against white and against
     redrob-black: inside the lightness band, above the chroma floor, worst
     adjacent CVD separation 8.6 light and 11.5 dark, both above the floor of
     8. The order is fixed. A seventh series folds into Other or becomes small
     multiples; it never gets a generated hue. */
  /* The series palette is six tokens, --series-1 through --series-6, and these
     literals are the fallback for a consumer who loads the bundle without the
     token sheet. They duplicated named palette tokens for a while without
     reading them, which meant changing accent-orange-4 in tokens.json left the
     chart on the old value with nothing to catch it. */
  var SERIES_LIGHT = ['#2B52FF', '#AE5100', '#8944FF', '#00864A', '#A31310', '#D2A100'];
  var SERIES_DARK  = ['#2E56F0', '#E17223', '#844BEF', '#239B5B', '#AD251E', '#B08922'];

  function cssVar(name) {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return '';
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    catch (e) { return ''; }
  }

  function isDark() {
    if (typeof document === 'undefined') return false;
    var el = document.documentElement;
    return (el && el.getAttribute('data-theme')) === 'dark';
  }
  function seriesColor(i) {
    var tok = cssVar('--series-' + ((i % 6) + 1));
    if (tok) return tok;
    var p = isDark() ? SERIES_DARK : SERIES_LIGHT;
    return p[i % p.length];
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
    return step * mag;
  }

  function Chart(props) {
    props = props || {};
    var id = React.useRef(nextId('rr-chart')).current;
    var kind = props.kind || 'bar';
    var series = props.series || [];
    var labels = props.labels || [];
    var locale = props.locale || docLocale();
    var hov = React.useState(null);
    var at = hov[0], setAt = hov[1];
    var tv = React.useState(false);
    var table = tv[0], setTable = tv[1];

    var W = 640, H = props.height || 220;
    var PAD = { t: 8, r: 8, b: 26, l: 46 };
    var iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

    var all = [];
    series.forEach(function (s) { (s.values || []).forEach(function (v) { if (v != null) all.push(v); }); });
    var max = props.max != null ? props.max : niceMax(Math.max.apply(null, all.concat([0])));
    var ticks = [0, max / 2, max];
    function fmtNum(v) {
      if (props.format) return props.format(v);
      try { return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v); }
      catch (e) { return String(v); }
    }
    var x = function (i) { return PAD.l + (labels.length < 2 ? iw / 2 : (iw * i) / (labels.length - 1)); };
    var y = function (v) { return PAD.t + ih - (ih * v) / (max || 1); };

    /* Estimated points get the brand rake as a hatch rather than a second hue,
       so an estimate reads as the same series in a different state and never as
       a different thing being measured. */
    var hatch = h('pattern', {
      key: 'p', id: id + '-est', width: 7, height: 7, patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(40)'
    }, [
      h('rect', { key: 'b', width: 7, height: 7, fill: 'var(--surface-base)' }),
      h('rect', { key: 'l', width: 3, height: 7, fill: 'currentColor', opacity: 0.55 })
    ]);

    var marks = [];
    series.forEach(function (s, si) {
      var color = s.color || seriesColor(si);
      var vals = s.values || [];
      var estFrom = s.estimatedFrom == null ? Infinity : s.estimatedFrom;
      if (kind === 'bar') {
        var band = iw / Math.max(labels.length, 1);
        var bw = Math.max(4, (band - 8) / Math.max(series.length, 1) - 2);
        vals.forEach(function (v, i) {
          if (v == null) return;   /* a gap is drawn as a gap, never bridged */
          var bx = PAD.l + band * i + (band - bw * series.length - 2 * (series.length - 1)) / 2 + si * (bw + 2);
          marks.push(h('rect', {
            key: si + '-' + i, x: bx, y: y(v), width: bw, height: Math.max(1, PAD.t + ih - y(v)),
            fill: i >= estFrom ? 'url(#' + id + '-est)' : color,
            color: color,
            stroke: i >= estFrom ? color : 'none', strokeWidth: i >= estFrom ? 1 : 0,
            onMouseEnter: function () { setAt(i); }, onMouseLeave: function () { setAt(null); }
          }));
        });
      } else {
        /* one path per unbroken run, so a missing point leaves a hole */
        var run = [];
        var runs = [];
        vals.forEach(function (v, i) {
          if (v == null) { if (run.length) runs.push(run); run = []; }
          else run.push([x(i), y(v), i]);
        });
        if (run.length) runs.push(run);
        runs.forEach(function (r, ri) {
          var solid = r.filter(function (p) { return p[2] <= estFrom; });
          var est = r.filter(function (p) { return p[2] >= estFrom; });
          function d(pts) { return pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' '); }
          if (solid.length > 1) marks.push(h('path', { key: si + '-s' + ri, d: d(solid), fill: 'none',
            stroke: color, strokeWidth: 2, strokeLinecap: 'butt', strokeLinejoin: 'miter' }));
          if (est.length > 1) marks.push(h('path', { key: si + '-e' + ri, d: d(est), fill: 'none',
            stroke: color, strokeWidth: 2, strokeLinecap: 'butt', strokeDasharray: '5 4' }));
        });
        vals.forEach(function (v, i) {
          if (v == null) return;
          marks.push(h('rect', { key: si + '-m' + i, x: x(i) - 4, y: y(v) - 4, width: 8, height: 8,
            fill: color, stroke: 'var(--surface-base)', strokeWidth: 2 }));
        });
      }
    });

    var gaps = [];
    series.forEach(function (s) { (s.values || []).forEach(function (v, i) { if (v == null && gaps.indexOf(i) === -1) gaps.push(i); }); });

    var honest = [];
    if (props.measuredAt) honest.push('Measured ' + props.measuredAt);
    if (gaps.length) honest.push(gaps.length + (gaps.length === 1 ? ' point missing' : ' points missing') +
      (props.missingNote ? ': ' + props.missingNote : ''));
    if (series.some(function (s) { return s.estimatedFrom != null; })) honest.push('The hatched part is estimated');
    if (props.excluded) honest.push('Leaves out ' + props.excluded);

    return h('figure', { className: cx('rr-chart', props.className) }, [
      props.title ? h('figcaption', { className: 'rr-chart__title', key: 't' }, props.title) : null,
      series.length > 1
        ? h('div', { className: 'rr-chart__legend', key: 'l' }, series.map(function (s, si) {
            return h('span', { key: si, className: 'rr-chart__key' }, [
              h('span', { key: 'm', className: 'rr-chart__swatch',
                style: { background: s.color || seriesColor(si) } }),
              s.name
            ]);
          }))
        : null,
      h('svg', { key: 's', className: 'rr-chart__plot', viewBox: '0 0 ' + W + ' ' + H,
                 role: 'img', 'aria-label': props.alt || props.title }, [
        h('defs', { key: 'd' }, hatch),
        h('g', { key: 'g', className: 'rr-chart__rules' }, ticks.map(function (t, i) {
          return h('g', { key: i }, [
            h('line', { key: 'l', x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }),
            h('text', { key: 't', x: PAD.l - 8, y: y(t) + 4, textAnchor: 'end' }, fmtNum(t))
          ]);
        })),
        h('g', { key: 'm' }, marks),
        h('g', { key: 'x', className: 'rr-chart__xlab' }, labels.map(function (lb, i) {
          var band = iw / Math.max(labels.length, 1);
          var cx2 = kind === 'bar' ? PAD.l + band * i + band / 2 : x(i);
          return h('text', { key: i, x: cx2, y: H - 8, textAnchor: 'middle',
            className: at === i ? 'rr-chart__xlab--on' : null }, lb);
        }))
      ]),
      honest.length
        ? h('p', { className: 'rr-chart__honest', key: 'h' }, honest.join(' · '))
        : null,
      h('button', { key: 'b', type: 'button', className: 'rr-chart__table-toggle',
        'aria-expanded': String(table), onClick: function () { setTable(!table); } },
        table ? (props.hideTableLabel || 'Hide the figures') : (props.tableLabel || 'Show the figures')),
      table
        ? h('div', { key: 'tb', className: 'rr-chart__table' },
            h(Table, {
              columns: [{ key: 'l', header: props.labelHeader || '', grow: true }].concat(
                series.map(function (s, si) { return { key: 's' + si, header: s.name || 'Series ' + (si + 1), align: 'right' }; })),
              rows: labels.map(function (lb, i) {
                var row = { id: i, l: lb };
                series.forEach(function (s, si) {
                  var v = (s.values || [])[i];
                  row['s' + si] = v == null ? '-' : fmtNum(v);
                });
                return row;
              }), dense: true }))
        : null
    ]);
  }

  function Sparkline(props) {
    props = props || {};
    var vals = (props.values || []).filter(function (v) { return v != null; });
    if (vals.length < 2) return null;
    var W = 96, H = 24;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = (hi - lo) || 1;
    var pts = (props.values || []).map(function (v, i) {
      if (v == null) return null;
      return [(W * i) / ((props.values.length - 1) || 1), H - 2 - ((H - 4) * (v - lo)) / span];
    });
    var runs = [], run = [];
    pts.forEach(function (p) { if (!p) { if (run.length) runs.push(run); run = []; } else run.push(p); });
    if (run.length) runs.push(run);
    return h('svg', { className: cx('rr-spark', props.className), viewBox: '0 0 ' + W + ' ' + H,
                      role: 'img', 'aria-label': props.alt || 'Trend' },
      runs.map(function (r, i) {
        return h('path', { key: i, fill: 'none', stroke: props.color || 'currentColor', strokeWidth: 2,
          strokeLinecap: 'butt', strokeLinejoin: 'miter',
          d: r.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') });
      }));
  }

  /* ==== Illustration ====================================================
     Two registers, and they do different jobs.

     CONSTRUCTIONS are built only from the mark's own geometry - planes raked
     at 40 degrees, a threshold, light entering from one edge. Nothing in them
     is invented, so they compose and they cannot drift. They carry section
     openers, covers and campaign surfaces.

     OBJECTS are the icon vocabulary at illustration scale - a door, a bridge,
     a page nobody can read. Same butt caps, same miter joins, same 40 degree
     diagonals, one square corner. They carry empty states, failures and the
     first time somebody sees a thing.

     Two values and the blue. No people, no gradient blobs, no isometric
     three-quarter view, no drop shadow. 50-not-generated.md says what this
     system will not look like; this is the other half of that sentence. */

  var RK = 0.8391;   /* tan 40, the same number the tick and the gradients use */

  function ill(kids, opts) {
    opts = opts || {};
    return function (p) {
      p = p || {};
      return h('svg', Object.assign({
        viewBox: '0 0 160 120', fill: 'none',
        stroke: 'currentColor', strokeWidth: 3,
        strokeLinecap: 'butt', strokeLinejoin: 'miter',
        role: p.alt ? 'img' : 'presentation',
        'aria-hidden': p.alt ? undefined : 'true',
        'aria-label': p.alt
      }, p), kids);
    };
  }
  var A = function (n, o, k) { return h(n, Object.assign({ key: k }, o)); };
  var ACC = 'var(--ink-brand)';
  var TINT = 'var(--surface-brand-subtle)';

  var Illustrations = {

    /* --- Constructions ------------------------------------------------ */

    /* A ground with one raked edge, and the light on the far side of it. The
       whole identity in four lines. */
    threshold: ill([
      A('path', { d: 'M20 104 L120 20 H140 V104 Z', fill: TINT, stroke: 'none' }, 'a'),
      A('rect', { x: 20, y: 20, width: 120, height: 84, fill: 'none', stroke: 'currentColor' }, 'b'),
      A('path', { d: 'M20 104 L120 20', stroke: ACC }, 'c')
    ]),

    /* Three faces, each sheared to the rake, stepping open. The gateway read
       abstractly: a thing that has been opened rather than one that guards. */
    layers: ill([
      A('path', { d: 'M24 100 L24 46 L48 26 L48 80 Z', fill: TINT, stroke: 'currentColor' }, 'a'),
      A('path', { d: 'M64 100 L64 38 L88 18 L88 80 Z', fill: 'none', stroke: 'currentColor' }, 'b'),
      A('path', { d: 'M104 100 L104 46 L128 26 L128 80 Z', fill: 'none', stroke: ACC }, 'c'),
      A('line', { x1: 14, y1: 100, x2: 146, y2: 100 }, 'd')
    ]),

    /* Light leaving a doorway along the brand's angle. One square corner on
       the opening, three cut - the icon rule, at size. */
    opening: ill([
      A('path', { d: 'M40 104 V34 H88 L100 46 V104', fill: TINT, stroke: 'currentColor' }, 'a'),
      A('line', { x1: 20, y1: 104, x2: 146, y2: 104 }, 'b'),
      A('path', { d: 'M100 62 L134 34', stroke: ACC }, 'c'),
      A('path', { d: 'M100 78 L142 44', stroke: ACC }, 'd'),
      A('path', { d: 'M100 94 L138 63', stroke: ACC, opacity: 0.45 }, 'e')
    ]),

    /* A boundary, and one line that does not stop at it. */
    reach: ill([
      A('line', { x1: 76, y1: 12, x2: 76, y2: 108, strokeWidth: 4 }, 'a'),
      A('path', { d: 'M22 84 H68 M22 62 H68', stroke: 'currentColor', opacity: 0.4 }, 'b'),
      A('path', { d: 'M22 40 H110', stroke: 'currentColor' }, 'c'),
      A('path', { d: 'M110 40 L140 15', stroke: ACC }, 'd')
    ]),

    /* --- Objects ------------------------------------------------------- */

    /* A door standing open, with what is through it on the floor. */
    door: ill([
      A('path', { d: 'M34 104 V26 H84 V104', fill: 'none', stroke: 'currentColor' }, 'a'),
      A('path', { d: 'M84 104 V26 L124 14 V104 Z', fill: TINT, stroke: 'currentColor' }, 'b'),
      A('line', { x1: 18, y1: 104, x2: 146, y2: 104 }, 'c'),
      A('path', { d: 'M34 104 L62 80', stroke: ACC }, 'd'),
      A('circle', { cx: 92, cy: 66, r: 3, fill: 'currentColor', stroke: 'none' }, 'e')
    ]),

    /* Stopped here, on purpose. The moment a run reaches something that leaves
       the building and waits: the most distinctive thing the product does. */
    waiting: ill([
      A('rect', { x: 20, y: 46, width: 42, height: 42, fill: TINT, stroke: 'currentColor' }, 'a'),
      A('path', { d: 'M86 104 L118 16', stroke: ACC, strokeWidth: 6 }, 'b'),
      A('rect', { x: 120, y: 46, width: 26, height: 42, fill: 'none', stroke: 'currentColor',
                  opacity: 0.32, strokeDasharray: '5 4' }, 'c'),
      A('path', { d: 'M66 67 H80', stroke: 'currentColor' }, 'd')
    ]),

    /* A page with nothing readable on it. For the two files in every run that
       turn out to be scans. */
    unreadable: ill([
      A('path', { d: 'M42 14 H104 L120 30 V106 H42 Z', fill: 'none', stroke: 'currentColor' }, 'a'),
      A('path', { d: 'M104 14 V30 H120', fill: 'none', stroke: 'currentColor' }, 'b'),
      A('path', { d: 'M56 52 H92 M56 68 H104 M56 84 H80', stroke: 'currentColor', opacity: 0.28 }, 'c'),
      A('path', { d: 'M46 96 L116 34', stroke: ACC }, 'd')
    ]),

    /* Nothing here yet, and the shape of what would be. */
    nothingYet: ill([
      A('path', { d: 'M22 100 V38 H62 L72 50 H138 V100 Z', fill: 'none', stroke: 'currentColor' }, 'a'),
      A('path', { d: 'M40 76 H92', stroke: ACC }, 'b'),
      A('path', { d: 'M66 62 V90', stroke: ACC }, 'c'),
      A('path', { d: 'M108 68 H122 M108 84 H122', stroke: 'currentColor', opacity: 0.25 }, 'd')
    ])
  };

  var CONSTRUCTIONS = ['threshold', 'layers', 'opening', 'reach'];

  function Illustration(props) {
    props = props || {};
    var Art = Illustrations[props.name];
    if (!Art) return null;
    var size = props.size || 'md';
    return h('span', {
      className: cx('rr-ill', 'rr-ill--' + size,
        CONSTRUCTIONS.indexOf(props.name) === -1 ? 'rr-ill--object' : 'rr-ill--construction',
        props.className),
      style: props.style
    }, Art({ alt: props.alt, width: '100%', height: '100%' }));
  }

  /* ---- Mark ---------------------------------------------------------- */

  /* The lockup, and the swap that keeps it legible on both grounds. This was four
     copies of the same eight lines in four previews, and the first product screen
     that hand-rolled its own chrome forgot the swap and lost the wordmark in dark.
     Pass both files; the component owns which one shows. */
  function Mark(props) {
    props = props || {};
    var px = props.height || 22;
    /* height only. An inline `display` here beats the stylesheet's `display: none`
       and both lockups render at once, which is how this first shipped. */
    var box = { height: px + 'px', width: 'auto' };
    /* tone overrides the theme for a panel whose ground does not follow it: a
       dark band on the light page, a light card on the dark one. Leave it off
       and the lockup follows data-theme, which is right nearly everywhere. */
    return h('span', { className: cx('rr-mark', props.className),
                       'data-tone': props.tone === 'light' || props.tone === 'dark' ? props.tone : undefined }, [
      h('img', { key: 'l', className: 'rr-mark__light', src: props.src,
                 alt: props.alt == null ? 'Redrob' : props.alt, style: box }),
      props.darkSrc
        ? h('img', { key: 'd', className: 'rr-mark__dark', src: props.darkSrc,
                     alt: '', 'aria-hidden': 'true', style: box })
        : null
    ]);
  }

  /* ---- AppShell ------------------------------------------------------ */

  /* The frame a product screen lives in. PageShell is the website's; this is the
     other one, and until a real Cowork screen was built there was no other one, so
     eighteen agent surfaces had nowhere to sit and the first screen hand-rolled
     forty lines of chrome. Three regions: nav on the left, the work in the middle,
     context on the right. The rail is optional and drops first. */
  function AppShell(props) {
    props = props || {};
    var nav = props.nav || [];
    var railId = 'rr-shell-rail';
    /* The product's light, entering from the top of the sidebar where its name sits
       (20-color.md). The attribute is all the component knows; the colors are the
       product-<p>-wash tokens, mapped in bundle.css. The name itself stays ink. */
    var pkey = props.product ? String(props.product).toLowerCase().replace(/^redrob\s+/, '').replace(/\s+/g, '-') : null;
    if (pkey && !PRODUCT_KEY_RE.test(pkey)) pkey = null;
    /* Folding: the sidebar becomes a tray of icons. Remembered per browser when uncontrolled. */
    var foldControlled = props.collapsed !== undefined;
    var fs = React.useState(function () {
      if (props.defaultCollapsed !== undefined) return !!props.defaultCollapsed;
      try { return window.localStorage.getItem('rr-shell-folded') === '1'; } catch (e) { return false; }
    });
    var folded = !!props.collapsible && (foldControlled ? !!props.collapsed : fs[0]);
    function toggleFold() {
      var next = !folded;
      if (!foldControlled) { fs[1](next); try { window.localStorage.setItem('rr-shell-folded', next ? '1' : '0'); } catch (e) {} }
      if (props.onCollapsedChange) props.onCollapsedChange(next);
    }
    return h('div', { className: cx('rr-shell', !props.rail && 'rr-shell--norail', folded && 'rr-shell--folded', props.className),
                      'data-product': pkey || undefined }, [
      h('a', { key: 'skip', className: 'rr-shell__skip', href: '#rr-shell-main' }, props.skipLabel || 'Skip to the work'),

      h('div', { className: 'rr-shell__side', key: 'side', id: 'rr-shell-side' }, [
        h('div', { className: 'rr-shell__brand', key: 'b' }, [
          /* through Mark, so the lockup follows the theme. A bare img here is how the
             first screen lost its wordmark in dark. */
          h(Mark, { key: 'm', height: 20, src: props.mark, darkSrc: props.markDark,
                    alt: props.product ? 'Redrob ' + props.product : 'Redrob' }),
          props.product ? h('span', { className: 'rr-shell__product', key: 'p' }, props.product) : null,
          props.symbol ? h('img', { className: 'rr-shell__symbol', key: 's', src: props.symbol, alt: props.product ? 'Redrob ' + props.product : 'Redrob', width: 24, height: 24 }) : null,
          props.collapsible ? h('button', { key: 'f', type: 'button', className: 'rr-shell__fold', onClick: toggleFold,
            'aria-expanded': folded ? 'false' : 'true', 'aria-controls': 'rr-shell-side',
            'aria-label': folded ? (props.expandLabel || 'Open the menu') : (props.collapseLabel || 'Fold the menu'),
            title: folded ? (props.expandLabel || 'Open the menu') : (props.collapseLabel || 'Fold the menu') },
            Icons.sidebar({ width: 16, height: 16, 'aria-hidden': 'true' })) : null
        ]),
        nav.length
          ? h('nav', { className: 'rr-shell__nav', key: 'n', 'aria-label': props.navLabel || 'Sections' },
              nav.map(function (it, i) {
                /* A heading item names a group: the links after it belong to it. */
                if (it.heading) return h('span', { key: 'h' + i, className: 'rr-shell__navhead', role: 'presentation' }, it.heading);
                return h('a', {
                  key: it.id != null ? it.id : i,
                  href: it.href || '#',
                  className: it.icon ? undefined : 'rr-shell__navitem--text',
                  title: folded && typeof it.label === 'string' ? it.label + (it.meta != null && it.meta !== '' ? ' (' + it.meta + ')' : '') : undefined,
                  'aria-current': it.current ? 'page' : undefined
                }, [
                  it.icon ? h('span', { className: 'rr-shell__navicon', key: 'i' }, it.icon) : null,
                  h('span', { className: 'rr-shell__navlabel', key: 'l' }, it.label),
                  it.meta ? h('span', { className: 'rr-shell__navmeta', key: 'm' }, it.meta) : null
                ]);
              }))
          : null,
        props.aside ? h('div', { className: 'rr-shell__aside', key: 'a' }, props.aside) : null,
        props.theme ? h('div', { className: 'rr-shell__theme', key: 'th' }, props.theme) : null
      ]),

      /* <main> holds the heading too, so the skip link lands on the page's one h1. */
      h('main', { className: 'rr-shell__main', key: 'main', id: 'rr-shell-main', tabIndex: -1 }, [
        (props.title || props.actions || props.meta)
          ? h('header', { className: 'rr-shell__top', key: 't' }, [
              h('div', { className: 'rr-shell__heading', key: 'h' }, [
                props.title ? h('h1', { className: 'rr-shell__title', key: 'a' }, props.title) : null,
                props.meta ? h('p', { className: 'rr-shell__meta', key: 'b' }, props.meta) : null
              ]),
              props.actions ? h('div', { className: 'rr-shell__actions', key: 'a' }, props.actions) : null
            ])
          : null,
        h('div', {
          className: cx('rr-shell__work', props.measure === false && 'rr-shell__work--full'),
          key: 'w'
        }, props.children),
        props.foot ? h('div', { className: 'rr-shell__foot', key: 'f' }, props.foot) : null
      ]),

      props.rail
        ? h('aside', { className: 'rr-shell__rail', key: 'rail', id: railId,
                       'aria-label': props.railLabel || 'About this run' }, props.rail)
        : null
    ]);
  }

  /* ---- Diagram -------------------------------------------------------
     A process drawn as a process. Shape says what a step is, ground says who
     acts, and nothing carries an arrowhead: direction comes from reading
     order and from the tick at each junction, which is the same 40 degree
     mark the section heads use. See 47-illustration.md. */

  var DIAGRAM_BY = { person: 'rr-dia__step--person', machine: 'rr-dia__step--machine',
                     system: 'rr-dia__step--system', decision: 'rr-dia__step--decision' };
  var DIAGRAM_LANE = { person: 'A person', machine: 'The machine', system: 'The system',
                       decision: 'A person' };

  function Diagram(props) {
    props = props || {};
    var steps = props.steps || [];
    var lanes = !!props.lanes;
    var flow = props.orientation !== 'stack';
    var titleId = React.useRef(nextId('rr-dia')).current;

    // Two lanes only, and only the two that matter: who acted. A third lane is
    // an org chart wearing a process diagram's clothes.
    var laneOf = function (st) { return st.by === 'machine' || st.by === 'system' ? 1 : 0; };
    var laneNames = [props.laneLabels && props.laneLabels[0] || 'Person',
                     props.laneLabels && props.laneLabels[1] || 'Machine'];

    var items = steps.map(function (st, i) {
      var style = lanes ? { gridColumn: String(i + 2), gridRow: String(laneOf(st) + 1) } : null;
      return h('li', {
        key: i,
        className: cx('rr-dia__step', DIAGRAM_BY[st.by] || DIAGRAM_BY.person,
                      st.state && 'rr-dia__step--' + st.state),
        style: style
      }, [
        h('span', { key: 'q', className: 'rr-dia__seq', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { key: 'l', className: 'rr-dia__label' }, st.label),
        st.note ? h('span', { key: 'n', className: 'rr-dia__note' }, st.note) : null,
        lanes ? null : h('span', { key: 'w', className: 'rr-dia__who' }, DIAGRAM_LANE[st.by] || DIAGRAM_LANE.person)
      ]);
    });

    var laneRails = lanes ? laneNames.map(function (n, i) {
      return h('div', { key: 'lane' + i, className: 'rr-dia__lane', 'aria-hidden': 'true',
                        style: { gridColumn: '1', gridRow: String(i + 1) } }, n);
    }) : [];

    return h('figure', {
      className: cx('rr-dia', flow ? 'rr-dia--flow' : 'rr-dia--stack',
                    lanes && 'rr-dia--lanes', props.className),
      role: 'group', 'aria-labelledby': props.title ? titleId : undefined
    }, [
      props.title ? h('figcaption', { key: 't', className: 'rr-dia__title', id: titleId }, props.title) : null,
      h('ol', {
        key: 's', className: 'rr-dia__steps',
        style: lanes ? { gridTemplateColumns: 'auto repeat(' + steps.length + ', minmax(0, 1fr))' } : null
      }, laneRails.concat(items)),
      props.source ? h('p', { key: 'src', className: 'rr-dia__source' }, props.source) : null
    ]);
  }

  /* ---- Display: the rake, inside the letterforms ----------------------
     Pretendard ExtraBold with the counter of every enclosing letter opened on
     the 40 degree axis. The letters that trap something are the only ones
     touched, and they all open the same way out. 30-typography.md has the
     argument; the floor is 40px and there is no small size on this face. */

  function Display(props) {
    props = props || {};
    var lvl = props.level === 3 ? 3 : props.level === 2 ? 2 : 1;
    var Tag = props.as || 'p';
    return h(Tag, {
      className: cx('rr-rake', 'rr-rake--' + lvl, props.className),
      lang: props.lang, id: props.id
    }, props.children);
  }

  /* ---- Layer: the strata ---------------------------------------------
     Depth by ground, never by shadow. The surface is the claim, one down is
     the evidence, two down is the source, and there is no third - a fourth
     ground would be a distinction nobody can see, and the ladder is only
     4.5 L* per step as it is. Nesting past two stays at two and says so. */

  /* Guarded: the bundle is a classic script and must not throw at load time on
     a React that predates context or on a partial build. Without context the
     component still works, it just cannot infer depth from nesting. */
  var LayerCtx = React.createContext ? React.createContext(0) : null;
  var LAYER_MEANS = ['the claim', 'the evidence', 'the source'];

  function Layer(props) {
    props = props || {};
    var parent = LayerCtx && React.useContext ? React.useContext(LayerCtx) : 0;
    var want = typeof props.depth === 'number' ? props.depth : parent + 1;
    var depth = Math.max(0, Math.min(2, want));
    if (want > 2 && typeof console !== 'undefined' && console.warn) {
      console.warn('[Redrob] Layer nested to ' + want + '. The strata stop at 2 (' +
                   LAYER_MEANS[2] + '); this one is held there. See 40-surfaces-and-motion.md.');
    }
    var Tag = props.as || 'div';
    var el = h(Tag, {
      className: cx('rr-strata', props.className),
      'data-layer': String(depth),
      id: props.id
    }, props.children);
    return LayerCtx ? h(LayerCtx.Provider, { value: depth }, el) : el;
  }


  /* =====================================================================
     How Cowork works for you. Redrob Auto lives in ModelPicker; these are
     the other things Cowork does for every message (privacy, memory, Plan
     or Run, and Cross-check), and the receipts it leaves in the chat. Two
     rules run through all of them: nothing happens while a person types
     (every check runs after Send), and the product speaks in plain words.
     The feature names (AI Firewall, Multi-Model Memory, Multi-Model
     Crosscheck, Expert Match) are for the website, admin settings and
     sales, never for a label in the chat, where the check is Cross-check,
     made of Fact check and Challenge.
     ===================================================================== */

  /* ---- ComposerStatus -------------------------------------------------- */

  /* The line under the composer, read like a laptop's security status: a
     name, a state and, where there is one, a level. Each item opens a panel
     above the composer. It changes nothing while you type. */

  function StatusBars(props) {
    var n = props.n || 0, of = props.of || 3;
    var bars = [];
    for (var i = 0; i < of; i++) bars.push(h('i', { key: i, 'data-on': String(i < n) }));
    return h('span', { className: cx('rr-bars', props.tone && 'rr-bars--' + props.tone, props.className), 'aria-hidden': 'true' }, bars);
  }

  function ComposerStatus(props) {
    props = props || {};
    var items = (props.items || []).filter(Boolean);
    var so = React.useState(props.defaultOpen || null);
    var open = props.open !== undefined ? props.open : so[0];
    function set(v) { if (props.open === undefined) so[1](v); if (props.onOpenChange) props.onOpenChange(v); }
    var close = React.useCallback(function () { set(null); }, [props.open]);
    var ref = useDismiss(!!open, close);
    var cur = items.filter(function (x) { return x.id === open; })[0];
    return h('div', { className: cx('rr-cstatus', props.className), ref: ref, role: 'group', 'aria-label': props.label || 'How this chat is handled' }, [
      h('div', { key: 'r', className: 'rr-cstatus__row' }, items.map(function (x) {
        return h('button', {
          key: x.id, type: 'button', className: cx('rr-cstatus__item', 'rr-cstatus__item--' + (x.tone || 'plain')),
          'aria-expanded': String(open === x.id), 'aria-haspopup': x.panel ? 'dialog' : undefined,
          onClick: function () { if (x.panel) set(open === x.id ? null : x.id); else if (x.onClick) x.onClick(); }
        }, [
          x.icon ? h('span', { key: 'i', className: 'rr-cstatus__icon', 'aria-hidden': 'true' }, x.icon) : null,
          h('span', { key: 'n', className: 'rr-cstatus__name' }, x.name),
          h('span', { key: 'v', className: 'rr-cstatus__value' }, x.value),
          x.level ? h(StatusBars, { key: 'b', n: x.level.n, of: x.level.of, tone: x.tone }) : null,
          x.live ? h('span', { key: 'l', className: 'rr-live', title: x.live }, h('span', { className: 'rr-visually-hidden' }, x.live)) : null
        ]);
      })),
      cur && cur.panel ? h('div', { key: 'p', className: 'rr-cstatus__panel', role: 'dialog', 'aria-label': cur.panelLabel || cur.name }, cur.panel) : null
    ]);
  }

  /* ---- ProtectionStatus ------------------------------------------------------ */

  /* The one sentence a person needs about a protection, large, with whether
     it is running. Heads a panel or a page. */

  function ProtectionStatus(props) {
    props = props || {};
    return h('div', { className: cx('rr-scard', 'rr-scard--' + (props.tone || 'safe'), props.size === 'lg' && 'rr-scard--lg', props.className) }, [
      props.icon ? h('span', { key: 'i', className: 'rr-scard__icon', 'aria-hidden': 'true' }, props.icon) : null,
      h('div', { key: 't', className: 'rr-scard__text' }, [
        h(props.as || 'p', { key: 'h', className: 'rr-scard__title' }, props.title),
        props.children || props.live ? h('p', { key: 's', className: 'rr-scard__sub' }, [
          props.live ? h('span', { key: 'l', className: 'rr-live rr-live--inline', 'aria-hidden': 'true' }) : null,
          props.live ? h('span', { key: 'lt' }, props.live + (props.children ? '. ' : '')) : null,
          props.children
        ]) : null
      ])
    ]);
  }

  /* ---- PrivacyProtection ----------------------------------------------- */

  var PRIVACY_LEVELS = [
    { id: 'standard', label: 'Standard', n: 1, detail: 'ID, bank and card numbers are left out.' },
    { id: 'high', label: 'High', n: 2, detail: 'Standard, plus names, phone numbers, emails, clients and projects are swapped for placeholders.' },
    { id: 'strict', label: 'Strict', n: 3, detail: 'High, plus addresses, amounts and dates.' }
  ];

  function PrivacyLevels(props) {
    var levels = props.levels || PRIVACY_LEVELS;
    return h('div', { className: 'rr-privacy__levels', role: 'list', 'aria-label': props.label || 'Protection levels' }, levels.map(function (l) {
      var on = l.id === props.level;
      return h('div', { key: l.id, role: 'listitem', className: 'rr-privacy__level', 'data-on': String(on) }, [
        h('div', { key: 'h', className: 'rr-privacy__levelhead' }, [
          h(StatusBars, { key: 'b', n: l.n, of: levels.length, tone: 'safe' }),
          h('b', { key: 'l' }, l.label),
          on ? h('span', { key: 'c', className: 'rr-privacy__yours' }, props.yoursLabel || 'Your level') : null
        ]),
        h('p', { key: 'p' }, l.detail)
      ]);
    }));
  }

  /* What privacy protection is doing, for someone who has never heard the
     word "firewall": on or off, at what level, running where, and what it
     did last. The level is the admin's; the person reads it, never sets it. */
  function PrivacyProtection(props) {
    props = props || {};
    var levels = props.levels || PRIVACY_LEVELS;
    var lvl = levels.filter(function (l) { return l.id === (props.level || 'high'); })[0] || levels[1];
    if (props.state === 'off') {
      return h('div', { className: cx('rr-privacy', props.className) }, [
        h(ProtectionStatus, { key: 'c', tone: 'warn', icon: Icons.shield({ width: 28, height: 28 }), title: props.offTitle || 'Privacy protection is off' },
          props.offText || 'What you send goes to the AI as written.'),
        props.foot ? h('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null
      ]);
    }
    return h('div', { className: cx('rr-privacy', props.className) }, [
      props.card !== false ? h(ProtectionStatus, { key: 'c', tone: 'safe', icon: Icons.shieldCheck({ width: 28, height: 28 }),
        title: (props.onLabel || 'Privacy protection is on') + ': ' + lvl.label, live: props.running || 'Running' }, props.summary) : null,
      props.lede !== false ? h('p', { key: 'l', className: 'rr-panellede' }, props.lede ||
        'A small privacy AI runs on your own laptop, not in the cloud. When you press Send, it reads the message first and swaps private details for placeholders, so the AI that answers never sees them. When the answer comes back, your laptop puts the real names back.') : null,
      props.showLevels !== false ? h(PrivacyLevels, { key: 'v', levels: levels, level: lvl.id }) : null,
      props.last ? h('p', { key: 'x', className: 'rr-privacy__last' }, [
        h('span', { key: 'i', 'aria-hidden': 'true' }, Icons.shieldCheck({ width: 14, height: 14 })),
        h('span', { key: 't' }, props.last)
      ]) : null,
      props.foot ? h('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null
    ]);
  }

  /* ---- MemoryScope ----------------------------------------------------- */

  /* One memory, kept by Redrob outside any AI, and which part of it this
     chat may use. The point to make is the one no single-model app can:
     every AI reads the same notes, so changing AI loses nothing. */
  function MemoryScope(props) {
    props = props || {};
    var options = props.options || [];
    var sv = React.useState(props.defaultValue || (options[0] && options[0].value));
    var value = props.value !== undefined ? props.value : sv[0];
    var name = useStableId('rr-memscope');
    var cur = options.filter(function (o) { return o.value === value; })[0] || {};
    var off = cur.off;
    return h('div', { className: cx('rr-memscope', props.className) }, [
      h(ProtectionStatus, { key: 'c', tone: off ? 'plain' : 'brand', icon: Icons.bookOpen({ width: 28, height: 28 }),
        title: off ? (props.offTitle || 'Memory is off for this chat') : (props.onTitle || 'Memory is on: one memory for every AI') },
        off ? (props.offText || 'Every AI starts from nothing, and nothing new is saved.') : (cur.summary || props.summary)),
      props.lede !== false ? h('p', { key: 'l', className: 'rr-panellede' }, props.lede ||
        'Most AI apps keep what they learn about you inside one AI, from one company. Redrob keeps your memory separately, so every AI reads the same notes before it answers. Switch AI mid-chat, or to a model that does not exist yet, and nothing has to be explained again.') : null,
      h('div', { key: 's', className: 'rr-memscope__options', role: 'radiogroup', 'aria-label': props.label || 'Which memory this chat uses' }, options.map(function (o) {
        return h('label', { key: o.value, className: 'rr-memscope__option' }, [
          h('input', { key: 'i', type: 'radio', name: name, checked: value === o.value,
            onChange: function () { if (props.value === undefined) sv[1](o.value); if (props.onChange) props.onChange(o.value, o); } }),
          h('span', { key: 't' }, [o.label, o.detail ? h('small', { key: 's' }, o.detail) : null])
        ]);
      })),
      props.foot ? h('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null
    ]);
  }

  /* ---- ComposerMode ---------------------------------------------------- */

  /* Plan or Run, in the composer bar beside the model. Plan asks what it
     needs and writes a plan that runs only when you say so; Run starts at
     once. A per-message choice, so it sits where the message is sent. */
  var COMPOSER_MODES = [
    { value: 'plan', label: 'Plan', icon: 'route', hint: 'Cowork asks what it needs and writes a plan. Nothing runs until you say so.' },
    { value: 'run', label: 'Run', icon: 'play', hint: 'Cowork starts at once.' }
  ];

  function ComposerMode(props) {
    props = props || {};
    var modes = props.options || COMPOSER_MODES;
    var sv = React.useState(props.defaultValue || modes[0].value);
    var value = props.value !== undefined ? props.value : sv[0];
    return h('div', { className: cx('rr-cmode', props.compact && 'rr-cmode--compact', props.className), role: 'radiogroup', 'aria-label': props.label || 'How Cowork works on this message' },
      modes.map(function (m) {
        var on = value === m.value;
        var icon = m.icon && Icons[m.icon] ? Icons[m.icon]({ width: 13, height: 13, 'aria-hidden': 'true' }) : null;
        return h('button', { key: m.value, type: 'button', role: 'radio', 'aria-checked': String(on), 'aria-label': m.label, title: m.hint,
          className: 'rr-cmode__o',
          onClick: function () { if (props.value === undefined) sv[1](m.value); if (props.onChange) props.onChange(m.value, m); } }, [
          icon ? h(React.Fragment, { key: 'i' }, icon) : null,
          h('span', { key: 'l', className: 'rr-cmode__l' }, m.label)
        ]);
      }));
  }

  /* ---- CrossCheckSetting ----------------------------------------------- */

  /* The panel behind Cross-check in the status line: two checks, each Off,
     When it matters or Always. The checkers are named in every result, so
     the setting never has to promise more than it does. */
  var CROSS_CHECK_LEVELS = [
    { value: 'off', label: 'Off' },
    { value: 'auto', label: 'When it matters' },
    { value: 'always', label: 'Always' }
  ];
  var CROSS_CHECKS = [
    { id: 'factCheck', name: 'Fact check', text: 'An AI from another company opens every source the answer cites, checks that each step of the reasoning follows, and adds anything the answer missed. About 40 seconds.' },
    { id: 'challenge', name: 'Challenge', text: 'Puts the answer\'s conclusion under pressure: one AI argues for it, another against, for three rounds, and a third says what held up. About 2 minutes.' }
  ];
  var CROSS_CHECK_DEFAULT = { factCheck: 'auto', challenge: 'auto' };

  /* What the status line says: the level when every check shares it, On when all run at
     different levels, otherwise a count ("1 of 2 on"). */
  function crossCheckValue(value, checks, levels) {
    value = value || CROSS_CHECK_DEFAULT; checks = checks || CROSS_CHECKS; levels = levels || CROSS_CHECK_LEVELS;
    var on = checks.filter(function (c) { return (value[c.id] || 'off') !== 'off'; });
    if (!on.length) return levels[0].label;
    var same = on.every(function (c) { return value[c.id] === value[on[0].id]; });
    if (on.length === checks.length && same) return (levels.filter(function (l) { return l.value === value[on[0].id]; })[0] || levels[1]).label;
    if (on.length === checks.length) return 'On';
    return on.length + ' of ' + checks.length + ' on';
  }

  function CrossCheckSetting(props) {
    props = props || {};
    var checks = props.checks || CROSS_CHECKS;
    var levels = props.levels || CROSS_CHECK_LEVELS;
    var sv = React.useState(props.defaultValue || CROSS_CHECK_DEFAULT);
    var value = props.value !== undefined ? props.value : sv[0];
    function set(id, v) {
      var next = Object.assign({}, value); next[id] = v;
      if (props.value === undefined) sv[1](next);
      if (props.onChange) props.onChange(next, id);
    }
    return h('div', { className: cx('rr-xcheck', props.className) }, [
      props.title ? h('p', { key: 'h', className: 'rr-xcheck__title' }, props.title) : null,
      h('p', { key: 'l', className: 'rr-panellede' }, props.lede || 'After Cowork answers, AIs from other companies check its work. Every check says who ran it.'),
      checks.map(function (c) {
        var cur = value[c.id] || 'off';
        return h('div', { key: c.id, className: 'rr-xcheck__row', role: 'group', 'aria-labelledby': 'rr-xc-' + c.id }, [
          h('p', { key: 'n', id: 'rr-xc-' + c.id, className: 'rr-xcheck__name' }, c.name),
          h('p', { key: 't', className: 'rr-xcheck__text' }, c.text),
          h('div', { key: 's', className: 'rr-seg', role: 'radiogroup', 'aria-label': c.name }, levels.map(function (l) {
            return h('button', { key: l.value, type: 'button', role: 'radio', 'aria-checked': String(cur === l.value), onClick: function () { set(c.id, l.value); } }, l.label);
          }))
        ]);
      }),
      h('p', { key: 'm', className: 'rr-xcheck__note' }, props.whenItMatters || 'When it matters means answers you will rely on or pass on: a decision, a number, a claim about a rule or a fact, or anything you will send to someone. Quick questions, drafts and brainstorming are left alone. The checkers are the next best AIs for the task, from other companies than the one that answered.'),
      props.foot ? h('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null
    ]);
  }
  CrossCheckSetting.value = crossCheckValue;

  /* ---- PlanQuestions --------------------------------------------------- */

  /* What Plan asks before it writes: a few questions, each answered with a
     tap or in your own words. Once answered it folds to a single line. */
  function PlanQuestions(props) {
    props = props || {};
    var qs = props.questions || [];
    var init = {};
    qs.forEach(function (q) { init[q.id] = q.defaultValue !== undefined ? q.defaultValue : (q.multi ? [] : null); });
    var sv = React.useState(props.defaultValue || init);
    var a = props.value !== undefined ? props.value : sv[0];
    function on(q, i) { var v = a[q.id]; return q.multi ? (v || []).indexOf(i) >= 0 : v === i; }
    function pick(q, i) {
      var next = Object.assign({}, a), v = a[q.id];
      if (q.multi) { v = (v || []).slice(); var at = v.indexOf(i); if (at >= 0) v.splice(at, 1); else v.push(i); next[q.id] = v; }
      else next[q.id] = i;
      if (props.value === undefined) sv[1](next);
      if (props.onChange) props.onChange(next);
    }
    if (props.done) return h('p', { className: cx('rr-planq rr-planq--done', props.className) }, [
      h('span', { key: 'i', className: 'rr-planq__tick', 'aria-hidden': 'true' }, Icons.check({ width: 14, height: 14 })),
      h('span', { key: 't' }, props.summary || 'Answered.')
    ]);
    return h('div', { className: cx('rr-planq', props.className), role: 'group', 'aria-label': props.label || 'Questions before the plan' }, [
      h('ol', { key: 'l', className: 'rr-planq__list' }, qs.map(function (q) {
        return h('li', { key: q.id, className: 'rr-planq__q' }, [
          h('p', { key: 'p', className: 'rr-planq__ask' }, [q.question, q.multi ? h('span', { key: 'm', className: 'rr-planq__any' }, ' ' + (props.anyLabel || 'Choose any')) : null]),
          h('div', { key: 'c', className: 'rr-planq__opts' }, (q.options || []).map(function (o, i) {
            var sel = on(q, i);
            return h('button', { key: i, type: 'button', className: 'rr-planq__opt', 'aria-pressed': String(sel), onClick: function () { pick(q, i); } }, [
              sel ? h(React.Fragment, { key: 'i' }, Icons.check({ width: 13, height: 13, 'aria-hidden': 'true' })) : null,
              h('span', { key: 't' }, o)
            ]);
          }))
        ]);
      })),
      h('div', { key: 'a', className: 'rr-planq__act' }, [
        h(Button, { key: 'b', variant: 'primary', onClick: function () { if (props.onSubmit) props.onSubmit(a); } }, props.submitLabel || 'Write the plan'),
        h('span', { key: 's', className: 'rr-planq__hint' }, props.hint || 'or reply in your own words')
      ])
    ]);
  }

  /* ---- PlanDocument ---------------------------------------------------- */

  /* The plan, written out as a document rather than a list of steps: what
     was asked, what is known, how, what you get, the assumptions and the
     risks, and a To do list that ticks as the run goes. Any paragraph can be
     changed in place until it runs. */
  var PLAN_STATUS = { draft: 'Draft · not run yet', edited: 'Edited by you · not run yet', running: 'Approved by you · running', done: 'Approved by you · done', kept: 'Kept for later' };

  function PlanText(props) {
    if (!props.editable) return h(props.as || 'span', { className: props.className }, props.children);
    return h(props.as || 'span', { className: cx('rr-plandoc__ed', props.className), contentEditable: true, suppressContentEditableWarning: true, spellCheck: false,
      onInput: props.onEdit }, props.children);
  }

  function PlanDocument(props) {
    props = props || {};
    var st = props.status || 'draft';
    var eo = React.useState(false);
    var editable = st === 'draft' || st === 'edited' || st === 'kept';
    function mark(e) { if (!eo[0]) eo[1](true); if (props.onEdit) props.onEdit(e); }
    var shown = st === 'draft' && eo[0] ? 'edited' : st;
    var todo = props.todo || [];
    var ticked = props.done != null ? props.done : todo.filter(function (t) { return t.done; }).length;
    function item(it, i, ordered) {
      if (it == null) return null;
      if (typeof it !== 'object' || React.isValidElement(it) || Array.isArray(it)) it = { text: it };
      return h('li', { key: it.id || i }, [
        it.lead ? h('b', { key: 'l' }, it.lead + ' ') : null,
        h(PlanText, { key: 't', editable: editable && it.editable !== false, onEdit: mark }, it.text),
        it.note ? h('span', { key: 'n', className: 'rr-plandoc__muted' }, ' ' + it.note) : null
      ]);
    }
    return h('article', { className: cx('rr-plandoc', props.className), 'aria-label': props.label || 'Plan' }, [
      h('header', { key: 'h', className: 'rr-plandoc__h' }, [
        h('span', { key: 'f', className: 'rr-plandoc__file' }, [h(React.Fragment, { key: 'i' }, Icons.fileText({ width: 14, height: 14, 'aria-hidden': 'true' })), h('span', { key: 't' }, props.file || 'Plan.md')]),
        h('span', { key: 's', className: cx('rr-plandoc__state', 'rr-plandoc__state--' + shown) }, (props.statusLabels || PLAN_STATUS)[shown] || shown)
      ]),
      h('div', { key: 'b', className: cx('rr-plandoc__b', !editable && 'rr-plandoc__b--locked') }, [
        props.title ? h('h2', { key: 't', className: 'rr-plandoc__title' }, props.title) : null,
        props.summary ? h(PlanText, { key: 's', as: 'p', editable: editable, onEdit: mark }, props.summary) : null,
        (props.sections || []).map(function (s, si) {
          var List = s.ordered ? 'ol' : 'ul';
          return h('section', { key: s.id || si, className: 'rr-plandoc__sec' }, [
            h('h3', { key: 'h' }, s.heading),
            s.body ? h(PlanText, { key: 'p', as: 'p', editable: editable, onEdit: mark }, s.body) : null,
            s.items ? h(List, { key: 'l' }, s.items.map(function (it, i) { return item(it, i, s.ordered); })) : null
          ]);
        }),
        todo.length ? h('section', { key: 'todo', className: 'rr-plandoc__sec' }, [
          h('h3', { key: 'h' }, props.todoLabel || 'To do'),
          h('ul', { key: 'l', className: 'rr-plandoc__todo' }, todo.map(function (t, i) {
            var done = i < ticked;
            return h('li', { key: t.id || i, className: done ? 'is-done' : undefined }, [
              h('span', { key: 'c', className: 'rr-plandoc__box', 'aria-hidden': 'true' }, done ? Icons.check({ width: 10, height: 10 }) : null),
              h('span', { key: 't', className: 'rr-plandoc__task' }, [t.label, done ? h('span', { key: 'v', className: 'rr-visually-hidden' }, ' (done)') : null]),
              t.who ? h('span', { key: 'w', className: 'rr-plandoc__who' }, t.who) : null
            ]);
          }))
        ]) : null,
        props.note ? h('p', { key: 'n', className: 'rr-plandoc__note' }, props.note) : null
      ]),
      editable && (props.onRun || props.onKeep) ? h('footer', { key: 'f', className: 'rr-plandoc__f' }, [
        props.onRun ? h(Button, { key: 'r', variant: 'primary', iconLeft: Icons.play({ width: 14, height: 14 }), onClick: props.onRun }, props.runLabel || 'Run this plan') : null,
        props.onKeep && st !== 'kept' ? h(Button, { key: 'k', variant: 'secondary', onClick: props.onKeep }, props.keepLabel || 'Keep it for later') : null,
        h('span', { key: 's', className: 'rr-plandoc__hint' }, props.hint || 'Click any paragraph to change it, or reply below.')
      ]) : null
    ]);
  }

  /* ---- FactCheckReport ------------------------------------------------- */

  /* What Fact check found, in three parts: every cited source opened and
     judged, the reasoning read step by step, and what the answer missed.
     Named for the AI that ran it. Only the flagged sentences are rewritten. */
  var FACT_VERDICTS = {
    holds: ['success', 'Holds up'], partly: ['warning', 'Partly'], wrong: ['danger', 'Not in that source'],
    closed: ['neutral', 'Couldn\'t open'], fixed: ['success', 'Fixed']
  };

  function CheckHead(props) {
    return h('div', { className: 'rr-check__h' }, [
      h('span', { key: 'i', className: 'rr-check__icon', 'aria-hidden': 'true' }, props.icon),
      h('p', { key: 'b', className: 'rr-check__name' }, props.name),
      props.meta ? h('span', { key: 's', className: 'rr-check__meta' }, props.meta) : null,
      props.onClose ? h(IconButton, { key: 'x', size: 'sm', label: props.closeLabel || 'Close', onClick: props.onClose }, Icons.close({ width: 14, height: 14 })) : null
    ]);
  }

  function FactCheckReport(props) {
    props = props || {};
    var claims = props.claims || [];
    var verdicts = Object.assign({}, FACT_VERDICTS, props.verdicts || {});
    var so = React.useState(props.defaultOpen !== undefined ? props.defaultOpen : null);
    var open = so[0];
    var meta = [props.by, props.took].filter(Boolean).join(' · ');
    var reasoning = props.reasoning || [];
    var missed = props.missed || [];
    return h('section', { className: cx('rr-check rr-factcheck', props.className), 'aria-label': props.label || 'Fact check' }, [
      h(CheckHead, { key: 'h', icon: Icons.scan({ width: 16, height: 16 }), name: props.title || 'Fact check', meta: meta, onClose: props.onClose }),
      props.summary ? h('p', { key: 's', className: 'rr-check__sum' }, props.summary) : null,
      claims.length ? h('p', { key: 'k1', className: 'rr-check__key' }, props.sourcesLabel || 'Sources') : null,
      claims.length ? h('ul', { key: 'c', className: 'rr-factcheck__claims' }, claims.map(function (c, i) {
        var id = c.id || String(i);
        var v = verdicts[c.verdict] || verdicts.holds;
        var isOpen = open === id;
        var pid = 'rr-fc-' + id;
        return h('li', { key: id }, [
          h('button', { key: 'b', type: 'button', className: 'rr-factcheck__claim', 'aria-expanded': String(isOpen), 'aria-controls': pid, onClick: function () { so[1](isOpen ? null : id); } }, [
            h('span', { key: 'v', className: 'rr-factcheck__verdict' }, h(Badge, { tone: v[0], dot: true, size: 'sm' }, v[1])),
            h('span', { key: 't', className: 'rr-factcheck__text' }, c.claim),
            h('span', { key: 'c', className: 'rr-factcheck__chev', 'aria-hidden': 'true' }, (isOpen ? Icons.chevronUp : Icons.chevronDown)({ width: 14, height: 14 }))
          ]),
          isOpen ? h('div', { key: 'e', id: pid, className: 'rr-factcheck__ev' }, [
            c.passage ? h(Evidence, { key: 'ev', claimLabel: props.claimLabel || 'The answer says', claim: c.claim, passage: c.passage, quote: c.quote, source: c.source }) : null,
            c.note ? h('p', { key: 'n', className: 'rr-factcheck__note' }, c.note) : null
          ]) : null
        ]);
      })) : null,
      reasoning.length ? h('p', { key: 'k2', className: 'rr-check__key' }, props.reasoningLabel || 'Reasoning') : null,
      reasoning.map(function (f, i) { return h(Finding, Object.assign({ key: 'f' + i }, f, props.fixed && f.state !== 'dismissed' ? { state: 'accepted' } : {})); }),
      missed.length ? h('p', { key: 'k3', className: 'rr-check__key' }, props.missedLabel || 'Missed') : null,
      missed.map(function (m, i) { return h(OpinionAdded, { key: 'm' + i, by: m.by || props.by, label: m.label || props.missedItemLabel }, m.text); }),
      !props.fixed && props.onFix ? h('div', { key: 'a', className: 'rr-check__act' }, [
        h(Button, { key: 'b', variant: 'primary', onClick: props.onFix }, props.fixLabel || 'Fix the answer'),
        h('span', { key: 's', className: 'rr-check__hint' }, props.fixHint || 'Rewrites only the sentences flagged above.')
      ]) : null
    ]);
  }

  /* ---- ChallengeReport ------------------------------------------------- */

  /* The answer's conclusion under pressure: one AI for it, one against, a
     third that says what held up. Each side is named, the rounds are shown
     in full, and what nobody settled is said plainly for a person to decide. */
  var CHALLENGE_KINDS = { broke: 'Broke', held: 'Held', changed: 'Changed' };

  function ChallengeReport(props) {
    props = props || {};
    var rounds = props.rounds || [];
    var running = props.state === 'running';
    var shown = props.shown != null ? Math.min(props.shown, rounds.length) : rounds.length;
    var sides = props.sides || {};
    var meta = running ? (props.progressLabel || ('Round ' + Math.min(shown + 1, rounds.length || 1) + ' of ' + (props.of || rounds.length || 3))) : props.took;
    var kinds = Object.assign({}, CHALLENGE_KINDS, props.kindLabels || {});
    function side(tone, label, who) { return who ? h('span', { key: label }, [h(Badge, { key: 'b', tone: tone, size: 'sm' }, label), ' ', who]) : null; }
    return h('section', { className: cx('rr-check rr-challenge', props.className), 'aria-label': props.label || 'Challenge' }, [
      h(CheckHead, { key: 'h', icon: Icons.scales({ width: 16, height: 16 }), name: props.title || 'Challenge', meta: meta, onClose: props.onClose }),
      props.claim ? h('div', { key: 'c', className: 'rr-challenge__claim' }, [
        h('p', { key: 'k', className: 'rr-check__key' }, props.claimLabel || 'The conclusion under challenge'),
        h('p', { key: 'b', className: 'rr-challenge__motion' }, props.claim)
      ]) : null,
      h('p', { key: 's', className: 'rr-challenge__sides' }, [
        side('info', props.forLabel || 'For', sides.for), side('warning', props.againstLabel || 'Against', sides.against), side('neutral', props.judgeLabel || 'Judge', sides.judge)
      ]),
      shown ? h('ol', { key: 'r', className: 'rr-challenge__rounds' }, rounds.slice(0, shown).map(function (r, i) {
        return h('li', { key: i }, [
          h('span', { key: 'n', className: 'rr-challenge__n' }, (props.roundLabel || 'Round') + ' ' + (i + 1)),
          h('div', { key: 'f', className: 'rr-challenge__side rr-challenge__side--for' }, [h('span', { key: 'l', className: 'rr-visually-hidden' }, (props.forLabel || 'For') + ': '), r.for]),
          h('div', { key: 'a', className: 'rr-challenge__side rr-challenge__side--against' }, [h('span', { key: 'l', className: 'rr-visually-hidden' }, (props.againstLabel || 'Against') + ': '), r.against])
        ]);
      })) : null,
      running ? h(Streaming, { key: 'st', state: 'thinking', label: props.runningLabel || (shown < rounds.length ? 'Round ' + (shown + 1) + ': both sides are writing' : 'The judge is weighing the rounds'), onStop: props.onStop || props.onClose }) : null,
      !running && props.verdict ? h('div', { key: 'v', className: 'rr-challenge__verdict' }, [
        h('p', { key: 't', className: 'rr-challenge__vt' }, props.verdictLabel || 'What held up'),
        h('ul', { key: 'l' }, props.verdict.map(function (v, i) { return h('li', { key: i }, [h('b', { key: 'b' }, (kinds[v.kind] || v.kind) + ': '), v.text]); })),
        props.unsettled ? h('p', { key: 'u', className: 'rr-challenge__open' }, [h('b', { key: 'b' }, (props.unsettledLabel || 'Not settled') + ': '), props.unsettled]) : null
      ]) : null,
      !running && (props.onApply || props.applied) ? h('div', { key: 'a', className: 'rr-check__act' }, props.applied
        ? [h('span', { key: 's', className: 'rr-check__done' }, [h(React.Fragment, { key: 'i' }, Icons.check({ width: 14, height: 14, 'aria-hidden': 'true' })), props.appliedLabel || 'Added to the answer'])]
        : [h(Button, { key: 'p', variant: 'primary', onClick: props.onApply }, props.applyLabel || 'Add this to the answer'),
           props.onRerun ? h(Button, { key: 'n', variant: 'ghost', onClick: props.onRerun }, props.rerunLabel || 'Run it again') : null]) : null
    ]);
  }

  /* ---- AnswerReceipt --------------------------------------------------- */

  /* One quiet row under an answer: which AI answered and who chose it, what
     it remembered, who checked it. Each item opens its detail below the row.
     A disagreement is the only thing said in color. */
  function AnswerReceipt(props) {
    props = props || {};
    var items = (props.items || []).filter(Boolean);
    var so = React.useState(null);
    var cur = items.filter(function (x) { return x.id === so[0]; })[0];
    var did = useStableId('rr-receipt');
    return h('div', { className: cx('rr-receipt', props.className) }, [
      h('div', { key: 'r', className: 'rr-receipt__row' }, items.map(function (x) {
        if (x.busy) return h('span', { key: x.id, className: 'rr-receipt__busy' }, [h(Loader, { key: 'l', size: 'sm', label: x.label }), h('span', { key: 't' }, x.label)]);
        return h('button', { key: x.id, type: 'button', className: cx('rr-receipt__item', 'rr-receipt__item--' + (x.tone || 'plain')),
          'aria-expanded': String(so[0] === x.id), 'aria-controls': x.detail ? did : undefined,
          onClick: function () { if (x.detail) so[1](so[0] === x.id ? null : x.id); } }, [
          x.icon ? h('span', { key: 'i', className: 'rr-receipt__icon', 'aria-hidden': 'true' }, x.icon) : null,
          h('span', { key: 'l', className: 'rr-receipt__label' }, x.label),
          x.sub ? h('span', { key: 's', className: 'rr-receipt__sub' }, x.sub) : null
        ]);
      })),
      cur && cur.detail ? h('div', { key: 'd', id: did, className: 'rr-receipt__detail', role: 'region', 'aria-label': cur.label }, cur.detail) : null
    ]);
  }

  /* ---- PrivateText ----------------------------------------------------- */

  /* A private detail in a message you sent, as you wrote it, marked so you
     can see it was kept from the AI. Hover or focus says what the AI saw. */
  function PrivateText(props) {
    props = props || {};
    var said = props.out ? (props.outLabel || 'Left out. It was never sent.') : 'Kept private. The AI saw "' + props.as + '".';
    return h('span', { className: cx('rr-private', props.out && 'rr-private--out', props.className), tabIndex: 0, title: said }, [
      props.children,
      h('span', { key: 'h', className: 'rr-visually-hidden' }, ' (' + said + ')')
    ]);
  }

  /* ---- Disputed -------------------------------------------------------- */

  /* A sentence in an answer that Fact check reads differently. Only
     these are marked; agreement is left plain, because two AIs agreeing is
     not proof. Opening it shows what each checker said, in place. Built of
     phrasing elements only, so it can sit inside the answer's paragraph. */
  function Disputed(props) {
    props = props || {};
    var so = React.useState(!!props.defaultOpen);
    var open = props.open !== undefined ? props.open : so[0];
    function set(v) { if (props.open === undefined) so[1](v); if (props.onOpenChange) props.onOpenChange(v); }
    var pid = useStableId('rr-dispute');
    var views = props.views || [];
    return h('span', { className: cx('rr-dispute', open && 'rr-dispute--open', props.className) }, [
      h('span', { key: 'q', role: 'button', tabIndex: 0, className: 'rr-dispute__mark', 'aria-expanded': String(open), 'aria-controls': pid,
        title: props.hint || 'Fact check reads this differently',
        onClick: function () { set(!open); },
        onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!open); } } }, [
        props.children,
        props.n != null ? h('sup', { key: 's' }, String(props.n)) : null
      ]),
      open ? h('span', { key: 'p', id: pid, className: 'rr-dispute__panel', role: 'region', 'aria-label': props.title || 'What Fact check found' }, [
        h('span', { key: 'h', className: 'rr-dispute__title' }, props.title || 'Fact check reads this differently'),
        views.map(function (v, i) {
          return h('span', { key: i, className: 'rr-dispute__view' }, [
            h('span', { key: 'w', className: 'rr-dispute__who' }, v.who),
            h('span', { key: 's' }, v.said)
          ]);
        }),
        h('span', { key: 'a', className: 'rr-dispute__actions' }, [
          props.onSettle ? h(Button, { key: 'b', size: 'sm', variant: 'secondary', onClick: function () { set(false); props.onSettle(); } }, props.settleLabel || 'Ask Cowork to settle it') : null,
          h(Button, { key: 'c', size: 'sm', variant: 'ghost', onClick: function () { set(false); } }, props.closeLabel || 'Close')
        ])
      ]) : null
    ]);
  }

  /* ---- OpinionAdded ---------------------------------------------------- */

  /* What Fact check thinks the answer missed: added at the end of the
     answer, never merged into it, and marked with whose it is. */
  function OpinionAdded(props) {
    props = props || {};
    return h('div', { className: cx('rr-opadd', props.className) }, [
      h('p', { key: 'h', className: 'rr-opadd__head' }, [
        h('span', { key: 'i', 'aria-hidden': 'true' }, Icons.plus({ width: 13, height: 13 })),
        props.label || ('The answer missed this' + (props.by ? ' (' + props.by + ')' : ''))
      ]),
      h('div', { key: 'b', className: 'rr-opadd__body' }, props.children)
    ]);
  }

  /* ---- ModelSwitch ----------------------------------------------------- */

  /* A line in the thread where a different AI takes over, with the promise
     that makes switching safe: it reads the same memory. */
  function ModelSwitch(props) {
    props = props || {};
    return h('p', { className: cx('rr-mswitch', props.className), role: 'note' }, [
      h('span', { key: 'i', className: 'rr-mswitch__icon', 'aria-hidden': 'true' }, props.by === 'you' ? Icons.pin({ width: 14, height: 14 }) : Icons.sparkle({ width: 14, height: 14 })),
      h('span', { key: 't' }, [
        props.by === 'you' ? 'Switched to ' : 'Redrob Auto switched to ',
        h('b', { key: 'b' }, props.to),
        props.reason ? ' ' + props.reason : '',
        '. ', props.note || 'It reads the same memory, so it knows everything above.'
      ])
    ]);
  }

  /* ---- MemorySaved ----------------------------------------------------- */

  /* Said in the chat, once, whenever Cowork writes something down, with Undo
     beside it. Nothing is remembered silently. */
  function MemorySaved(props) {
    props = props || {};
    return h('p', { className: cx('rr-memsaved', props.className), role: 'status' }, [
      h('span', { key: 'i', className: 'rr-memsaved__icon', 'aria-hidden': 'true' }, Icons.bookOpen({ width: 14, height: 14 })),
      h('span', { key: 't' }, [props.label || 'Saved to memory: ', h('b', { key: 'b' }, props.children), '. ', props.note || 'Every AI will know it from now on.']),
      props.onUndo ? h('button', { key: 'u', type: 'button', className: 'rr-memsaved__undo', onClick: props.onUndo }, props.undoLabel || 'Undo') : null
    ]);
  }

  /* ---- MemoryList ------------------------------------------------------ */

  /* Every note, where it came from, and which AIs read it. The "read by"
     line is what shows the memory belongs to no single model. */
  function MemoryList(props) {
    props = props || {};
    var items = props.items || [];
    return h('ul', { className: cx('rr-memlist', props.className) }, items.map(function (m, i) {
      return h('li', { key: m.id || i, className: 'rr-memlist__item' }, [
        h('span', { key: 't', className: 'rr-memlist__text' }, m.text),
        h('span', { key: 'm', className: 'rr-memlist__meta' }, [
          m.source,
          m.readBy ? h('span', { key: 'd', className: 'rr-memlist__dot', 'aria-hidden': 'true' }, '·') : null,
          m.readBy ? (props.readByLabel || 'Read by ') + m.readBy : null
        ]),
        m.locked
          ? h('span', { key: 'a', className: 'rr-memlist__lock' }, m.lockedLabel || 'Only your admin can change this')
          : h('span', { key: 'a', className: 'rr-memlist__actions' }, [
              h(Button, { key: 'e', size: 'sm', variant: 'ghost', onClick: props.onEdit ? function () { props.onEdit(m, i); } : undefined }, props.editLabel || 'Edit'),
              h(Button, { key: 'f', size: 'sm', variant: 'ghost', onClick: props.onForget ? function () { props.onForget(m, i); } : undefined }, props.forgetLabel || 'Forget')
            ])
      ]);
    }));
  }

  /* ---- OpinionGrid ----------------------------------------------------- */

  var OPINION_VERDICTS = {
    wrote: { label: 'Wrote this' },
    agree: { label: 'Agrees', icon: 'check' },
    differ: { label: 'Sees it differently', icon: 'warning' },
    added: { label: 'Added this', icon: 'plus' },
    quiet: { label: 'Didn’t comment' }
  };

  /* Every point in an answer against the AI that wrote it and the two that
     checked it. "Didn't comment" is its own state and never counts as
     agreement. */
  function OpinionGrid(props) {
    props = props || {};
    var cols = props.columns || [];
    var rows = props.rows || [];
    var V = Object.assign({}, OPINION_VERDICTS, props.verdicts || {});
    function verdict(v) {
      var d = V[v] || V.quiet;
      return h('span', { className: 'rr-opgrid__v rr-opgrid__v--' + v }, [d.icon ? h('span', { key: 'i', 'aria-hidden': 'true' }, Icons[d.icon]({ width: 14, height: 14 })) : null, d.label]);
    }
    return h('div', { className: cx('rr-opgrid', props.className) }, h('table', null, [
      props.caption ? h('caption', { key: 'c', className: 'rr-visually-hidden' }, props.caption) : null,
      h('thead', { key: 'h' }, h('tr', null, [
        h('th', { key: 'p', scope: 'col' }, props.pointLabel || 'Point in the answer'),
        cols.map(function (c) { return h('th', { key: c.id, scope: 'col' }, [h('span', { key: 'm', className: 'rr-opgrid__model' }, c.model), c.role ? h('small', { key: 'r' }, c.role) : null]); })
      ])),
      h('tbody', { key: 'b' }, rows.map(function (r) {
        var differ = cols.some(function (c) { return r.cells[c.id] && r.cells[c.id][0] === 'differ'; });
        return h('tr', { key: r.id, className: differ ? 'rr-opgrid__row--differ' : undefined }, [
          h('th', { key: 'p', scope: 'row', className: 'rr-opgrid__point' }, [h('b', { key: 'b' }, r.label), r.where ? h('span', { key: 's' }, r.where) : null]),
          cols.map(function (c) {
            var cell = r.cells[c.id] || [c.wrote ? 'wrote' : 'quiet'];
            return h('td', { key: c.id }, [verdict(cell[0]), cell[1] ? h('span', { key: 'n', className: 'rr-opgrid__note' }, cell[1]) : null]);
          })
        ]);
      }))
    ]));
  }


  /* ==========================================================================
     Playbooks, scheduling and connectors
     The pieces Cowork uses to save a way of working, run it on a clock, and say
     which apps it may reach.
     ========================================================================== */

  /* ---- PlaybookRow: one saved way of working, in a list ------------------ */

  function PlaybookRow(props) {
    props = props || {};
    var steps = props.steps || [];
    var asks = props.asks != null ? props.asks : steps.filter(function (s) { return s && s.approval; }).length;
    var n = props.stepCount != null ? props.stepCount : steps.length;
    var asksText = asks ? (props.asksLabel || 'Asks you first') + ' ' + (asks === 1 ? 'once' : asks === 2 ? 'twice' : asks + ' times') : (props.straightLabel || 'Runs straight through');
    var impact = props.impact || [];
    var Tag = props.href ? 'a' : props.onClick ? 'button' : 'div';
    return h(Tag, { className: cx('rr-pbrow', props.className), href: props.href, onClick: props.onClick, type: Tag === 'button' ? 'button' : undefined }, [
      h('span', { key: 'i', className: 'rr-pbrow__icon', 'aria-hidden': 'true' }, props.icon || Icons.checklist({ width: 16, height: 16 })),
      h('span', { key: 'm', className: 'rr-pbrow__main' }, [
        h('span', { key: 'n', className: 'rr-pbrow__name' }, [
          h('b', { key: 'b' }, props.name),
          props.highImpact ? h(Badge, { key: 'h', tone: 'brand', size: 'sm' }, props.highImpactLabel || 'High impact') : null
        ]),
        props.summary ? h('span', { key: 's', className: 'rr-pbrow__summary' }, props.summary) : null,
        h('span', { key: 'f', className: 'rr-pbrow__foot' }, [
          h('span', { key: 'a', className: 'rr-pbrow__asks' }, [Icons[asks ? 'userCheck' : 'play']({ key: 'i', width: 13, height: 13, 'aria-hidden': 'true' }), asksText]),
          n ? h('span', { key: 'c' }, n + ' steps') : null,
          props.owner ? h('span', { key: 'o' }, (props.ownerPrefix || 'Saved by') + ' ' + props.owner) : null
        ])
      ]),
      impact.length ? h('span', { key: 'v', className: 'rr-pbrow__worth' }, [h('b', { key: 'b' }, impact[0]), impact[1] ? h('span', { key: 's' }, impact[1]) : null]) : null
    ]);
  }

  /* ---- ConnectorCard: an app Cowork can reach ------------------------------ */

  function ConnectorCard(props) {
    props = props || {};
    var on = !!props.connected;
    return h('div', { className: cx('rr-connector', on && 'rr-connector--on', props.className) }, [
      h('div', { key: 't', className: 'rr-connector__top' }, [
        /* The maker's logo only where the maker has approved it; the system icon for the kind of app otherwise. */
        h('span', { key: 'i', className: 'rr-connector__logo', 'aria-hidden': 'true' },
          props.logo ? h('img', { src: props.logo, alt: '' }) : (props.icon || Icons.plug({ width: 20, height: 20 }))),
        h('span', { key: 'n', className: 'rr-connector__name' }, [
          h('b', { key: 'b' }, props.name),
          props.maker || props.category ? h('span', { key: 'm' }, [props.maker, props.category].filter(Boolean).join(' - ')) : null
        ]),
        on ? h(Badge, { key: 'b', tone: 'success', size: 'sm', dot: true }, props.connectedLabel || 'Connected') : null
      ]),
      props.description ? h('p', { key: 'd', className: 'rr-connector__does' }, props.description) : null,
      h('div', { key: 'a', className: 'rr-connector__act' }, on
        ? [props.onManage ? h(Button, { key: 'm', size: 'sm', variant: 'ghost', onClick: props.onManage }, props.manageLabel || 'Manage') : null,
           props.onDisconnect ? h(Button, { key: 'x', size: 'sm', variant: 'ghost', onClick: props.onDisconnect }, props.disconnectLabel || 'Disconnect') : null]
        : [h(Button, { key: 'c', size: 'sm', variant: 'secondary', onClick: props.onConnect }, props.connectLabel || 'Connect')])
    ]);
  }

  /* ---- Time zones -------------------------------------------------------- */

  var TIME_ZONES = [
    ['Asia/Seoul', 'Seoul'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Shanghai', 'Beijing and Shanghai'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Taipei', 'Taipei'],
    ['Asia/Singapore', 'Singapore'], ['Asia/Jakarta', 'Jakarta'], ['Asia/Bangkok', 'Bangkok'], ['Asia/Ho_Chi_Minh', 'Ho Chi Minh City'], ['Asia/Manila', 'Manila'],
    ['Asia/Kolkata', 'India (Delhi, Noida, Mumbai)'], ['Asia/Dhaka', 'Dhaka'], ['Asia/Karachi', 'Karachi'], ['Asia/Dubai', 'Dubai'], ['Asia/Riyadh', 'Riyadh'],
    ['Europe/Istanbul', 'Istanbul'], ['Europe/Moscow', 'Moscow'], ['Europe/Berlin', 'Berlin'], ['Europe/Paris', 'Paris'], ['Europe/Amsterdam', 'Amsterdam'],
    ['Europe/London', 'London'], ['Africa/Lagos', 'Lagos'], ['Africa/Nairobi', 'Nairobi'], ['Africa/Johannesburg', 'Johannesburg'], ['America/Sao_Paulo', 'São Paulo'],
    ['America/Mexico_City', 'Mexico City'], ['America/New_York', 'New York'], ['America/Toronto', 'Toronto'], ['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'],
    ['America/Los_Angeles', 'Los Angeles and San Francisco'], ['America/Anchorage', 'Anchorage'], ['Pacific/Honolulu', 'Honolulu'], ['Australia/Sydney', 'Sydney'],
    ['Australia/Melbourne', 'Melbourne'], ['Australia/Perth', 'Perth'], ['Pacific/Auckland', 'Auckland'], ['UTC', 'Coordinated Universal Time (UTC)']
  ];
  var OFFICES = [['Asia/Seoul', 'Seoul'], ['Asia/Kolkata', 'Noida'], ['America/New_York', 'New York']];
  function tzOffset(tz, at) {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at || new Date())
        .filter(function (x) { return x.type === 'timeZoneName'; })[0];
      return p ? p.value : '';
    } catch (e) { return ''; }
  }
  function tzMinutes(tz, at) {
    var m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzOffset(tz, at));
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  }
  function zoneCity(tz, zones) {
    var z = (zones || TIME_ZONES).filter(function (x) { return x[0] === tz; })[0];
    return z ? z[1] : tz;
  }

  function TimeZonePicker(props) {
    props = props || {};
    var zones = props.zones || TIME_ZONES;
    var at = props.now || new Date();
    return h(Combobox, {
      id: props.id, label: props.label || 'Time zone', size: props.size || 'sm', hint: props.hint, className: props.className,
      error: props.error, invalid: props.invalid, required: props.required, disabled: props.disabled,
      value: props.value, defaultValue: props.defaultValue, placeholder: props.placeholder || 'Search a city',
      emptyText: props.emptyText || 'No city by that name',
      /* onChange(zone), as index.d.ts types it: the option is only the zone and its label. */
      onChange: function (v) { if (v && props.onChange) props.onChange(v); },
      options: zones.map(function (z) { var o = tzOffset(z[0], at); return { value: z[0], label: z[1] + (o ? ' (' + o + ')' : '') }; })
    });
  }

  /* ---- TimePicker: type it, or set it on a clock ------------------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function partOfDay(hh) { return hh < 5 ? 'At night' : hh < 12 ? 'In the morning' : hh < 17 ? 'In the afternoon' : hh < 21 ? 'In the evening' : 'At night'; }

  function TimePicker(props) {
    props = props || {};
    var autoId = useStableId('rr-time');
    var id = props.id || autoId;
    var controlled = props.value !== undefined;
    var inner = React.useState(props.defaultValue || '09:00');
    var value = controlled ? props.value : inner[0];
    var os = React.useState(false), open = os[0], setOpen = os[1];
    var ss = React.useState('h'), stage = ss[0], setStage = ss[1];
    var ds = React.useState(null), draft = ds[0], setDraft = ds[1];
    var hs = React.useState(null), hover = hs[0], setHover = hs[1];
    var wrap = React.useRef(null), field = React.useRef(null);
    var parts = String(value || '00:00').split(':');
    var hh = Number(parts[0]) || 0, mm = Number(parts[1]) || 0;
    function set(h2, m2) {
      var v = pad2(((h2 % 24) + 24) % 24) + ':' + pad2(((m2 % 60) + 60) % 60);
      if (!controlled) inner[1](v);
      if (props.onChange) props.onChange(v);
    }
    function close(refocus) { setOpen(false); setStage('h'); setHover(null); if (refocus && field.current) field.current.focus(); }
    React.useEffect(function () {
      if (!open) return;
      function away(e) { if (wrap.current && !wrap.current.contains(e.target)) close(false); }
      function esc(e) { if (e.key === 'Escape') close(true); }
      document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
      return function () { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
    }, [open]);
    function commit(text) {
      var t = String(text || '').replace(/[^0-9:]/g, ''), h2, m2;
      if (t.indexOf(':') >= 0) { var p = t.split(':'); h2 = Number(p[0]); m2 = Number(p[1] || 0); }
      else if (t.length <= 2) { h2 = Number(t); m2 = 0; }
      else { h2 = Number(t.slice(0, t.length - 2)); m2 = Number(t.slice(-2)); }
      if (t && !isNaN(h2) && !isNaN(m2) && h2 >= 0 && h2 <= 24 && m2 >= 0 && m2 < 60) set(h2 === 24 ? 0 : h2, m2);
      setDraft(null);
    }
    var C = 120, OUT = 92, IN = 60;
    function at(deg, r) { var a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; }
    function read(e) {
      var box = e.currentTarget.getBoundingClientRect(), k = box.width / (C * 2);
      var x = (e.clientX - box.left) / k - C, y = (e.clientY - box.top) / k - C;
      var deg = Math.atan2(y, x) * 180 / Math.PI + 90; if (deg < 0) deg += 360;
      return { deg: deg, dist: Math.sqrt(x * x + y * y) };
    }
    function valueAt(p, fine) {
      if (stage === 'h') {
        var slot = Math.round(p.deg / 30) % 12, innerRing = p.dist < (OUT + IN) / 2;
        return innerRing ? (slot === 0 ? 0 : slot + 12) : (slot === 0 ? 12 : slot);
      }
      return fine ? Math.round(p.deg / 6) % 60 : (Math.round(p.deg / 30) * 5) % 60;
    }
    function apply(v) { if (stage === 'h') set(v, mm); else set(hh, v); }
    var handDeg = stage === 'h' ? (hh % 12) * 30 : mm * 6;
    var handR = stage === 'h' ? (hh === 0 || hh > 12 ? IN : OUT) : OUT;
    var ghost = hover == null ? null : stage === 'h' ? { deg: (hover % 12) * 30, r: hover === 0 || hover > 12 ? IN : OUT } : { deg: hover * 6, r: OUT };
    var nums = [];
    for (var i = 0; i < 12; i++) {
      if (stage === 'h') {
        nums.push({ k: 'o' + i, deg: i * 30, r: OUT, t: i === 0 ? '12' : String(i), v: i === 0 ? 12 : i });
        nums.push({ k: 'i' + i, deg: i * 30, r: IN, t: i === 0 ? '00' : String(i + 12), v: i === 0 ? 0 : i + 12, inner: true });
      } else nums.push({ k: 'm' + i, deg: i * 30, r: OUT, t: pad2(i * 5), v: i * 5 });
    }
    var sel = stage === 'h' ? hh : mm;
    var zone = props.zone;
    var offices = props.offices === false ? [] : (props.offices || OFFICES);
    var others = zone ? offices.filter(function (o) { return o[0] !== zone; }).map(function (o) {
      var mins = hh * 60 + mm - tzMinutes(zone, props.now) + tzMinutes(o[0], props.now);
      var day = Math.floor(mins / 1440), t = ((mins % 1440) + 1440) % 1440;
      return o[1] + ' ' + pad2(Math.floor(t / 60)) + ':' + pad2(t % 60) + (day < 0 ? ' the day before' : day > 0 ? ' the next day' : '');
    }) : [];
    var presets = props.presets === false ? [] : (props.presets || ['08:00', '09:00', '12:00', '14:00', '18:00']);
    function seg(which) {
      return {
        type: 'button', 'aria-label': (which === 'h' ? 'Hour, ' + hh : 'Minute, ' + mm), 'aria-pressed': stage === which ? 'true' : 'false',
        className: cx('rr-time__seg', stage === which && 'rr-time__seg--on'),
        onClick: function () { setStage(which); },
        onKeyDown: function (e) {
          var d = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
          if (d) { e.preventDefault(); if (which === 'h') set(hh + d, mm); else set(hh, mm + d); }
        }
      };
    }
    var dial = h('svg', {
      key: 's', className: 'rr-time__dial', viewBox: '0 0 240 240', 'aria-hidden': 'true',
      onPointerDown: function (e) { e.currentTarget.setPointerCapture(e.pointerId); apply(valueAt(read(e), false)); },
      onPointerMove: function (e) { var p = read(e); if (e.buttons) apply(valueAt(p, stage === 'm')); else setHover(valueAt(p, false)); },
      onPointerLeave: function () { setHover(null); },
      onPointerUp: function (e) { apply(valueAt(read(e), stage === 'm')); if (stage === 'h') { setStage('m'); setHover(null); } }
    }, [
      h('circle', { key: 'bg', cx: C, cy: C, r: C - 2, className: 'rr-time__face' }),
      stage === 'h' ? h('circle', { key: 'band', cx: C, cy: C, r: IN + 18, className: 'rr-time__band' }) : null,
      stage === 'm' ? h('g', { key: 'ticks' }, Array.apply(null, Array(60)).map(function (_, t) {
        var a = at(t * 6, OUT + 22), b = at(t * 6, t % 5 ? OUT + 18 : OUT + 15);
        return h('line', { key: t, x1: a[0], y1: a[1], x2: b[0], y2: b[1], className: cx('rr-time__tick', !(t % 5) && 'rr-time__tick--five') });
      })) : null,
      ghost ? h('circle', { key: 'gh', cx: at(ghost.deg, ghost.r)[0], cy: at(ghost.deg, ghost.r)[1], r: 16, className: 'rr-time__ghost' }) : null,
      h('g', { key: 'hand', className: 'rr-time__hand', style: { transform: 'rotate(' + handDeg + 'deg)' } }, [
        h('line', { key: 'l', x1: C, y1: C, x2: C, y2: C - handR + 16 }),
        h('circle', { key: 'k', cx: C, cy: C - handR, r: 17, className: 'rr-time__knob' }),
        stage === 'm' && mm % 5 ? h('circle', { key: 'd', cx: C, cy: C - handR, r: 2.5, className: 'rr-time__dot' }) : null
      ]),
      h('circle', { key: 'c', cx: C, cy: C, r: 4, className: 'rr-time__pin' })
    ].concat(nums.map(function (n) {
      var p = at(n.deg, n.r);
      var on = n.v === sel && !(stage === 'h' && ((handR === IN) !== !!n.inner));
      return h('text', { key: n.k, x: p[0], y: p[1], dy: '0.35em', textAnchor: 'middle', className: cx('rr-time__num', n.inner && 'rr-time__num--in', on && 'rr-time__num--on') }, n.t);
    })));
    var control = h('div', { className: 'rr-time', ref: wrap }, [
      h('div', { key: 'f', className: cx('rr-time__field', 'rr-time__field--' + (props.size || 'sm'), open && 'rr-time__field--open') }, [
        h('input', {
          key: 'i', ref: field, id: id, className: 'rr-time__input', inputMode: 'numeric', autoComplete: 'off', disabled: props.disabled,
          'aria-describedby': id + '-how',
          value: draft != null ? draft : value,
          onChange: function (e) { setDraft(e.target.value); },
          onBlur: function (e) { commit(e.target.value); },
          onKeyDown: function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(e.target.value); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); set(hh, mm + (e.key === 'ArrowUp' ? 5 : -5)); }
          }
        }),
        h('button', { key: 'b', type: 'button', className: 'rr-time__open', disabled: props.disabled,
          'aria-label': open ? (props.closeLabel || 'Close the clock') : (props.openLabel || 'Open the clock'),
          'aria-expanded': open ? 'true' : 'false', 'aria-haspopup': 'dialog',
          onClick: function () { setStage('h'); setOpen(!open); } }, Icons.clock({ width: 15, height: 15, 'aria-hidden': 'true' }))
      ]),
      h('span', { key: 'how', id: id + '-how', className: 'rr-visually-hidden' }, props.howLabel || 'Type a time like 0830, or use the arrow keys to move by five minutes.'),
      open ? h('div', { key: 'p', className: 'rr-time__pop', role: 'dialog', 'aria-label': props.dialogLabel || 'Choose a time' }, [
        h('div', { key: 'h', className: 'rr-time__head' }, [
          h('div', { key: 'r', className: 'rr-time__read' }, [
            h('button', Object.assign({ key: 'h' }, seg('h')), pad2(hh)),
            h('span', { key: 'c', className: 'rr-time__colon', 'aria-hidden': 'true' }, ':'),
            h('button', Object.assign({ key: 'm' }, seg('m')), pad2(mm))
          ]),
          h('span', { key: 'd', className: 'rr-time__day' }, partOfDay(hh))
        ]),
        dial,
        presets.length ? h('div', { key: 'q', className: 'rr-time__quick', role: 'group', 'aria-label': 'Common times' }, presets.map(function (t) {
          return h('button', { key: t, type: 'button', className: 'rr-time__chip', 'aria-pressed': value === t ? 'true' : 'false',
            onClick: function () { var p = t.split(':'); set(Number(p[0]), Number(p[1])); } }, t);
        })) : null,
        others.length ? h('p', { key: 'o', className: 'rr-time__others' }, [Icons.globe({ key: 'g', width: 13, height: 13, 'aria-hidden': 'true' }), others.join(', ')]) : null,
        h('div', { key: 'f', className: 'rr-time__foot' }, [
          h('span', { key: 's' }, stage === 'h' ? (props.hourHint || 'Choose the hour') : (props.minuteHint || 'Tap for five-minute steps, drag for any minute')),
          h(Button, { key: 'd', size: 'sm', variant: 'primary', onClick: function () { close(true); } }, props.doneLabel || 'Done')
        ])
      ]) : null
    ]);
    return Field(Object.assign({}, props, { id: id }), control);
  }

  /* ---- SchedulePicker: once, on repeat, or when something happens -------- */

  var WEEKDAYS = [['1', 'Mon', 'Monday'], ['2', 'Tue', 'Tuesday'], ['3', 'Wed', 'Wednesday'], ['4', 'Thu', 'Thursday'], ['5', 'Fri', 'Friday'], ['6', 'Sat', 'Saturday'], ['0', 'Sun', 'Sunday']];
  function isoDay(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function shortDay(d) { return d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.getDate() + ' ' + d.toLocaleDateString('en-US', { month: 'short' }); }
  function nextScheduledRun(w, now) {
    now = now || new Date();
    var t = String(w.time || '09:00').split(':'), hh = Number(t[0]), mm = Number(t[1]);
    var start = new Date((w.mode === 'once' ? w.date : w.start) + 'T00:00:00');
    if (isNaN(start)) return null;
    for (var i = 0; i < 400; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i); d.setHours(hh, mm, 0, 0);
      if (d <= now) { if (w.mode === 'once') return null; continue; }
      if (w.mode === 'once') return d;
      var dow = d.getDay(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (w.freq === 'daily' || (w.freq === 'weekdays' && dow > 0 && dow < 6) || (w.freq === 'weekly' && (w.days || []).indexOf(String(dow)) >= 0) ||
          (w.freq === 'monthly' && (w.dom === 'last' ? d.getDate() === last : d.getDate() === Number(w.dom)))) return d;
    }
    return null;
  }
  function andList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function describeSchedule(w, opts) {
    opts = opts || {};
    if (w.mode === 'event') return 'Runs each time a new file arrives in ' + (opts.where || 'the project') + '.';
    var zone = zoneCity(w.zone, opts.zones) + ' time', now = opts.now || new Date();
    var n = nextScheduledRun(w, now);
    if (w.mode === 'once') return n ? 'Runs once, on ' + shortDay(n) + ' at ' + w.time + ' ' + zone + '.' : 'That time has passed. Choose a later one.';
    var names = WEEKDAYS.filter(function (d) { return (w.days || []).indexOf(d[0]) >= 0; }).map(function (d) { return d[2]; });
    var how = { daily: 'Every day', weekdays: 'Every weekday', weekly: names.length ? 'Every ' + andList(names) : 'Choose at least one day',
      monthly: w.dom === 'last' ? 'On the last day of each month' : 'On day ' + w.dom + ' of each month' }[w.freq];
    return how + ' at ' + w.time + ' ' + zone + '.' + (n ? ' Next run ' + (isoDay(n) === isoDay(now) ? 'today' : shortDay(n)) + '.' : '');
  }

  function SchedulePicker(props) {
    props = props || {};
    var now = props.now || new Date();
    var controlled = props.value !== undefined;
    var base = { mode: 'repeat', date: isoDay(new Date(now.getTime() + 86400000)), start: isoDay(now), time: '09:00', zone: 'Asia/Seoul', freq: 'weekly', days: ['1'], dom: '1' };
    var inner = React.useState(Object.assign({}, base, props.defaultValue || {}));
    var w = controlled ? Object.assign({}, base, props.value) : inner[0];
    var gid = useStableId('rr-sched');
    function set(k, v) {
      var next = Object.assign({}, w); next[k] = v;
      if (!controlled) inner[1](next);
      if (props.onChange) props.onChange(next);
    }
    var modes = props.modes || [['once', 'Once'], ['repeat', 'Repeats'], ['event', 'On a new file']];
    var dom = [];
    for (var i = 1; i <= 28; i++) dom.push({ value: String(i), label: String(i) });
    dom.push({ value: 'last', label: 'Last day of the month' });
    return h('div', { className: cx('rr-sched', props.className) }, [
      h('span', { key: 'h', className: 'rr-sched__label', id: gid }, props.label || 'When'),
      h('div', { key: 's', className: 'rr-seg rr-sched__modes', role: 'radiogroup', 'aria-labelledby': gid }, modes.map(function (m) {
        return h('button', { key: m[0], type: 'button', role: 'radio', 'aria-checked': w.mode === m[0] ? 'true' : 'false', onClick: function () { set('mode', m[0]); } }, m[1]);
      })),
      w.mode === 'once' ? h(DatePicker, { key: 'd', label: props.dateLabel || 'Date', size: 'sm', value: w.date, onChange: function (v) { if (v) set('date', v); }, locale: props.locale, weekStart: props.weekStart }) : null,
      w.mode === 'repeat' ? h(Select, { key: 'f', label: props.repeatLabel || 'Repeats', size: 'sm', value: w.freq, onChange: function (e) { set('freq', e.target.value); },
        options: [{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Every weekday', detail: 'Monday to Friday' },
          { value: 'weekly', label: 'Every week', detail: 'On the days you pick' }, { value: 'monthly', label: 'Every month', detail: 'On one date' }] }) : null,
      w.mode === 'repeat' && w.freq === 'weekly' ? h('div', { key: 'dw', className: 'rr-sched__days', role: 'group', 'aria-label': 'Days of the week' }, WEEKDAYS.map(function (d) {
        var on = (w.days || []).indexOf(d[0]) >= 0;
        return h('button', { key: d[0], type: 'button', className: 'rr-sched__day', 'aria-pressed': on ? 'true' : 'false', 'aria-label': d[2],
          onClick: function () { set('days', on ? w.days.filter(function (x) { return x !== d[0]; }) : (w.days || []).concat([d[0]])); } }, d[1]);
      })) : null,
      w.mode === 'repeat' && w.freq === 'monthly' ? h(Select, { key: 'm', label: props.dayOfMonthLabel || 'Day of the month', size: 'sm', value: w.dom, onChange: function (e) { set('dom', e.target.value); }, options: dom }) : null,
      w.mode !== 'event' ? h('div', { key: 't', className: 'rr-sched__row' }, [
        h(TimePicker, { key: 't', label: props.timeLabel || 'Time', value: w.time, zone: w.zone, now: now, offices: props.offices, onChange: function (v) { set('time', v); } }),
        h(TimeZonePicker, { key: 'z', label: props.zoneLabel || 'Time zone', value: w.zone, now: now, zones: props.zones, onChange: function (v) { set('zone', v); } })
      ]) : null,
      w.mode === 'repeat' ? h(DatePicker, { key: 'st', label: props.startLabel || 'Starting', size: 'sm', value: w.start, onChange: function (v) { if (v) set('start', v); }, locale: props.locale, weekStart: props.weekStart }) : null,
      h('p', { key: 'sum', className: 'rr-sched__sum', 'aria-live': 'polite' }, [
        Icons[w.mode === 'event' ? 'folder' : 'calendarClock']({ key: 'i', width: 14, height: 14, 'aria-hidden': 'true' }),
        describeSchedule(w, { where: props.where, now: now, zones: props.zones })
      ]),
      props.note !== false ? h('p', { key: 'n', className: 'rr-sched__note' }, props.note || 'On a schedule, it still stops at every step marked "Asks you first", and waits for you.') : null
    ]);
  }

  /* ---- AppAccess: what a playbook can reach ------------------------------ */

  var ACCESS = { read: 'Can read', write: 'Can read and write' };

  function AppAccess(props) {
    props = props || {};
    var apps = props.apps || [];
    var byId = {};
    apps.forEach(function (a) { byId[a.id] = a; });
    var controlled = props.value !== undefined;
    var inner = React.useState(props.defaultValue || []);
    var list = controlled ? props.value : inner[0];
    var as = React.useState(false), adding = as[0], setAdding = as[1];
    var qs = React.useState(''), q = qs[0], setQ = qs[1];
    var ps = React.useState({}), pick = ps[0], setPick = ps[1];
    function change(next) { if (!controlled) inner[1](next); if (props.onChange) props.onChange(next); }
    var have = {};
    list.forEach(function (x) { have[x.id] = true; });
    var shown = apps.filter(function (a) {
      return !have[a.id] && (!q || (a.name + ' ' + (a.category || '') + ' ' + (a.maker || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0);
    });
    var picked = Object.keys(pick).filter(function (k) { return pick[k]; });
    function reset() { setAdding(false); setPick({}); setQ(''); }
    function add() {
      change(list.concat(picked.map(function (id) { return { id: id, mode: 'read' }; })));
      picked.forEach(function (id) { if (!byId[id].connected && props.onConnect) props.onConnect(id); });
      reset();
    }
    var labels = props.accessLabels || ACCESS;
    var reachN = list.filter(function (x) { return byId[x.id] && byId[x.id].connected; }).length;
    var writeN = list.filter(function (x) { return byId[x.id] && byId[x.id].connected && x.mode === 'write'; }).length;
    function pickRow(a) {
      return h('li', { key: a.id }, h(Checkbox, {
        className: 'rr-access__pick', checked: !!pick[a.id],
        onChange: function () { var n = Object.assign({}, pick); n[a.id] = !pick[a.id]; setPick(n); },
        label: h('span', { className: 'rr-access__picklab' }, [
          h('span', { key: 'i', className: 'rr-access__pickicon', 'aria-hidden': 'true' }, a.logo ? h('img', { src: a.logo, alt: '' }) : a.icon),
          h('span', { key: 't', className: 'rr-access__t' }, [h('b', { key: 'b' }, a.name), h('span', { key: 's' }, [a.category, a.description].filter(Boolean).join(' - '))]),
          h('span', { key: 'm', className: 'rr-access__state' }, a.connected ? (props.connectedLabel || 'Connected') : (props.connectsLabel || 'Connects when added'))
        ])
      }));
    }
    var fixed = [
      h('li', { key: 'files', className: 'rr-access__i' }, [
        h('span', { key: 'i', className: 'rr-access__icon', 'aria-hidden': 'true' }, Icons.folder({ width: 15, height: 15 })),
        h('span', { key: 't', className: 'rr-access__t' }, [h('b', { key: 'b' }, props.filesLabel || 'The project\'s files'), h('span', { key: 's' }, props.filesNote || 'Always included')]),
        h('span', { key: 'm', className: 'rr-access__fixed' }, labels.write)
      ]),
      props.memory !== undefined ? h('li', { key: 'mem', className: 'rr-access__i' }, [
        h('span', { key: 'i', className: 'rr-access__icon', 'aria-hidden': 'true' }, Icons.bookOpen({ width: 15, height: 15 })),
        h('span', { key: 't', className: 'rr-access__t' }, [h('b', { key: 'b' }, props.memoryLabel || 'The project\'s memory'),
          h('span', { key: 's' }, props.memory ? (props.memoryOnNote || 'Reads the notes before each run') : (props.memoryOffNote || 'Off for this playbook'))]),
        h(Switch, { key: 'sw', size: 'sm', checked: !!props.memory, onChange: function () { if (props.onMemoryChange) props.onMemoryChange(!props.memory); }, label: h('span', { className: 'rr-visually-hidden' }, props.memoryLabel || 'The project\'s memory') })
      ]) : null
    ];
    return h('div', { className: cx('rr-access', props.className) }, [
      h('span', { key: 'h', className: 'rr-access__label' }, props.label || 'What it can reach'),
      h('ul', { key: 'l', className: 'rr-access__list' }, fixed.concat(list.map(function (x) {
        var a = byId[x.id]; if (!a) return null;
        return h('li', { key: x.id, className: 'rr-access__i rr-access__i--app' }, [
          h('span', { key: 'i', className: 'rr-access__icon', 'aria-hidden': 'true' }, a.logo ? h('img', { src: a.logo, alt: '' }) : a.icon),
          h('span', { key: 't', className: 'rr-access__t' }, [h('b', { key: 'b' }, a.name), h('span', { key: 's' }, a.connected ? a.category : (props.notConnectedLabel || 'Not connected yet'))]),
          h(IconButton, { key: 'x', size: 'sm', label: 'Remove ' + a.name, onClick: function () { change(list.filter(function (y) { return y.id !== x.id; })); } }, Icons.close({ width: 14, height: 14 })),
          a.connected
            ? h(Select, { key: 'm', size: 'sm', label: a.name + ' access', className: 'rr-access__mode', value: x.mode,
                onChange: function (e) { change(list.map(function (y) { return y.id === x.id ? Object.assign({}, y, { mode: e.target.value }) : y; })); },
                options: [{ value: 'read', label: labels.read, detail: 'Finds and reads. Changes nothing.' }, { value: 'write', label: labels.write, detail: 'Can also draft, edit and save.' }] })
            : h(Button, { key: 'm', size: 'sm', variant: 'secondary', className: 'rr-access__mode', onClick: function () { if (props.onConnect) props.onConnect(x.id); } }, 'Connect ' + a.name)
        ]);
      }))),
      h(Button, { key: 'add', size: 'sm', variant: 'secondary', fullWidth: true, iconLeft: Icons.plus({ width: 14, height: 14 }), onClick: function () { setAdding(true); } }, props.addLabel || 'Add an app'),
      h('p', { key: 'n', className: 'rr-access__note' }, (props.summary ? props.summary(reachN, writeN) :
        'Reads ' + reachN + ' app' + (reachN === 1 ? '' : 's') + (writeN ? ', writes to ' + writeN : '') + '. ') +
        (props.note || 'Anything it sends, posts, signs or pays for waits for you at the steps marked "Asks you first".')),
      h(Modal, { key: 'mo', open: adding, title: props.dialogTitle || 'Add an app', width: 560, onClose: reset,
        footer: [h(Button, { key: 'c', variant: 'ghost', onClick: reset }, 'Cancel'),
          h(Button, { key: 'a', variant: 'primary', disabled: !picked.length, onClick: add }, picked.length ? 'Add ' + picked.length + ' app' + (picked.length === 1 ? '' : 's') : 'Add apps')] }, [
        h(Input, { key: 'q', label: props.searchLabel || 'Search apps', placeholder: props.searchPlaceholder || 'Gmail, Jira, files, CRM...', value: q, onChange: function (e) { setQ(e.target.value); } }),
        h('div', { key: 'lists', className: 'rr-access__picklist' }, shown.length ? [
          shown.some(function (a) { return a.connected; }) ? h('div', { key: 'ch', className: 'rr-access__pickh' }, props.connectedLabel || 'Connected') : null,
          h('ul', { key: 'c' }, shown.filter(function (a) { return a.connected; }).map(pickRow)),
          shown.some(function (a) { return !a.connected; }) ? h('div', { key: 'nh', className: 'rr-access__pickh' }, props.notConnectedLabel || 'Not connected yet') : null,
          h('ul', { key: 'n' }, shown.filter(function (a) { return !a.connected; }).map(pickRow))
        ] : h('p', { className: 'rr-access__empty' }, props.emptyText || 'No app by that name yet.')),
        h('p', { key: 'note', className: 'rr-access__note' }, props.startNote || 'Each app starts as Can read. You can change it once it is added.')
      ])
    ]);
  }

  /* ---- Merged components ----------------------------------------------- */
  /* Meter: what has been used against what there is. With `segments` it is the
     working-memory bar (shares of one whole); without, used against a budget. */
  function Meter(props) { props = props || {}; return props.segments ? h(MemoryMeter, props) : h(CostMeter, props); }
  /* Opinion: what Fact check found, inside an answer. kind "differs" (the default) marks a
     sentence another AI reads differently, opened in place; kind "added" is what it
     thinks the answer missed, set after the answer and never merged into it. */
  function Opinion(props) { props = props || {}; return props.kind === 'added' ? h(OpinionAdded, props) : h(Disputed, props); }
  /* ThreadNote: a one-line note in the conversation. kind "model" (the default) when
     a different AI takes over; kind "memory" when something is saved, with Undo. */
  function ThreadNote(props) { props = props || {}; return props.kind === 'memory' ? h(MemorySaved, props) : h(ModelSwitch, props); }
  /* PostList: the list under an IndexHeader; variant "section" is the homepage's
     news band (lead story, three headlines, a link to News). */
  function PostListAny(props) { return props && props.variant === 'section' ? h(NewsSection, props) : h(PostList, props); }

  window.Redrob = {
    ComposerStatus: ComposerStatus,
    ProtectionStatus: ProtectionStatus,
    PrivacyProtection: PrivacyProtection,
    MemoryScope: MemoryScope,
    CrossCheckSetting: CrossCheckSetting,
    ComposerMode: ComposerMode,
    PlanQuestions: PlanQuestions,
    PlanDocument: PlanDocument,
    FactCheckReport: FactCheckReport,
    ChallengeReport: ChallengeReport,
    AnswerReceipt: AnswerReceipt,
    PrivateText: PrivateText,
    Opinion: Opinion,
    ThreadNote: ThreadNote,
    MemoryList: MemoryList,
    OpinionGrid: OpinionGrid,
    PlaybookRow: PlaybookRow,
    ConnectorCard: ConnectorCard,
    TimePicker: TimePicker,
    TimeZonePicker: TimeZonePicker,
    SchedulePicker: SchedulePicker,
    AppAccess: AppAccess,
    Display: Display,
    Layer: Layer,
    Diagram: Diagram,
    Button: Button,
    IconButton: IconButton,
    Input: Input,
    Textarea: Textarea,
    Select: Select,
    Checkbox: Checkbox,
    Radio: Radio,
    Switch: Switch,
    Badge: Badge,
    Avatar: Avatar,
    Card: Card,
    SectionMark: SectionMark,
    Alert: Alert,
    Toast: Toast,
    Modal: Modal,
    Tooltip: Tooltip,
    Tabs: Tabs,
    Table: Table,
    Progress: Progress,
    Pagination: Pagination,
    Breadcrumb: Breadcrumb,
    Menu: Menu,
    Combobox: Combobox,
    DatePicker: DatePicker,
    FileUpload: FileUpload,
    Stat: Stat,
    Skeleton: Skeleton,
    EmptyState: EmptyState,
    Drawer: Drawer,
    Accordion: Accordion,
    Stepper: Stepper,
    Message: Message,
    Streaming: Streaming,
    Citation: Citation,
    AgentAction: AgentAction,
    Confidence: Confidence,
    ApprovalStep: ApprovalStep,
    AgentTimeline: AgentTimeline,
    PromptSuggestions: PromptSuggestions,
    Composer: Composer,
    ModelPicker: ModelPicker,
    ModelGuide: ModelGuide,
    Scroller: Scroller,
    MarkReveal: MarkReveal,
    Loader: Loader,
    Changes: Changes,
    Meter: Meter,
    AccessList: AccessList,
    TaskStatus: TaskStatus,
    AgentRoster: AgentRoster,
    AgentHandoff: AgentHandoff,
    ScheduleRow: ScheduleRow,
    CheckIn: CheckIn,
    Statement: Statement,
    Quote: Quote,
    Criteria: Criteria,
    SourceSet: SourceSet,
    Evidence: Evidence,
    ReviewGrid: ReviewGrid,
    MatchBreakdown: MatchBreakdown,
    Redline: Redline,
    Finding: Finding,
    Playbook: Playbook,
    Shortlist: Shortlist,
    DecisionNotice: DecisionNotice,
    DateInput: DateInput,
    dateParts: dateParts,
    NameInput: NameInput,
    Money: Money,
    ConvertedAmount: ConvertedAmount,
    Timestamp: Timestamp,
    AddressInput: AddressInput,
    PhoneInput: PhoneInput,
    Illustration: Illustration,
    illustrations: Illustrations,
    Chart: Chart,
    Sparkline: Sparkline,
    Mark: Mark,
    AppShell: AppShell,
    PageShell: PageShell,
    Band: Band,
    SiteHeader: SiteHeader,
    SiteFooter: SiteFooter,
    LangSwitch: LangSwitch,
    ThemeSwitch: ThemeSwitch,
    ConsentBar: ConsentBar,
    Hero: Hero,
    FeatureRow: FeatureRow,
    Figure: Figure,
    LogoRow: LogoRow,
    CustomerStory: CustomerStory,
    Form: Form,
    PriceTable: PriceTable,
    ArticleLayout: ArticleLayout,
    PostList: PostListAny,
    IndexHeader: IndexHeader,
    Milestones: Milestones,
    PeopleList: PeopleList,
    StoryHeader: StoryHeader,
    LegalDoc: LegalDoc,
    icons: Icons
  };
})();
