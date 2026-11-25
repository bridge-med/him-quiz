#!/usr/bin/env node
// 再監査で provisional（軽微な指摘で保留）になった問題を、修正担当に渡すファイルにまとめる。
// 指摘（再監査メモ）と、再監査対象だった修正版の問題を1ファイルに入れる。
//   node tools/prep-repair.mjs OUT_DIR [--size 14]
import fs from 'node:fs';
import path from 'node:path';

const WORK = process.env.HIMQ_WORK || '/home/user/hq-work';
const [outDir] = process.argv.slice(2);
const SIZE = process.argv.includes('--size') ? parseInt(process.argv[process.argv.indexOf('--size') + 1], 10) : 14;
const R = path.join(WORK, 'results'), B = path.join(WORK, 'batches');
const items = [];
for (const f of fs.readdirSync(R).filter((f) => f.endsWith('.reaudit.json') && !f.startsWith('R-'))) {
  const base = f.replace(/\.reaudit\.json$/, '');
  const ra = JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
  const legacy = base.startsWith('legacy-');
  const fixFile = legacy ? path.join(B, 'legacy', `${base.replace(/^legacy-/, '')}.fix.json`) : path.join(B, 'gen', `${base}.fix.json`);
  if (!fs.existsSync(fixFile)) continue;
  const fx = JSON.parse(fs.readFileSync(fixFile, 'utf8'));
  const byKey = new Map(fx.questions.map((q) => [q.key || q.id, q]));
  for (const v of ra.verdicts || []) {
    if (v.verdict !== 'provisional') continue;
    const q = byKey.get(v.key);
    if (!q) continue;
    const c = q.caseId ? (fx.cases || []).find((x) => x.id === q.caseId) : null;
    items.push({ q: { ...q, key: v.key }, note: [v.detail, v.notes].filter(Boolean).join(' ｜ '), origin: base, case: c });
  }
}
fs.mkdirSync(outDir, { recursive: true });
const groups = [];
for (let i = 0; i < items.length; i += SIZE) {
  const g = items.slice(i, i + SIZE);
  const id = `R-${String(groups.length + 1).padStart(2, '0')}`;
  const cases = [...new Map(g.filter((x) => x.case).map((x) => [x.case.id, x.case])).values()];
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ questions: g.map((x) => x.q), cases, reauditNotes: Object.fromEntries(g.map((x) => [x.q.key, { origin: x.origin, note: x.note }])) }, null, 1));
  groups.push({ id, n: g.length });
}
console.log(JSON.stringify(groups));
