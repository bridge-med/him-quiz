#!/usr/bin/env node
// 公開用問題バンクのビルド（正規のビルド経路）。
//   node tools/build.mjs          bank/ から data/bank.js を作り、index.html の読み込み版（?v=）を更新する
//   node tools/build.mjs --check  生成物が bank/ とソースに一致しているかだけを検査（CI・デプロイ前）
//   node tools/build.mjs --dev --out DIR   開発用: provisional も含めた試験用バンクを DIR に書く（公開しない）
// 公開バンクには status が verified の問題だけを入れる。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { icdCodesIn, isIcdContext } from './lib/schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DEV = args.includes('--dev');
const OUT = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : null;
if (DEV && !OUT) { console.error('--dev には --out DIR が必要（公開ファイルには書かない）'); process.exit(2); }

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function loadBank(root = ROOT) {
  const subjects = readJson(path.join(root, 'bank', 'subjects.json'));
  const casesPath = path.join(root, 'bank', 'cases.json');
  const cases = fs.existsSync(casesPath) ? readJson(casesPath).cases : [];
  const qdir = path.join(root, 'bank', 'questions');
  const questions = [];
  for (const f of fs.readdirSync(qdir).filter((f) => f.endsWith('.json')).sort()) {
    const d = readJson(path.join(qdir, f));
    for (const q of d.questions) questions.push(q);
  }
  return { subjects, cases, questions };
}

function relatedOf(q, pool) {
  // 同じ科目・サブトピックの検証済み問題。形式の違うものを先に、ID順で安定させる
  const same = pool.filter((x) => x.id !== q.id && x.subject === q.subject && x.subtopic === q.subtopic);
  same.sort((a, b) => (a.format === q.format) - (b.format === q.format) || (a.id < b.id ? -1 : 1));
  return same.slice(0, 6).map((x) => x.id);
}

export function buildPublic({ subjects, cases, questions }, { dev = false } = {}) {
  const subjMap = new Map(subjects.subjects.map((s) => [s.id, s]));
  const ok = questions.filter((q) => q.status === 'verified' || (dev && q.status === 'provisional'));
  const ids = new Set();
  for (const q of questions) { if (ids.has(q.id)) throw new Error(`問題IDが重複: ${q.id}`); ids.add(q.id); }
  const caseIds = new Set(ok.filter((q) => q.caseId).map((q) => q.caseId));
  const pub = ok.map((q) => ({
    id: q.id, subject: q.subject, course: subjMap.get(q.subject)?.course || '専門', subtopic: q.subtopic || '（未分類）',
    format: q.format || 'knowledge', difficulty: q.difficulty || 'standard', polarity: q.polarity,
    question: q.question, choices: q.choices, answer: q.answer,
    explanation: { correct: q.explanation.correct, choiceNotes: q.explanation.choiceNotes, point: q.explanation.point },
    sources: (q.sources || []).map((s) => ({ title: s.title, locator: s.locator, url: s.url })),
    asOf: q.asOf || '', ...(q.caseId ? { caseId: q.caseId } : {}),
    verifiedAt: q.verification?.date || null,
  }));
  for (const q of pub) q.related = relatedOf(q, pub);
  pub.sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.id < b.id ? -1 : 1));
  const legacyMap = {};
  const legacyChapters = {};
  for (const q of questions) if (q.legacy) {
    legacyMap[q.legacy.key] = { id: q.id, h: q.legacy.hash, active: q.status === 'verified' || (dev && q.status === 'provisional') };
    legacyChapters[q.legacy.chapter] = q.legacy.chapterName;
  }
  const body = {
    subjects: subjects.subjects.map((s) => ({ id: s.id, course: s.course, no: s.no, name: s.name, short: s.short, subtopics: s.subtopics })),
    formats: subjects.formats, difficulties: subjects.difficulties,
    cases: cases.filter((c) => caseIds.has(c.id)).map((c) => ({ id: c.id, title: c.title, text: c.text })),
    questions: pub, legacyMap, legacyChapters,
  };
  const dates = pub.map((q) => q.verifiedAt).filter(Boolean).sort();
  const version = `v8-${(dates[dates.length - 1] || 'unverified').replace(/-/g, '')}-${sha(JSON.stringify(body)).slice(0, 8)}${dev ? '-dev' : ''}`;
  return { version, ...body };
}

export function bankJs(pub) {
  return `/* 自動生成: tools/build.mjs（直接編集しない）。公開用問題バンク: verified のみ ${pub.questions.length}問 */\nwindow.HIMQ_BANK=${JSON.stringify(pub)};\n`;
}

// 公開バンクで使っている ICD コードと公式名称の抜粋（CI で全表なしに照合するため）
const ICD_TABLE = process.env.HIMQ_ICD_TABLE || '/home/user/hq-work/icd/icd10-2013.json';
export function icdRef(questions) {
  const used = new Set();
  for (const q of questions) if (q.status === 'verified' && isIcdContext(q)) icdCodesIn(q).forEach((c) => used.add(c));
  if (!fs.existsSync(ICD_TABLE)) return { used, ref: null };
  const t = readJson(ICD_TABLE);
  const names = new Map();
  for (const r of t.rows) { const c = String(r.code || '').replace(/[†*]/g, ''); if (/^[A-Z][0-9]{2}/.test(c) && !names.has(c)) names.set(c, r.name); }
  const codes = [...used].sort().map((c) => ({ code: c, name: names.get(c) ?? null }));
  return { used, ref: { source: t.source, url: t.url, note: '公開バンクの問題（ICD関連）が使っているコードの抜粋。名称は厚生労働省の基本分類表（ICD-10（2013年版）準拠）による。', codes } };
}

function withVersions(html, files) {
  let out = html;
  for (const [rel, content] of Object.entries(files)) {
    const v = sha(content).slice(0, 10);
    const re = new RegExp(`(${rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})\\?v=[A-Za-z0-9_]+`);
    if (!re.test(out)) throw new Error(`index.html に ${rel}?v= が見つからない`);
    out = out.replace(re, `$1?v=${v}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bank = loadBank();
  const pub = buildPublic(bank, { dev: DEV });
  const js = bankJs(pub);
  const core = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const htmlPath = path.join(ROOT, 'index.html');
  const html = withVersions(fs.readFileSync(htmlPath, 'utf8'), { 'data/bank.js': js, 'js/core.js': core, 'js/app.js': app });
  const { used: icdUsed, ref } = icdRef(bank.questions);
  const refPath = path.join(ROOT, 'data', 'icd-ref.json');
  const refJson = ref ? JSON.stringify(ref, null, 1) + '\n' : null;
  if (ref && ref.codes.some((c) => c.name === null)) { console.error('NG: 基本分類表にないICDコード: ' + ref.codes.filter((c) => c.name === null).map((c) => c.code).join(', ')); if (!DEV) process.exit(1); }
  if (DEV) {
    fs.mkdirSync(path.join(OUT, 'data'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'data', 'bank.js'), js);
    fs.writeFileSync(path.join(OUT, 'js', 'core.js'), core); fs.writeFileSync(path.join(OUT, 'js', 'app.js'), app);
    fs.writeFileSync(path.join(OUT, 'index.html'), html);
    console.log(`dev bank: ${pub.questions.length} questions -> ${OUT}`);
  } else if (CHECK) {
    const curJs = fs.existsSync(path.join(ROOT, 'data', 'bank.js')) ? fs.readFileSync(path.join(ROOT, 'data', 'bank.js'), 'utf8') : '';
    const curHtml = fs.readFileSync(htmlPath, 'utf8');
    const problems = [];
    if (curJs !== js) problems.push('data/bank.js が bank/ の内容と一致しない（node tools/build.mjs を実行してコミット）');
    if (curHtml !== html) problems.push('index.html の読み込み版（?v=）が古い（node tools/build.mjs を実行してコミット）');
    const curRef = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf8') : null;
    if (refJson !== null && curRef !== refJson) problems.push('data/icd-ref.json が古い（node tools/build.mjs を実行してコミット）');
    if (refJson === null) { // 全表が無い環境（CI）: 抜粋に全コードが載っているかだけを見る
      const have = new Set(curRef ? JSON.parse(curRef).codes.map((c) => c.code) : []);
      const miss = [...icdUsed].filter((c) => !have.has(c));
      if (miss.length) problems.push('data/icd-ref.json に無いICDコード: ' + miss.join(', '));
    }
    if (problems.length) { problems.forEach((p) => console.error('NG: ' + p)); process.exit(1); }
    console.log(`OK: 公開バンクはソースと一致（verified ${pub.questions.length}問, ${pub.version}）`);
  } else {
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'data', 'bank.js'), js);
    fs.writeFileSync(htmlPath, html);
    if (refJson !== null) fs.writeFileSync(refPath, refJson);
    console.log(`built data/bank.js: verified ${pub.questions.length}問 / 全${bank.questions.length}問, ${pub.version}, ${(js.length / 1024).toFixed(0)}KB`);
  }
}
