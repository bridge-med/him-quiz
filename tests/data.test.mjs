// 公開用問題バンク（data/bank.js）と生成元（bank/）の整合テスト。 node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateQuestion, loadCases } from '../tools/lib/schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'bank.js'), 'utf8'), ctx);
const BANK = ctx.window.HIMQ_BANK;
const SRC = [];
for (const f of fs.readdirSync(path.join(ROOT, 'bank', 'questions')).filter((f) => f.endsWith('.json'))) {
  for (const q of JSON.parse(fs.readFileSync(path.join(ROOT, 'bank', 'questions', f), 'utf8')).questions) SRC.push(q);
}
const CASES = loadCases(path.join(ROOT, 'bank', 'cases.json'));

test('公開バンクが読み込める', () => {
  assert.ok(BANK && Array.isArray(BANK.questions) && BANK.questions.length > 0);
  assert.ok(/^v8-/.test(BANK.version));
});

test('公開バンクは verified の問題だけで、verified はすべて公開されている', () => {
  const pub = new Set(BANK.questions.map((q) => q.id));
  const verified = new Set(SRC.filter((q) => q.status === 'verified').map((q) => q.id));
  for (const id of pub) assert.ok(verified.has(id), `未検証の問題が公開されている: ${id}`);
  for (const id of verified) assert.ok(pub.has(id), `verified なのに公開されていない: ${id}`);
  const statuses = new Set(SRC.map((q) => q.status));
  for (const s of statuses) assert.ok(['verified', 'provisional', 'rejected'].includes(s), `不明な status: ${s}`);
});

test('問題IDは一意（生成元全体で）', () => {
  const ids = SRC.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('正答位置・選択肢数・選択肢別解説の整合', () => {
  for (const q of BANK.questions) {
    assert.ok(q.choices.length === 4 || q.choices.length === 5, `${q.id}: 選択肢は4〜5`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${q.id}: 正答位置`);
    assert.equal(q.explanation.choiceNotes.length, q.choices.length, `${q.id}: 解説の数`);
    q.choices.forEach((_, i) => { if (i !== q.answer) assert.ok(q.explanation.choiceNotes[i] && q.explanation.choiceNotes[i].length >= 4, `${q.id}: 選択肢${i}の解説`); });
    assert.ok(q.explanation.correct && q.explanation.point, `${q.id}: 正答の解説とポイント`);
    assert.ok(q.sources.length >= 1 && q.sources.every((s) => /^https?:\/\//.test(s.url) && s.title), `${q.id}: 根拠資料`);
    assert.ok(q.asOf, `${q.id}: 基準時点`);
    assert.ok(q.verifiedAt, `${q.id}: 検証日`);
  }
});

test('verified の生成元はすべてスキーマ検査を通る', () => {
  const errs = [];
  for (const q of SRC.filter((x) => x.status === 'verified')) {
    const r = validateQuestion(q, { cases: CASES, registry: null, requireId: true });
    r.errors.forEach((e) => errs.push(`${q.id}: ${e}`));
    assert.ok(q.verification && q.verification.date && Array.isArray(q.verification.method) && q.verification.method.length >= 2, `${q.id}: 検証記録（2つ以上の独立した検証）`);
  }
  assert.deepEqual(errs, []);
});

test('退院時要約の症例が存在し、症例問題が出題できる', () => {
  const ids = new Set(BANK.cases.map((c) => c.id));
  for (const q of BANK.questions) if (q.caseId) assert.ok(ids.has(q.caseId), `${q.id}: 症例 ${q.caseId}`);
});

test('科目・サブトピックが科目一覧と一致', () => {
  const sm = new Map(BANK.subjects.map((s) => [s.id, s]));
  for (const q of BANK.questions) {
    assert.ok(sm.has(q.subject), `${q.id}: 科目`);
    assert.ok(sm.get(q.subject).subtopics.includes(q.subtopic), `${q.id}: サブトピック ${q.subtopic}`);
  }
});

test('旧版（章ID＋インデックス）→ 永続IDの対応が凍結コピーと一致', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'bank', 'legacy', 'v2-bank.json'), 'utf8'));
  const srcIds = new Set(SRC.map((q) => q.id));
  let n = 0;
  for (const ch of legacy) ch.questions.forEach((q, i) => {
    n++;
    const key = `${ch.id}_${i}`;
    const m = BANK.legacyMap[key];
    assert.ok(m, `legacyMap に ${key} がない`);
    const h = crypto.createHash('sha256').update(JSON.stringify([q.q, q.c, q.a])).digest('hex').slice(0, 16);
    assert.equal(m.h, h, `${key}: 旧版の問題内容と対応先が一致しない`);
    assert.ok(srcIds.has(m.id), `${key}: 対応先 ${m.id} が生成元にない`);
    const pub = BANK.questions.find((x) => x.id === m.id);
    assert.equal(!!pub, m.active, `${key}: active と公開状態が一致しない`);
  });
  assert.equal(n, 360);
  assert.equal(Object.keys(BANK.legacyMap).length, 360);
});

test('正答位置が特定の記号に偏っていない', () => {
  const pos = [0, 0, 0, 0, 0];
  BANK.questions.forEach((q) => { pos[q.answer]++; });
  const n = BANK.questions.length;
  for (let i = 0; i < 4; i++) assert.ok(pos[i] / n < 0.4, `位置${'ABCDE'[i]}が${Math.round(pos[i] / n * 100)}%`);
});

test('生成物はソースと一致（node tools/build.mjs --check）', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--check'], { stdio: 'pipe' });
});
