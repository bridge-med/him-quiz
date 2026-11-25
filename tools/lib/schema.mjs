// 問題データの検証（生成バッチと bank/questions/*.json の両方に使う）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkQuote } from './sources.mjs';
import { normQuote } from './normalize.mjs';
import { checkCalc } from './calc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SUBJECTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'bank', 'subjects.json'), 'utf8'));
export const SUBJECT_MAP = new Map(SUBJECTS.subjects.map((s) => [s.id, s]));
export const FORMATS = Object.keys(SUBJECTS.formats);
export const DIFFS = Object.keys(SUBJECTS.difficulties);
export const STATUSES = ['verified', 'provisional', 'rejected'];

const NEG_RE = /誤っている|誤り|適切でない|正しくない|不適切|該当しない|含まれない|ないもの|でないもの|除外されるもの|分類されないもの/;
const ICD_RE = /(?<![A-Za-z0-9])([A-Z][0-9]{2}(?:\.[0-9]{1,2})?)(?![0-9])/g;

let ICD = null;
export function loadIcd() {
  if (ICD !== null) return ICD;
  const p = process.env.HIMQ_ICD_TABLE || '/home/user/hq-work/icd/icd10-2013.json';
  const snap = path.join(ROOT, 'data', 'icd-ref.json');
  const set = new Set();
  if (fs.existsSync(p)) {
    for (const r of JSON.parse(fs.readFileSync(p, 'utf8')).rows) {
      const c = String(r.code || '').replace(/[†*]/g, '');
      if (/^[A-Z][0-9]{2}/.test(c)) set.add(c);
    }
    ICD = { set, full: true };
  } else if (fs.existsSync(snap)) {
    for (const r of JSON.parse(fs.readFileSync(snap, 'utf8')).codes) set.add(r.code);
    ICD = { set, full: false, snapshot: true };
  } else ICD = { set, full: false, none: true };
  return ICD;
}

export function icdCodesIn(q) {
  const txt = [q.question, ...(q.choices || []), q.explanation && q.explanation.correct, q.explanation && q.explanation.point, ...((q.explanation && q.explanation.choiceNotes) || [])].filter(Boolean).join(' \n ');
  const out = new Set();
  for (const m of String(txt).normalize('NFKC').matchAll(ICD_RE)) out.add(m[1]);
  return [...out];
}

export function isIcdContext(q) {
  return ['icd', 'coding', 'summary'].includes(q.format) || ['S11', 'S12'].includes(q.subject);
}

// ctx: { cases: Map, registry: Map|null, requireId: bool }
export function validateQuestion(q, ctx = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  if (ctx.requireId && !(typeof q.id === 'string' && /^[a-z0-9][a-z0-9-]{3,40}$/.test(q.id))) E('id が不正');
  const subj = SUBJECT_MAP.get(q.subject);
  if (!subj) E(`subject が不正: ${q.subject}`);
  else if (!subj.subtopics.includes(q.subtopic)) E(`subtopic が科目の一覧にない: ${q.subtopic}`);
  if (!FORMATS.includes(q.format)) E(`format が不正: ${q.format}`);
  if (!DIFFS.includes(q.difficulty)) E(`difficulty が不正: ${q.difficulty}`);
  if (!['positive', 'negative'].includes(q.polarity)) E(`polarity が不正: ${q.polarity}`);
  if (typeof q.question !== 'string' || q.question.trim().length < 8) E('question が短すぎる');
  const ch = q.choices;
  if (!Array.isArray(ch) || ch.length < 4 || ch.length > 5) E('choices は4〜5個');
  else {
    if (ch.some((c) => typeof c !== 'string' || !c.trim())) E('空の選択肢がある');
    const n = ch.map((c) => normQuote(c));
    if (new Set(n).size !== n.length) E('同じ選択肢が重複');
    if (ch.some((c) => /上記のすべて|上記すべて|すべて正しい|いずれも正しい|いずれも誤り|上記のいずれでもない/.test(c))) E('「すべて/いずれも」型の選択肢は禁止');
    if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < ch.length)) E('answer の位置が範囲外');
    else {
      const others = ch.filter((_, i) => i !== q.answer).map((c) => c.length).sort((a, b) => a - b);
      const med = others[Math.floor(others.length / 2)] || 1;
      if (ch[q.answer].length > Math.max(12, med * 1.8)) W('正答の選択肢だけが極端に長い（手がかりになる）');
    }
  }
  if (q.polarity === 'negative' && typeof q.question === 'string' && !NEG_RE.test(q.question)) E('polarity=negative だが問題文に「誤っている」等の指定がない');
  if (q.polarity === 'positive' && typeof q.question === 'string' && /誤っている|誤り|適切でない|正しくない|不適切/.test(q.question)) E('polarity=positive だが問題文が否定形');
  const ex = q.explanation || {};
  if (typeof ex.correct !== 'string' || ex.correct.trim().length < 10) E('explanation.correct が短すぎる');
  if (typeof ex.point !== 'string' || ex.point.trim().length < 6) E('explanation.point が短すぎる');
  if (!Array.isArray(ex.choiceNotes) || !Array.isArray(ch) || ex.choiceNotes.length !== ch.length) E('explanation.choiceNotes は選択肢と同じ数の配列');
  else ex.choiceNotes.forEach((t, i) => { if (i !== q.answer && (typeof t !== 'string' || t.trim().length < 4)) E(`choiceNotes[${i}]（誤答の解説）が空`); });
  if (!Array.isArray(q.sources) || !q.sources.length) E('sources が空');
  else q.sources.forEach((s, i) => {
    if (!s || typeof s !== 'object') return E(`sources[${i}] が不正`);
    for (const k of ['ref', 'title', 'url', 'locator', 'quote']) if (typeof s[k] !== 'string' || !s[k].trim()) E(`sources[${i}].${k} が空`);
    if (typeof s.url === 'string' && !/^https?:\/\//.test(s.url)) E(`sources[${i}].url が URL でない`);
    if (ctx.registry && s.ref && s.quote) {
      const r = checkQuote(ctx.registry, s);
      if (!r.ok) E(`sources[${i}] ${r.why}（${s.ref}）`);
      else if (r.entry.url && s.url && r.entry.url !== s.url && !(r.entry.urls || []).includes(s.url)) W(`sources[${i}].url が登録簿の URL と違う（登録簿: ${r.entry.url}）`);
    }
  });
  if (typeof q.asOf !== 'string' || !q.asOf.trim()) E('asOf（基準時点）が空');
  if (q.caseId) { if (ctx.cases && !ctx.cases.has(q.caseId)) E(`caseId が cases にない: ${q.caseId}`); }
  if (q.format === 'summary' && !q.caseId) E('format=summary には caseId が必要');
  if (q.status !== undefined && !STATUSES.includes(q.status)) E(`status が不正: ${q.status}`);
  if (q.format === 'calculation' && !q.calc) E('format=calculation には calc（検算用の式と値）が必要');
  checkCalc(q).forEach(E);
  const icd = loadIcd();
  if (!icd.none && isIcdContext(q)) {
    for (const c of icdCodesIn(q)) {
      if (!icd.set.has(c) && icd.full) E(`ICDコードが基本分類表（2013年版）にない: ${c}`);
      else if (!icd.set.has(c) && icd.snapshot) E(`ICDコードが data/icd-ref.json にない（ビルドで照合されていない）: ${c}`);
    }
  }
  return { errors, warnings };
}

export function loadCases(file) {
  const m = new Map();
  if (file && fs.existsSync(file)) {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of (d.cases || d)) m.set(c.id, c);
  }
  return m;
}
