#!/usr/bin/env node
// 解答者用の「目隠し版」を作る（正答・解説・出典を除く）。
//   node tools/blind.mjs IN.json OUT.json [--cases bank/cases.json]
import fs from 'node:fs';
const [inp, out] = process.argv.slice(2);
const casesArg = process.argv.includes('--cases') ? process.argv[process.argv.indexOf('--cases') + 1] : null;
const d = JSON.parse(fs.readFileSync(inp, 'utf8'));
const qs = Array.isArray(d) ? d : d.questions;
const caseMap = new Map();
if (casesArg) for (const c of JSON.parse(fs.readFileSync(casesArg, 'utf8')).cases || []) caseMap.set(c.id, c);
if (!Array.isArray(d) && d.cases) for (const c of d.cases) caseMap.set(c.id, c);
const usedCases = new Set();
const blind = qs.map((q, i) => {
  if (q.caseId) usedCases.add(q.caseId);
  return { key: q.key || q.id || `#${i}`, subject: q.subject, caseId: q.caseId || undefined, question: q.question, choices: q.choices };
});
fs.writeFileSync(out, JSON.stringify({ questions: blind, cases: [...usedCases].map((id) => caseMap.get(id)).filter(Boolean) }, null, 1));
console.log(`blind: ${blind.length} questions -> ${out}`);
