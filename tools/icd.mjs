#!/usr/bin/env node
// ICD-10（2013年版）準拠 基本分類表の照会ツール（検証用）。
// 表データは厚生労働省「基本分類表（2013年版）準拠」(kihon2013.xlsx) から生成した JSON。
// 使い方:
//   node tools/icd.mjs code I21.9        コードの名称・3桁分類・中間分類・章・剣星を表示
//   node tools/icd.mjs find 急性心筋梗塞   名称の部分一致で検索（最大60件）
//   node tools/icd.mjs block I20-I25      中間分類に含まれる3桁・4桁分類を一覧
//   node tools/icd.mjs chapter 9          章の範囲と中間分類を一覧
// 表の場所: 環境変数 HIMQ_ICD_TABLE（既定 /home/user/hq-work/icd/icd10-2013.json）
import fs from 'node:fs';
const TABLE = process.env.HIMQ_ICD_TABLE || '/home/user/hq-work/icd/icd10-2013.json';
const data = JSON.parse(fs.readFileSync(TABLE, 'utf8'));
const rows = data.rows;
const norm = (s) => String(s || '').normalize('NFKC').toUpperCase().replace(/[†*＊]/g, '').replace(/[－―ー−]/g, '-').trim();
const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');
function chapterRow(ch) { return rows.find((r) => r.kind === '01.章' && r.chapter === ch); }
function blockRow(b) { return rows.find((r) => r.kind === '02.中' && r.code === b); }
function show(r) {
  const parts = [`${r.display}\t${r.name}`];
  if (r.ds) parts.push(`剣星:${r.ds}`);
  if (r.note) parts.push(`注:${r.note}`);
  parts.push(`種別:${r.kind}/${r.unit}`);
  return parts.join('  ');
}
if (cmd === 'code') {
  const c = norm(arg);
  const hits = rows.filter((r) => norm(r.code) === c || norm(r.display) === c);
  if (!hits.length) { console.log(`NOT FOUND: ${arg}（基本分類表に存在しないコード）`); process.exit(2); }
  for (const r of hits) {
    console.log(show(r));
    const three = rows.find((x) => (x.kind.startsWith('03') || x.kind.startsWith('04')) && norm(x.code) === norm(r.three));
    if (three && three !== r) console.log(`  3桁分類: ${show(three)}`);
    const b = blockRow(r.block); if (b) console.log(`  中間分類: ${b.code} ${b.name}`);
    const ch = chapterRow(r.chapter); if (ch) console.log(`  章: ${ch.display} ${ch.name}`);
    const kids = rows.filter((x) => x !== r && norm(x.three) === c && x.kind !== '07.他');
    if (kids.length && kids.length <= 40) kids.forEach((k) => console.log(`    └ ${show(k)}`));
    const notes = rows.filter((x) => x.kind.startsWith('07') && norm(x.three) === norm(r.three));
    notes.forEach((n) => console.log(`  [注・指示] ${n.display} ${n.name}`));
  }
} else if (cmd === 'find') {
  const q = arg.normalize('NFKC');
  const hits = rows.filter((r) => String(r.name || '').normalize('NFKC').includes(q));
  hits.slice(0, 60).forEach((r) => console.log(show(r)));
  console.log(`(${hits.length}件${hits.length > 60 ? '、先頭60件を表示' : ''})`);
} else if (cmd === 'block') {
  const b = norm(arg);
  const hits = rows.filter((r) => norm(r.block) === b && r.kind !== '07.他');
  if (!hits.length) { console.log(`NOT FOUND block: ${arg}`); process.exit(2); }
  hits.forEach((r) => console.log(show(r)));
} else if (cmd === 'chapter') {
  const ch = String(arg).padStart(2, '0');
  const c = chapterRow(ch); if (!c) { console.log('NOT FOUND chapter'); process.exit(2); }
  console.log(`${c.display} ${c.name}`);
  rows.filter((r) => r.kind === '02.中' && r.chapter === ch).forEach((r) => console.log(`  ${r.code} ${r.name}`));
} else {
  console.log('usage: node tools/icd.mjs code|find|block|chapter <arg>');
  process.exit(1);
}
