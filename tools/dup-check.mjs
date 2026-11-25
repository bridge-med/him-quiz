#!/usr/bin/env node
// 重複・過度な類似の検出（重複・品質監査の一次ふるい）。問題文＋正答の文字3-gramのJaccard係数で比べる。
//   node tools/dup-check.mjs [--min 0.5] [--status verified] [--json OUT.json]
import fs from 'node:fs';
import { loadBank } from './build.mjs';
import { normQuote } from './lib/normalize.mjs';

const args = process.argv.slice(2);
const MIN = args.includes('--min') ? parseFloat(args[args.indexOf('--min') + 1]) : 0.5;
const STATUS = args.includes('--status') ? args[args.indexOf('--status') + 1] : 'verified';
const OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const { questions } = loadBank();
const qs = questions.filter((q) => STATUS === 'all' || q.status === STATUS);
const grams = (s) => { const t = normQuote(s).replace(/[、。,.「」（）()・：:？?]/g, ''); const g = new Set(); for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3)); return g; };
const sig = qs.map((q) => ({ q, g: grams(q.question + '／' + q.choices[q.answer]) }));
const pairs = [];
for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) {
  const a = sig[i].g, b = sig[j].g;
  if (!a.size || !b.size) continue;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  const jac = inter / (a.size + b.size - inter);
  if (jac >= MIN) pairs.push({ a: sig[i].q.id, b: sig[j].q.id, score: Math.round(jac * 100) / 100, sameAnswer: normQuote(sig[i].q.choices[sig[i].q.answer]) === normQuote(sig[j].q.choices[sig[j].q.answer]) });
}
pairs.sort((x, y) => y.score - x.score);
if (OUT) {
  const byId = new Map(qs.map((q) => [q.id, q]));
  const pick = (id) => { const q = byId.get(id); return { id, subject: q.subject, subtopic: q.subtopic, question: q.question, answer: q.choices[q.answer] }; };
  fs.writeFileSync(OUT, JSON.stringify(pairs.map((p) => ({ ...p, qa: pick(p.a), qb: pick(p.b) })), null, 1));
}
for (const p of pairs.slice(0, 200)) console.log(`${p.score}\t${p.a}\t${p.b}${p.sameAnswer ? '\t同じ正答' : ''}`);
console.log(`${qs.length}問中 類似ペア ${pairs.length}件（Jaccard≥${MIN}）`);
