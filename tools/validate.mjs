#!/usr/bin/env node
// 問題ファイルの検査。生成バッチ（配列 or {questions,cases}）と bank/questions/*.json を受け付ける。
//   node tools/validate.mjs FILE... [--no-quotes] [--cases bank/cases.json] [--require-id]
// 引用照合は一次資料キャッシュ（HIMQ_SOURCES）があるときだけ行う。
import fs from 'node:fs';
import path from 'node:path';
import { validateQuestion, loadCases } from './lib/schema.mjs';
import { loadRegistry, SRC_DIR } from './lib/sources.mjs';
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--cases'));
const noQuotes = args.includes('--no-quotes');
const requireId = args.includes('--require-id');
const casesArg = args.includes('--cases') ? args[args.indexOf('--cases') + 1] : null;
const registry = noQuotes || !fs.existsSync(SRC_DIR) ? null : loadRegistry();
let nErr = 0, nWarn = 0, nQ = 0;
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const qs = Array.isArray(d) ? d : d.questions || [];
  const cases = loadCases(casesArg || path.join(path.dirname(f), '..', 'cases.json'));
  if (!Array.isArray(d) && Array.isArray(d.cases)) for (const c of d.cases) cases.set(c.id, c);
  qs.forEach((q, i) => {
    nQ++;
    const { errors, warnings } = validateQuestion(q, { cases, registry, requireId });
    const tag = `${path.basename(f)}#${i}${q.id ? ' ' + q.id : ''}`;
    errors.forEach((e) => console.log(`ERROR ${tag}: ${e}`));
    warnings.forEach((w) => console.log(`warn  ${tag}: ${w}`));
    nErr += errors.length; nWarn += warnings.length;
  });
}
console.log(`checked ${nQ} questions: ${nErr} errors, ${nWarn} warnings${registry ? '' : ' (引用照合なし)'}`);
process.exit(nErr ? 1 : 0);
