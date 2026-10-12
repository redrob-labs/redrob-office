#!/usr/bin/env node
'use strict';

/**
 * Behaviour of the ModelGuide additions that the parity gate cannot see, because the reference
 * delivery's preview passes none of them: the working-language select, models run in sequence,
 * kind badges, the monthly range, tool tags and the sources list. Also asserts a guide given none of
 * these props renders none of their markup, so the reference markup stays untouched.
 *
 *   node tools/check/model-guide.js      (after yarn build)
 */

const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
const { ModelGuide } = require(require('path').join(__dirname, '..', '..', 'dist', 'index.js'));
const pick = (id, extra) => Object.assign({ id, model: id.toUpperCase(), harness: 'Redrob Desk', monthly: 12.5, effort: { label: 'High', level: 3, of: 4 } }, extra);
const professions = [{ id: 'lawyer', label: 'Lawyer', tasks: [{ id: 'review', label: 'Review contracts',
  picks: [pick('base')],
  picksByLanguage: {
    en: [pick('en1', { kind: 'derived', monthlyKind: 'estimate', monthlyRange: [6, 25] })],
    ko: [pick('ko1', { steps: [{ model: 'Muse Spark 1.3', role: 'Legal analysis' }, { model: 'Gemini 3.8 Flash', role: 'Korean drafting' }],
      comingSoon: true, flags: ['Data policy unverified'], tools: [{ label: 'File read' }, { label: 'UI design', soon: true }, { label: 'Browser', missing: true }],
      sources: [{ label: 'Harvey LAB', value: '23.75%', kind: 'measured', url: 'https://www.vals.ai/benchmarks/hlab', date: '2026-10-02' }] })],
  } }] }];
const langs = [{ value: 'en', label: 'English' }, { value: 'ko', label: '한국어' }, { value: 'hi', label: 'हिन्दी' }];
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const en = renderToStaticMarkup(React.createElement(ModelGuide, { professions, languages: langs }));
ok(en.includes('EN1') && !en.includes('KO1'), 'default language = first, uses picksByLanguage.en');
ok(en.includes('rr-guide__ask--lang') && en.includes('한국어'), 'language select rendered');
ok(en.includes('Derived') && en.includes('Estimate') && en.includes('Likely between'), 'kind badges + monthly range');
const ko = renderToStaticMarkup(React.createElement(ModelGuide, { professions, languages: langs, language: 'ko' }));
ok(ko.includes('Muse Spark 1.3 \u2192 Gemini 3.8 Flash'), 'chain name A -> B');
ok(ko.includes('rr-guide__steps') && ko.includes('Korean drafting'), 'chain steps with roles');
ok((ko.match(/Coming soon/g) || []).length >= 2 && ko.includes('Data policy unverified'), 'coming soon + flags');
ok(ko.includes('is-missing') && ko.includes('is-soon'), 'tool tags');
ok(ko.includes('rr-guide__sources') && ko.includes('rel="noopener noreferrer"') && ko.includes('23.75%'), 'sources disclosure');
const hi = renderToStaticMarkup(React.createElement(ModelGuide, { professions, languages: langs, language: 'hi' }));
ok(hi.includes('BASE'), 'missing language falls back to picks');
const plain = renderToStaticMarkup(React.createElement(ModelGuide, { professions: [{ id: 'x', label: 'X', tasks: [{ id: 't', label: 'T', picks: [pick('p')] }] }] }));
ok(!/rr-guide__(badges|steps|tools|sources|costr|ask--lang)/.test(plain), 'no new markup without new props');

// A keyed language holding no ranking yet falls back as an absent key does; `[]` is truthy.
const blank = [{ id: 'lawyer', label: 'Lawyer', tasks: [{ id: 'review', label: 'Review contracts', emptyText: 'Nothing ranked yet', picks: [pick('base')], picksByLanguage: { en: [], ko: [pick('ko1')] } }] }];
const emptyLang = renderToStaticMarkup(React.createElement(ModelGuide, { professions: blank, languages: langs }));
ok(emptyLang.includes('BASE') && !emptyLang.includes('rr-guide__empty'), 'empty language array falls back to picks');

// `steps` makes `model` optional, so a one-step pick must still be named.
const one = renderToStaticMarkup(React.createElement(ModelGuide, { professions: [{ id: 'p', label: 'P', tasks: [{ id: 't', label: 'T',
  picks: [{ id: 's', harness: 'Redrob Desk', monthly: 9, effort: { label: 'High', level: 3, of: 4 }, steps: [{ model: 'Muse Spark 1.3', role: 'Only step' }] }] }] }] }));
ok(/rr-guide__dname[^>]*>Muse Spark 1\.3/.test(one), 'one-step pick is named from its step');

// A pick carrying only a range has no single figure, so the unit goes with it.
const rangeOnly = renderToStaticMarkup(React.createElement(ModelGuide, { professions: [{ id: 'p', label: 'P', tasks: [{ id: 't', label: 'T',
  picks: [{ id: 'r', model: 'R', harness: 'H', effort: { label: 'High', level: 3, of: 4 }, monthlyRange: [6, 25], monthlyKind: 'estimate' }] }] }] }));
ok(!rangeOnly.includes('rr-guide__costv') && rangeOnly.includes('Likely between'), 'no bare unit without a monthly figure');

// Every string beside a tool tag takes a prop.
const ko2 = renderToStaticMarkup(React.createElement(ModelGuide, { professions, languages: langs, language: 'ko', comingSoonLabel: '곧 지원', missingLabel: '지원 안 함' }));
ok(ko2.includes('지원 안 함') && !ko2.includes('not available'), 'missingLabel replaces the hardcoded English');

// 1.2.1: labels a consumer translates, and no empty sample boxes when a pick has no run.
const lab = renderToStaticMarkup(React.createElement(ModelGuide, { professions, languages: langs,
  harnessLabel: (h) => `(${h})`, rankLabel: (n, t) => `${t} ${n}위`, effortUnit: '' }));
ok(lab.includes('(Redrob Desk)') && !lab.includes('on Redrob Desk'), 'harnessLabel replaces "on <harness>"');
ok(lab.includes('Review contracts 1위') && !lab.includes('#1 for'), 'rankLabel replaces "#1 for <task>"');
ok(!lab.includes('High effort') && lab.includes('High'), "effortUnit '' shows the level alone");
ok(!lab.includes('rr-guide__sample'), 'no prompt/output boxes without a run');
const run = renderToStaticMarkup(React.createElement(ModelGuide, { professions: [{ id: 'x', label: 'X', tasks: [{ id: 't', label: 'T', prompt: 'Ask', picks: [pick('p', { sample: { output: 'Out' } })] }] }] }));
ok(run.includes('rr-guide__sample') && run.includes('High effort') && run.includes('on Redrob Desk'), 'defaults unchanged with a run');

// Layout: the guide reflows on its own width (a product frame's column), not the viewport's. The
// browser behaviour is checked in the Cowork screenshot sweep; this keeps the rules from being dropped.
const css = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'dist', 'styles', 'system.css'), 'utf8');
ok(/\.rr-guide\s*\{\s*container:\s*rr-guide\s*\/\s*inline-size/.test(css) && /@container rr-guide \(max-width: 880px\)/.test(css),
  'guide grid and selects stack on a narrow container');
ok(/@container rr-guide-detail \(max-width: 480px\)/.test(css), 'detail header stacks on a narrow detail');

// Outputs: a select listing "anything" and only the outputs this task is ranked for, re-ranking from
// picksByOutput[output][language], and falling back to the task's ranking when the output is not keyed.
const outs = [{ value: 'presentation', label: 'Presentations' }, { value: 'graphic', label: 'Graphics' }, { value: 'document', label: 'Documents' }];
const outProf = [{ id: 'founder', label: 'Founder', tasks: [
  { id: 'raise', label: 'Raise funding', picks: [pick('base')],
    picksByLanguage: { en: [pick('anyen')], ko: [pick('anyko')] },
    picksByOutput: { presentation: { en: [pick('decken')], ko: [pick('deckko')] }, graphic: { en: [pick('arten')] } } },
  { id: 'plan', label: 'Plan finances', picks: [pick('planbase')] },
] }];
const outAny = renderToStaticMarkup(React.createElement(ModelGuide, { professions: outProf, languages: langs, outputs: outs }));
ok(outAny.includes('rr-guide__ask--out') && outAny.includes('rr-guide__ask--lang') && outAny.includes('I need'), 'output select rendered beside language');
ok(outAny.includes('Anything') && outAny.includes('Presentations') && outAny.includes('Graphics') && !outAny.includes('Documents'), 'output options are anything + the outputs the task is ranked for');
ok(outAny.includes('ANYEN') && !outAny.includes('DECKEN'), 'no output chosen = the task ranking for the language');
const outDeck = renderToStaticMarkup(React.createElement(ModelGuide, { professions: outProf, languages: langs, outputs: outs, output: 'presentation', language: 'ko' }));
ok(outDeck.includes('DECKKO') && !outDeck.includes('ANYKO'), 'output re-ranks per language');
const outGap = renderToStaticMarkup(React.createElement(ModelGuide, { professions: outProf, languages: langs, outputs: outs, output: 'graphic', language: 'ko' }));
ok(outGap.includes('ANYKO') && !outGap.includes('rr-guide__empty'), 'output with no ranking for the language falls back to the task ranking');
const outOther = renderToStaticMarkup(React.createElement(ModelGuide, { professions: outProf, languages: langs, outputs: outs, output: 'presentation', task: 'plan' }));
ok(outOther.includes('PLANBASE') && /role="combobox" disabled=""/.test(outOther) && !outOther.includes('Presentations'), 'a task ranked for no output reads as anything, select disabled');
const outNoLang = renderToStaticMarkup(React.createElement(ModelGuide, { professions: outProf, outputs: outs, output: 'presentation' }));
ok(outNoLang.includes('DECKEN') && !outNoLang.includes('rr-guide__ask--lang'), 'output without a language select reads its first language');

// Benchmarks: greyed, unranked, no "use" action, and never counted against the limit.
const benchProf = [{ id: 'p', label: 'P', tasks: [{ id: 't', label: 'T', picks: [
  pick('r1'), pick('b1', { benchmark: true, harness: 'Claude Cowork' }), pick('r2'), pick('r3'), pick('r4'), pick('r5'),
  pick('b5', { benchmark: true, harness: 'ChatGPT Work' }), pick('r6'), pick('b6', { benchmark: true }),
] }] }];
const bench = renderToStaticMarkup(React.createElement(ModelGuide, { professions: benchProf, benchmarkLabel: 'Benchmark' }));
ok((bench.match(/is-benchmark/g) || []).length === 2, 'benchmarks within the top five render greyed');
ok(bench.includes('R5') && !bench.includes('R6') && !bench.includes('B6'), 'benchmarks take no slot; one past the cut is dropped');
ok(/rr-model__rank"[^>]*>5</.test(bench) && !/rr-model__rank"[^>]*>6</.test(bench), 'ranks count ranked picks only');
ok(bench.includes('on Claude Cowork') && bench.includes('Benchmark'), 'benchmark row names its product and carries the badge');
ok(bench.includes('#1 for t') && bench.includes('Use this in the chat'), 'a benchmark is never the default open pick');
const benchOpen = renderToStaticMarkup(React.createElement(ModelGuide, { professions: [{ id: 'p', label: 'P', tasks: [{ id: 't', label: 'T',
  picks: [pick('b1', { benchmark: true, harness: 'Claude Cowork' })] }] }], benchmarkNote: 'Compare only' }));
ok(benchOpen.includes('Compare only') && !benchOpen.includes('Use this in the chat') && !benchOpen.includes('#1 for'), 'benchmark detail has no use action and no rank');
ok(!/rr-guide__(ask--out|benchnote)|is-benchmark/.test(plain) && !/rr-guide__ask--out|is-benchmark/.test(en), 'no output or benchmark markup without those props');

// 1.4.0: the comparison strip, quality against price, unavailable picks and rendered output.
// Figures from a real ranking (marketer, optimize for search): #1 and #2 tie, #3 is the value pick.
const sc = (quality, reliability, speed, cost, ci) => ({ quality, reliability, speed, cost, ci });
const gl = [{ id: 'm', label: 'Marketer', tasks: [{ id: 'seo', label: 'Optimize for search', picks: [
  pick('opus', { score: sc(98, 72, 40, 5, 2.3), monthly: 7.91 }),
  pick('sonnet', { score: sc(90, 79, 56, 6, 2.4), monthly: 6.04 }),
  pick('sol', { score: sc(81, 70, 19, 41, 2.3), monthly: 1.31, kind: 'estimate' }),
  pick('fable', { score: sc(91, 63, 26, 5, 1.6), monthly: 12.04, unavailable: 'Not on Redrob yet' }),
  pick('astra', { score: sc(83, 73, 22, 18, 1.7), monthly: 6.6 }),
  pick('cowork', { benchmark: true, harness: 'Claude Cowork', score: sc(98, 72, 40, 5, 2.3), monthly: 7.91 }),
] }] }];
const g = renderToStaticMarkup(React.createElement(ModelGuide, { professions: gl, summary: 'glance' }));
ok(g.includes('rr-guide__glancehead') && (g.match(/class="rr-guide__glance( |")/g) || []).length === 6, 'glance: heads once, a strip per row');
ok(!g.includes('rr-model__effort') && g.includes('Thinking: High'), 'glance: no effort meter; the effort is written out in the detail');
// Opus: reliability 72/79 = 91% -> 4, speed 40/56 = 71% -> 3. Sol: quality 81/98 = 83% -> 3, cost is the best -> 5.
ok(/aria-label="Quality 5 of 5, Reliability 4 of 5, Speed 3 of 5, Value 1 of 5"/.test(g), 'glance: levels against the best on the task');
ok(/aria-label="Quality 3 of 5, Reliability 4 of 5, Speed 1 of 5, Value 5 of 5, Partly estimated"/.test(g) && g.includes('is-estimated'), 'glance: value is the cost score; an estimate is hatched and said');
ok((g.match(/Tied with #1/g) || []).length === 1 && (g.match(/Best value/g) || []).length === 1, 'glance: one tie with #1 (overlapping intervals) and one best value');
ok(/SONNET[\s\S]*Tied with #1[\s\S]*SOL[\s\S]*Best value/.test(g), 'glance: the tie is #2 and the value pick is #3');
ok(!g.includes('rr-guide__map'), 'no chart outside advanced mode');
const gm = renderToStaticMarkup(React.createElement(ModelGuide, { professions: gl, summary: 'glance', map: true, mode: 'advanced' }));
ok(gm.includes('rr-guide__map') && (gm.match(/class="rr-guide__mapdot/g) || []).length === 6, 'map: a dot per pick in advanced mode');
ok((gm.match(/is-frontier/g) || []).length === 3 && gm.includes('rr-guide__mapline'), 'map: sol, sonnet and opus are the trade-off line');
ok(/role="button" tabindex="0" aria-pressed="true" aria-label="#1 OPUS: quality 98, \$8 a month"/.test(gm), 'map: dots are named controls; #1 is open');
const un = renderToStaticMarkup(React.createElement(ModelGuide, { professions: [{ id: 'p', label: 'P', tasks: [{ id: 't', label: 'T',
  picks: [pick('h', { unavailable: 'Not on Redrob yet', sample: { prompt: 'Ask', output: React.createElement('h2', null, 'Rich') } })] }] }] }));
ok(/<button[^>]*disabled=""[^>]*><span>Use this in the chat/.test(un) && un.includes('rr-guide__unavail') && un.includes('Not on Redrob yet'), 'unavailable: use disabled, reason shown');
ok(un.includes('rr-guide__output rr-guide__output--rich') && !run.includes('rr-guide__output--rich'), 'rendered output gets the rich class; plain text does not');
ok(!/rr-guide__(glance|col|map|thinking|unavail)|output--rich/.test(plain), 'no strip, chart, unavailable or rich markup without their props');

// 1.4.0: a sample with a task card and scorecard reads card, scorecard, folded answer, run facts.
const carded = (extra) => [{ id: 'a', label: 'Accountant', tasks: [{ id: 'close', label: 'Close the books', picks: [pick('opus', Object.assign({ sample: {
  prompt: 'Full prompt text',
  output: 'The whole answer',
  card: { brief: 'Finish a reconciliation', given: ['Bank statement', 'GL excerpt'], asked: ['A table', 'Entries'], limit: 'About 1,200 words', hard: 'A planted error', note: 'Everything was in the message.' },
  scorecard: { lines: [
    { check: 'Splits the $4,527', verdict: 'pass', quote: '$4,500 duplicate' },
    { check: 'Voids #2019', verdict: 'partial' },
    { check: 'NSF to receivables', verdict: 'miss' },
  ], note: 'Graded by two models' },
  run: [['Time', '48 s'], ['Cost', '$0.11']],
} }, extra || {})), pick('sonnet')] }] }];
const c1 = renderToStaticMarkup(React.createElement(ModelGuide, { professions: carded() }));
ok(/rr-guide__card[\s\S]*rr-guide__scorecard[\s\S]*rr-guide__answer[\s\S]*rr-guide__run/.test(c1), 'card sample: card, scorecard, folded answer, run, in that order');
ok(c1.includes('Finish a reconciliation') && c1.includes('Everything was in the message.') && /<ol class="rr-guide__cardlist"><li>A table/.test(c1), 'card: brief, given, note, asked as an ordered list');
ok(/<details class="rr-guide__exact"><summary>See the exact prompt<\/summary>[\s\S]*Full prompt text/.test(c1), 'exact prompt folded inside the card');
ok(c1.includes('<b>1 of 3, 1 partly</b>') && c1.includes('is-pass') && c1.includes('is-partial') && c1.includes('is-miss'), 'scorecard: score and a mark per line');
ok(c1.includes('Passed: </span>Splits') && c1.includes('<q class="rr-guide__quote">$4,500 duplicate</q>'), 'verdict in words for screen readers; quote shown');
ok(/<details class="rr-guide__answer"><summary>Read the full answer<\/summary>/.test(c1) && !c1.includes('rr-guide__turn'), 'answer folded; no old prompt box');
ok(c1.includes('<dt>Cost</dt><dd>$0.11</dd>'), 'run facts');
ok(/OPUS[\s\S]*Scorecard 1 of 3, 1 partly[\s\S]*SONNET/.test(c1) && (c1.match(/Scorecard \d of/g) || []).length === 1, 'row shows the score only for a pick with a scorecard');
const c2 = renderToStaticMarkup(React.createElement(ModelGuide, { professions: carded(), sampleLabels: { scorecard: '채점표', score: (p, o) => `${o}개 중 ${p}개`, fullAnswer: '전체 답변 보기' } }));
ok(c2.includes('3개 중 1개') && c2.includes('전체 답변 보기') && !c2.includes('Read the full answer'), 'sample labels translate');
ok(!/rr-guide__(card|scorecard|answer|run)\b/.test(run), 'a sample without a card renders as before');
