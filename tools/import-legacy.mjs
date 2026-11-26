#!/usr/bin/env node
// 旧版（index.html に埋め込まれていた全12章・360問）を新スキーマへ移す一回限りの変換。
// 入力: bank/legacy/v2-bank.json（master の index.html から抜き出した凍結コピー）
// 出力: 永続ID lg-<旧章2桁>-<旧インデックス2桁> を持つ問題（status は監査前の provisional）
//   node tools/import-legacy.mjs OUT.json
import fs from 'node:fs';
import crypto from 'node:crypto';
const legacy = JSON.parse(fs.readFileSync(new URL('../bank/legacy/v2-bank.json', import.meta.url), 'utf8'));
const MAP = { 1: 'S01', 2: 'S03', 3: 'S08', 4: 'B12', 5: 'BCL', 6: 'S06', 7: 'S07', 8: 'S08', 9: 'S12', 10: 'S11', 11: 'S10', 12: 'S05' };
const NEG = /誤っている|誤り|適切でない|正しくない|不適切|該当しない|含まれない|ないもの|でないもの/;
export function legacyHash(q) { return crypto.createHash('sha256').update(JSON.stringify([q.q, q.c, q.a])).digest('hex').slice(0, 16); }
const out = [];
for (const ch of legacy) ch.questions.forEach((q, i) => {
  const notes = q.c.map((_, k) => (k === q.a ? null : (q.e && q.e.wrong && q.e.wrong['ABCDE'[k]]) || ''));
  out.push({
    id: `lg-${String(ch.id).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
    legacy: { key: `${ch.id}_${i}`, chapter: ch.id, chapterName: ch.name, index: i, hash: legacyHash(q) },
    subject: MAP[ch.id], subtopic: null, format: 'knowledge', difficulty: null,
    polarity: NEG.test(q.q) ? 'negative' : 'positive',
    question: q.q, choices: q.c, answer: q.a,
    explanation: { correct: (q.e && q.e.correct) || '', choiceNotes: notes, point: (q.e && q.e.point) || '' },
    sources: [], asOf: null, status: 'provisional',
  });
});
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(`legacy: ${out.length} questions -> ${process.argv[2]}`);
