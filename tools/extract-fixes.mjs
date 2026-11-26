#!/usr/bin/env node
// 監査結果（verdicts）から fix の修正版だけを取り出し、再監査用の問題ファイルにする。
//   node tools/extract-fixes.mjs AUDIT.json OUT.json [CASES_FROM.json]
import fs from 'node:fs';
const [auditFile, out, casesFrom] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const fixed = (a.verdicts || []).filter((v) => v.verdict === 'fix' && (v.fixed || v.question)).map((v) => ({ ...(v.fixed || v.question), key: v.key || v.id || (v.fixed || v.question).key || (v.fixed || v.question).id }));
let cases = [];
if (casesFrom && fs.existsSync(casesFrom)) { const c = JSON.parse(fs.readFileSync(casesFrom, 'utf8')); cases = c.cases || []; }
if (a.cases) cases = cases.concat(a.cases);
fs.writeFileSync(out, JSON.stringify({ questions: fixed, cases }, null, 1));
console.log(`fixes: ${fixed.length} -> ${out}`);
