#!/usr/bin/env node
// 監査結果を問題バンク（bank/）へ反映する。作業ディレクトリ（HIMQ_WORK、既定 /home/user/hq-work）の
// batches/・results/ から毎回すべてを組み立て直す（冪等）。IDは既存バンクの origin.key で固定。
//
// 判定（verified になる条件。すべて満たすこと）
//   旧版: 監査 pass（内容変更なし）＋ブラインド解答が正答と一致＋機械検査（スキーマ・引用照合・ICD・計算）
//         監査 fix → 独立再監査 pass（再監査者のブラインド解答も一致）＋機械検査
//   新規: 生成者と別の監査 pass＋ブラインド解答が一致＋機械検査、または fix → 独立再監査 pass＋機械検査
//   それ以外は provisional（追加確認が必要）か rejected（誤り・曖昧・根拠不足など）。
//   node tools/merge-results.mjs [--date 2026-11-25]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateQuestion } from './lib/schema.mjs';
import { loadRegistry } from './lib/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = process.env.HIMQ_WORK || '/home/user/hq-work';
const DATE = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
const readJson = (p, d = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d);
const LENS = { S01: '医療管理・情報', S02: '医療管理・情報', S03: '法令・制度', S04: '医療管理・情報', S05: '医療管理・情報', S06: '統計', S07: '統計', S08: '法令・制度', S09: '実務・DPC・がん登録', S10: '実務・DPC・がん登録', S11: 'ICD-10専門', S12: 'ICD-10専門', B12: '医療管理・情報', BCL: '医療管理・情報' };
const LEGACY_LENS = { 1: '医療管理・情報', 2: '法令・制度', 3: '法令・制度', 4: '医学用語', 5: '臨床医学', 6: '統計', 7: '統計', 8: '法令・制度', 9: 'ICD-10専門', 10: 'ICD-10専門', 11: '実務・DPC・がん登録', 12: '医療管理・情報' };

const registry = loadRegistry();
const existing = new Map(); // origin.key -> id
const qdir = path.join(ROOT, 'bank', 'questions');
for (const f of fs.existsSync(qdir) ? fs.readdirSync(qdir) : []) {
  if (!f.endsWith('.json')) continue;
  for (const q of readJson(path.join(qdir, f)).questions) if (q.origin && q.origin.key) existing.set(q.origin.key, q.id);
}
const usedIds = new Set(existing.values());
function newId(subject) {
  const pre = subject.toLowerCase();
  for (let n = 1; n < 10000; n++) { const id = `${pre}-${String(n).padStart(4, '0')}`; if (!usedIds.has(id)) { usedIds.add(id); return id; } }
  throw new Error('ID枯渇');
}

// ---- 正答位置の機械的な平準化（選択肢と選択肢別解説を同時に並べ替える） ----
const LETTER_REF = /(選択肢|肢)\s*[A-EＡ-Ｅ]|[A-EＡ-Ｅ][はがのとを、。]|（[A-EＡ-Ｅ]）|\b[A-E]\b(?=[.．:：])/;
function orderedNumeric(ch) {
  const nums = ch.map((c) => { const m = String(c).normalize('NFKC').match(/^-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; });
  if (nums.some(isNaN)) return false;
  return nums.every((v, i) => i === 0 || v >= nums[i - 1]) || nums.every((v, i) => i === 0 || v <= nums[i - 1]);
}
function rebalance(q) {
  const ex = q.explanation || {};
  const texts = [ex.correct, ex.point, ...(ex.choiceNotes || [])].filter(Boolean).join(' ');
  if (q.fixedOrder || orderedNumeric(q.choices) || LETTER_REF.test(texts) || q.format === 'combination') return q;
  const n = q.choices.length;
  const target = parseInt(crypto.createHash('sha256').update(q.id).digest('hex').slice(0, 8), 16) % n;
  if (q.answer === target) return q;
  const order = q.choices.map((_, i) => i).filter((i) => i !== q.answer);
  order.splice(target, 0, q.answer);
  return { ...q, choices: order.map((i) => q.choices[i]), answer: target, explanation: { ...ex, choiceNotes: order.map((i) => (i === q.answer ? null : ex.choiceNotes[i])) } };
}

const out = [];
const cases = new Map((readJson(path.join(ROOT, 'bank', 'cases.json'), { cases: [] }).cases || []).map((c) => [c.id, c]));
const counts = { legacy: { verified: 0, provisional: 0, rejected: 0, unaudited: 0, fixed: 0 }, gen: { verified: 0, provisional: 0, rejected: 0, generated: 0, fixed: 0 } };
const changes = []; // 既存問題の修正・除外一覧
const auditDir = path.join(ROOT, 'bank', 'audit');
fs.mkdirSync(auditDir, { recursive: true });
function keep(src, name) { if (fs.existsSync(src)) fs.copyFileSync(src, path.join(auditDir, name)); }
const byKey = (arr, k = 'key') => new Map((arr || []).map((x) => [x[k] ?? x.id ?? x.key, x]));
// 目隠し版の番号（#0, #1 …）で書かれた解答を、元ファイルの問題の key に直す（blind.mjs が id しか見ていなかった時期の互換）
function positional(answers, questions) {
  return (answers || []).map((a) => { const m = /^#(\d+)$/.exec(String(a.key ?? '')); return m && questions[+m[1]] ? { ...a, key: questions[+m[1]].key ?? questions[+m[1]].id } : a; });
}

function finalize(q, status, ver, base) {
  const fixedQ = rebalance({ ...q, status });
  const res = validateQuestion(fixedQ, { cases, registry, requireId: true });
  if (status === 'verified' && res.errors.length) {
    fixedQ.status = 'provisional';
    ver.notes = `機械検査で不合格のため保留: ${res.errors.slice(0, 3).join(' / ')}${ver.notes ? ' ｜ ' + ver.notes : ''}`;
  }
  fixedQ.verification = ver;
  delete fixedQ.key;
  out.push(fixedQ);
  return fixedQ.status;
}

// ================= 再修正（再監査で provisional → 修正 → 別の再監査） =================
const repairs = new Map();
for (const f of fs.readdirSync(path.join(WORK, 'results')).filter((f) => /^R-\d+\.repair\.json$/.test(f))) {
  const g = f.replace(/\.repair\.json$/, '');
  const rp = readJson(path.join(WORK, 'results', f), { verdicts: [] });
  const ra = byKey(readJson(path.join(WORK, 'results', `${g}.reaudit.json`), { verdicts: [] }).verdicts);
  const rfix = readJson(path.join(WORK, 'batches', 'repair', `${g}.fix.json`), { questions: [] }).questions;
  const rb = byKey(positional(readJson(path.join(WORK, 'results', `${g}.reaudit.json.blind-answers.json`), { answers: [] }).answers, rfix));
  for (const x of ['repair', 'reaudit']) keep(path.join(WORK, 'results', `${g}.${x}.json`), `${g}.${x}.json`);
  keep(path.join(WORK, 'results', `${g}.reaudit.json.blind-answers.json`), `${g}.reaudit.blind.json`);
  for (const v of rp.verdicts || []) repairs.set(v.key ?? v.id, { v, r: ra.get(v.key ?? v.id), b: rb.get(v.key ?? v.id), g });
}
function applyRepair(key, cand, status, ver, base) {
  const rp = repairs.get(key);
  if (!rp || status !== 'provisional') return { cand, status };
  const fixed = rp.v.fixed || rp.v.question;
  if (rp.v.verdict === 'fix' && fixed && rp.r && rp.r.verdict === 'pass' && (rp.b ? rp.b.answer === fixed.answer : rp.r.blindAnswer === fixed.answer)) {
    ver.method.push('再監査の指摘に沿って再修正し、別エージェントの再監査（ブラインド解答一致）で合格');
    ver.roles.repair = `repair:${rp.g}`; ver.roles.reauditor2 = `reaudit:${rp.g}`;
    ver.notes = `再修正: ${(rp.v.detail || '').slice(0, 200)}｜${ver.notes}`;
    return { cand: { ...fixed, ...base }, status: 'verified' };
  }
  if (rp.v.verdict === 'reject' || (rp.r && rp.r.verdict === 'reject')) { ver.notes = `再修正後に除外: ${(rp.r?.detail || rp.v.detail || '').slice(0, 200)}｜${ver.notes}`; return { cand, status: 'rejected' }; }
  return { cand, status };
}

// ================= 旧版 =================
for (let ch = 1; ch <= 12; ch++) {
  const b = `L${String(ch).padStart(2, '0')}`;
  const orig = readJson(path.join(WORK, 'batches', 'legacy', `${b}.json`));
  if (!orig) continue;
  const solver = byKey(readJson(path.join(WORK, 'results', `legacy-${b}.solver.json`), { answers: [] }).answers);
  keep(path.join(WORK, 'results', `legacy-${b}.solver.json`), `legacy-${b}.solver.json`);
  // 監査は章を半分ずつ（${b}a / ${b}b）に分けて実施した
  const parts = [b, `${b}a`, `${b}b`];
  const audVerdicts = [], reVerdicts = [], reBlind = [];
  const auditFileOf = {};
  for (const pb of parts) {
    const au = readJson(path.join(WORK, 'results', `legacy-${pb}.audit.json`));
    if (au) { for (const v of au.verdicts || []) { audVerdicts.push(v); auditFileOf[v.id ?? v.key] = `legacy-${pb}.audit.json`; } keep(path.join(WORK, 'results', `legacy-${pb}.audit.json`), `legacy-${pb}.audit.json`); }
    const ra = readJson(path.join(WORK, 'results', `legacy-${pb}.reaudit.json`));
    if (ra) { reVerdicts.push(...(ra.verdicts || [])); keep(path.join(WORK, 'results', `legacy-${pb}.reaudit.json`), `legacy-${pb}.reaudit.json`); }
    const rb = readJson(path.join(WORK, 'results', `legacy-${pb}.reaudit.json.blind-answers.json`));
    const lfix = readJson(path.join(WORK, 'batches', 'legacy', `${pb}.fix.json`), { questions: [] }).questions;
    if (rb) { reBlind.push(...positional(rb.answers || [], lfix)); keep(path.join(WORK, 'results', `legacy-${pb}.reaudit.json.blind-answers.json`), `legacy-${pb}.reaudit.blind.json`); }
  }
  const reaudit = byKey(reVerdicts), reblind = byKey(reBlind);
  const verdicts = byKey(audVerdicts, 'id');
  for (const o of orig.questions) {
    const v = verdicts.get(o.id);
    const base = { id: o.id, legacy: o.legacy, origin: { batch: b, key: o.id, by: '旧版（v2・AI作成）' } };
    const ver = { date: DATE, method: [], roles: { author: '旧版（AI作成・出典なし）' }, log: `bank/audit/${auditFileOf[o.id] || `legacy-${b}.audit.json`}#${o.id}`, notes: '' };
    if (!v) { counts.legacy.unaudited++; finalize({ ...o, ...base }, 'provisional', { ...ver, notes: '未監査' }, base); continue; }
    let cand = { ...(v.question || o), ...base };
    const s = solver.get(o.id);
    ver.roles.solver = `solve:${b}（別モデル・正答を見ずに解答）`; ver.roles.auditor = `audit:${(auditFileOf[o.id] || b).replace(/^legacy-|\.audit\.json$/g, '')}（${LEGACY_LENS[ch]}）`;
    ver.notes = (v.notes || '').slice(0, 600);
    let status;
    if (v.verdict === 'pass' && !v.contentChanged) {
      const agree = s && s.answer === cand.answer;
      ver.method = ['独立ブラインド解答（別モデル）' + (agree ? 'と正答一致' : 'と不一致'), `領域監査（${LEGACY_LENS[ch]}）で合格`, '引用の機械照合（一次資料キャッシュ）', 'スキーマ・ICDコード・計算の機械検査'];
      status = agree ? 'verified' : 'provisional';
      if (!agree) ver.notes = `ブラインド解答と不一致（要確認）｜${ver.notes}`;
    } else if (v.verdict === 'fix' || (v.verdict === 'pass' && v.contentChanged)) {
      counts.legacy.fixed++;
      const r = reaudit.get(o.id), rb = reblind.get(o.id);
      changes.push({ id: o.id, legacyKey: o.legacy.key, action: 'fix', detail: v.detail || v.notes || '', before: { question: o.question, answer: o.choices[o.answer] }, after: { question: cand.question, answer: cand.choices?.[cand.answer] } });
      ver.roles.reauditor = r ? `reaudit:${(auditFileOf[o.id] || b).replace(/^legacy-|\.audit\.json$/g, '')}` : null;
      ver.method = ['独立ブラインド解答（別モデル）', `領域監査（${LEGACY_LENS[ch]}）で修正`, r ? `修正後の独立再監査（${r.verdict}）` : '修正後の再監査は未実施', '引用の機械照合（一次資料キャッシュ）', 'スキーマ・ICDコード・計算の機械検査'];
      const blindOk = rb ? rb.answer === cand.answer : (r && r.blindAnswer === cand.answer);
      status = r && r.verdict === 'pass' && blindOk ? 'verified' : r && r.verdict === 'reject' ? 'rejected' : 'provisional';
      if (r) ver.notes = `再監査: ${(r.notes || r.detail || '').slice(0, 300)}｜${ver.notes}`;
      ({ cand, status } = applyRepair(o.id, cand, status, ver, base));
    } else {
      status = 'rejected';
      ver.method = ['独立ブラインド解答（別モデル）', `領域監査（${LEGACY_LENS[ch]}）で除外`];
      ver.notes = `除外理由: ${v.reason || ''} ${v.detail || ''}｜${ver.notes}`;
      changes.push({ id: o.id, legacyKey: o.legacy.key, action: 'reject', reason: v.reason || '', detail: v.detail || '', before: { question: o.question, answer: o.choices[o.answer] } });
    }
    const st = finalize(cand, status, ver, base);
    counts.legacy[st]++;
  }
}

// ================= 新規 =================
const plan = readJson(path.join(WORK, 'plan', 'assignments.json'), []);
for (const a of plan) {
  const gen = readJson(path.join(WORK, 'batches', 'gen', `${a.id}.json`));
  const audit = readJson(path.join(WORK, 'results', `${a.id}.audit.json`));
  if (!gen || !audit) continue;
  for (const c of gen.cases || []) cases.set(c.id, { id: c.id, title: c.title, text: c.text, fictional: true, origin: a.id });
  const solver = byKey(positional(readJson(path.join(WORK, 'results', `${a.id}.solver.json`), { answers: [] }).answers, gen.questions));
  const verdicts = byKey(audit.verdicts);
  const reaudit = byKey(readJson(path.join(WORK, 'results', `${a.id}.reaudit.json`), { verdicts: [] }).verdicts);
  const fixQs = readJson(path.join(WORK, 'batches', 'gen', `${a.id}.fix.json`), { questions: [] }).questions;
  const reblind = byKey(positional(readJson(path.join(WORK, 'results', `${a.id}.reaudit.json.blind-answers.json`), { answers: [] }).answers, fixQs));
  for (const f of ['solver', 'audit', 'reaudit']) keep(path.join(WORK, 'results', `${a.id}.${f}.json`), `${a.id}.${f}.json`);
  keep(path.join(WORK, 'batches', 'gen', `${a.id}.json`), `${a.id}.generated.json`);
  for (const g of gen.questions) {
    counts.gen.generated++;
    const key = g.key;
    const id = existing.get(key) || newId(g.subject);
    existing.set(key, id);
    const base = { id, origin: { batch: a.id, key, by: `gen:${a.id}` } };
    const v = verdicts.get(key), s = solver.get(key);
    const ver = { date: DATE, method: [], roles: { author: `gen:${a.id}`, solver: `solve:${a.id}（別モデル・正答を見ずに解答）`, auditor: `audit:${a.id}（${LENS[a.subject]}）` }, log: `bank/audit/${a.id}.audit.json#${key}`, notes: v ? (v.notes || '').slice(0, 600) : '' };
    let cand = { ...g, ...base }, status;
    if (!v) { status = 'provisional'; ver.notes = '監査結果なし'; }
    else if (v.verdict === 'pass') {
      const agree = s && s.answer === g.answer;
      ver.method = ['独立ブラインド解答（別モデル）' + (agree ? 'と正答一致' : 'と不一致'), `生成者と別の領域監査（${LENS[a.subject]}）で合格`, '引用の機械照合（一次資料キャッシュ）', 'スキーマ・ICDコード・計算の機械検査'];
      status = agree ? 'verified' : 'provisional';
      if (!agree) ver.notes = `ブラインド解答と不一致（要確認）｜${ver.notes}`;
    } else if (v.verdict === 'fix') {
      counts.gen.fixed++;
      cand = { ...(v.fixed || g), ...base };
      const r = reaudit.get(key), rb = reblind.get(key);
      ver.roles.reauditor = r ? `reaudit:${a.id}` : null;
      ver.method = ['独立ブラインド解答（別モデル）', `領域監査（${LENS[a.subject]}）で修正`, r ? `修正後の独立再監査（${r.verdict}）` : '修正後の再監査は未実施', '引用の機械照合（一次資料キャッシュ）', 'スキーマ・ICDコード・計算の機械検査'];
      const blindOk = rb ? rb.answer === cand.answer : (r && r.blindAnswer === cand.answer);
      status = r && r.verdict === 'pass' && blindOk ? 'verified' : r && r.verdict === 'reject' ? 'rejected' : 'provisional';
      if (r) ver.notes = `再監査: ${(r.notes || r.detail || '').slice(0, 300)}｜${ver.notes}`;
      ({ cand, status } = applyRepair(key, cand, status, ver, base));
    } else {
      status = 'rejected';
      ver.method = ['独立ブラインド解答（別モデル）', `領域監査（${LENS[a.subject]}）で除外`];
      ver.notes = `除外理由: ${v.reason || ''} ${v.detail || ''}`;
    }
    const st = finalize(cand, status, ver, base);
    counts.gen[st]++;
  }
}

// ================= 書き出し =================
const bySubj = {};
for (const q of out) (bySubj[q.subject] = bySubj[q.subject] || []).push(q);
for (const f of fs.readdirSync(qdir)) if (f.endsWith('.json')) fs.unlinkSync(path.join(qdir, f));
for (const [s, qs] of Object.entries(bySubj)) {
  qs.sort((x, y) => (x.id < y.id ? -1 : 1));
  fs.writeFileSync(path.join(qdir, `${s}.json`), JSON.stringify({ subject: s, questions: qs }, null, 1) + '\n');
}
const usedCases = new Set(out.map((q) => q.caseId).filter(Boolean));
fs.writeFileSync(path.join(ROOT, 'bank', 'cases.json'), JSON.stringify({ note: '退院時要約・症例はすべて架空。実在の患者情報は使っていない。', cases: [...cases.values()].filter((c) => usedCases.has(c.id)).sort((x, y) => (x.id < y.id ? -1 : 1)) }, null, 1) + '\n');
fs.writeFileSync(path.join(WORK, 'legacy-changes.json'), JSON.stringify(changes, null, 1));
console.log(JSON.stringify(counts));
