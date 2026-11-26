#!/usr/bin/env node
// 問題バンクの集計（分野別・難易度別・形式別・検証状態別・正答位置）を Markdown で書き出す。
//   node tools/stats.mjs > docs/bank-stats.md
import { loadBank } from './build.mjs';

const { subjects, cases, questions } = loadBank();
const S = subjects.subjects;
const F = subjects.formats, D = subjects.difficulties;
const ST = ['verified', 'provisional', 'rejected'];
const ver = questions.filter((q) => q.status === 'verified');
const L = [];
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
const row = (cells) => L.push(`| ${cells.join(' | ')} |`);

L.push('# 問題バンクの集計', '');
L.push(`生成元 \`bank/questions/*.json\` の全 ${questions.length} 問（公開は verified の ${ver.length} 問）。この表は \`node tools/stats.mjs\` が生成する。`, '');
L.push('## 検証状態', '');
row(['', 'verified', 'provisional', 'rejected', '計']); row(['---', '---:', '---:', '---:', '---:']);
for (const [label, f] of [['旧版から移行（lg-）', (q) => !!q.legacy], ['v8 新規', (q) => !q.legacy], ['合計', () => true]]) {
  const qs = questions.filter(f);
  row([label, ...ST.map((s) => qs.filter((q) => q.status === s).length), qs.length]);
}
L.push('');
L.push('## 科目別（verified）', '');
row(['科目', 'verified', 'うち旧版', '基礎', '標準', '応用', '5択', '否定形', '退院時要約', 'provisional', 'rejected']);
row(['---', ...Array(10).fill('---:')]);
for (const s of S) {
  const all = questions.filter((q) => q.subject === s.id);
  if (!all.length) continue;
  const v = all.filter((q) => q.status === 'verified');
  row([`${s.course === '専門' ? '専門' + s.no : '基礎'} ${s.name}`, v.length, v.filter((q) => q.legacy).length,
    v.filter((q) => q.difficulty === 'basic').length, v.filter((q) => q.difficulty === 'standard').length, v.filter((q) => q.difficulty === 'advanced').length,
    v.filter((q) => q.choices.length === 5).length, v.filter((q) => q.polarity === 'negative').length, v.filter((q) => q.format === 'summary').length,
    all.filter((q) => q.status === 'provisional').length, all.filter((q) => q.status === 'rejected').length]);
}
const pro = ver.filter((q) => S.find((s) => s.id === q.subject)?.course === '専門');
row(['**専門課程 計**', `**${pro.length}**`, pro.filter((q) => q.legacy).length, '', '', '', '', '', '', '', '']);
L.push('');
L.push('## 難易度（verified）', '');
row(['難易度', '問題数', '割合']); row(['---', '---:', '---:']);
for (const k of Object.keys(D)) { const n = ver.filter((q) => q.difficulty === k).length; row([D[k], n, pct(n, ver.length)]); }
L.push('');
L.push('## 形式（verified）', '');
row(['形式', '問題数', '割合']); row(['---', '---:', '---:']);
for (const k of Object.keys(F)) { const n = ver.filter((q) => q.format === k).length; row([F[k], n, pct(n, ver.length)]); }
L.push('');
row(['選択肢・設問の向き', '問題数', '割合']); row(['---', '---:', '---:']);
for (const [label, f] of [['5択', (q) => q.choices.length === 5], ['4択', (q) => q.choices.length === 4], ['正しいものを選ぶ', (q) => q.polarity === 'positive'], ['誤っているもの（該当しないもの）を選ぶ', (q) => q.polarity === 'negative']]) { const n = ver.filter(f).length; row([label, n, pct(n, ver.length)]); }
L.push('');
const caseN = new Set(ver.filter((q) => q.caseId).map((q) => q.caseId)).size;
L.push(`退院時要約・症例を使う問題: ${ver.filter((q) => q.caseId).length}問（架空症例 ${caseN}件。1症例から複数問）`, '');
L.push('## 正答位置（verified）', '');
row(['位置', '4択', '5択', '全体']); row(['---', '---:', '---:', '---:']);
for (let i = 0; i < 5; i++) {
  const a4 = ver.filter((q) => q.choices.length === 4 && q.answer === i).length, a5 = ver.filter((q) => q.choices.length === 5 && q.answer === i).length;
  row(['ABCDE'[i], i < 4 ? a4 : '—', a5, `${a4 + a5}（${pct(a4 + a5, ver.length)}）`]);
}
L.push('');
L.push('## サブトピック別（verified）', '');
for (const s of S) {
  const v = ver.filter((q) => q.subject === s.id);
  if (!v.length) continue;
  L.push(`- **${s.short}**: ` + s.subtopics.map((t) => `${t} ${v.filter((q) => q.subtopic === t).length}`).join(' ／ '));
}
L.push('');
console.log(L.join('\n'));
