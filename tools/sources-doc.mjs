#!/usr/bin/env node
// 一次資料の一覧（docs/sources.md）を作る。登録簿（HIMQ_SOURCES）と bank/ の引用から、
// 資料ごとの取得元URL・基準時点・取得日・引用している問題数（verified）を表にする。
//   node tools/sources-doc.mjs > docs/sources.md
import { loadRegistry } from './lib/sources.mjs';
import { loadBank } from './build.mjs';

const reg = loadRegistry();
const { questions } = loadBank();
const used = new Map();
for (const q of questions) if (q.status === 'verified') for (const s of q.sources || []) used.set(s.ref, (used.get(s.ref) || 0) + 1);
const groups = new Map();
for (const r of reg.values()) {
  const g = r.id.split(':')[0];
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}
const NAMES = { law: '法令（e-Gov法令検索）', icd: 'ICD-10（2013年版）準拠の分類資料（厚生労働省）', icdbg: 'ICD・統計基準の背景資料', who: 'WHO', jha: '日本病院会（通信教育・認定試験）', ins: '医療保険・介護保険・診療報酬・DPC', mgmt: '医療管理・医療安全・医療提供体制', info: '医療情報・個人情報・標準化・医療DX', stats: '統計（人口動態・病院報告・統計理論等）', cancer: 'がん登録・死亡診断書', him: '診療情報管理の実務' };
const esc = (s) => String(s ?? '').replace(/\|/g, '／').replace(/\n/g, ' ');
const L = ['# 一次資料の一覧', '', `問題の根拠として取得・照合した資料 ${reg.size} 件（取得日 2026-11-24〜）。本文のテキストはリポジトリに含めず、作業環境のキャッシュで引用を機械照合した。「引用数」は verified の問題がその資料を根拠に挙げている数。`, ''];
const order = ['jha', 'law', 'icd', 'icdbg', 'who', 'ins', 'mgmt', 'info', 'stats', 'cancer', 'him'];
const keys = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || (a < b ? -1 : 1));
for (const g of keys) {
  const rows = groups.get(g).sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0) || (a.id < b.id ? -1 : 1));
  L.push(`## ${NAMES[g] || (g.startsWith('x-') ? '監査・生成の途中で追加した資料（' + g + '）' : g)}`, '');
  L.push('| ID | 資料 | 発行 | 基準時点 | 引用数 |', '|---|---|---|---|---:|');
  for (const r of rows) L.push(`| \`${esc(r.id)}\` | [${esc(r.title)}](${r.url}) | ${esc(r.publisher)} | ${esc(r.asOf)} | ${used.get(r.id) || 0} |`);
  L.push('');
}
const missing = [...used.keys()].filter((k) => !reg.has(k));
if (missing.length) L.push('## 登録簿に無い引用元（要確認）', '', ...missing.map((m) => `- ${m}`), '');
console.log(L.join('\n'));
