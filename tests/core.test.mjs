// 学習ロジック（js/core.js）の単体テスト。 node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.TZ = 'Asia/Tokyo';
const C = require('../js/core.js');

const DAY = C.DAY;
const T0 = new Date(2026, 10, 24, 9, 0, 0).getTime(); // 2026-11-24 09:00 JST

function memLS(init = {}) {
  const m = { ...init };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] ?? null,
    get length() { return Object.keys(m).length; },
    _m: m,
  };
}
function fakeBank() {
  const qs = [];
  const subs = [['S01', 'a'], ['S01', 'b'], ['S11', 'x'], ['S12', 'y']];
  let n = 0;
  for (const [s, t] of subs) for (let i = 0; i < 10; i++) qs.push({ id: `q${n++}`, subject: s, course: '専門', subtopic: t, answer: 0, choices: ['a', 'b', 'c', 'd', 'e'] });
  qs.push({ id: 'c1', subject: 'S12', course: '専門', subtopic: 'y', caseId: 'case1', answer: 1, choices: ['a', 'b', 'c', 'd'] });
  qs.push({ id: 'c2', subject: 'S12', course: '専門', subtopic: 'y', caseId: 'case1', answer: 2, choices: ['a', 'b', 'c', 'd'] });
  qs.push({ id: 'b1', subject: 'BCL', course: '基礎', subtopic: 'z', answer: 0, choices: ['a', 'b', 'c', 'd'] });
  return {
    version: 'test', questions: qs,
    legacyMap: { '1_0': { id: 'q0', h: 'x', active: true }, '9_3': { id: 'q30', h: 'y', active: true }, '2_5': { id: 'q5', h: 'z', active: true }, '3_1': { id: 'gone', h: 'w', active: false } },
    legacyChapters: { 1: '医療管理総論' },
  };
}

test('誤答は誤答リストに入り、異なる2日に正答するまで外れない', () => {
  let r = C.nextRec(null, false, '', T0);
  assert.equal(r.wf, 1); assert.equal(r.b, 0); assert.equal(r.n, 1); assert.equal(r.f, 0);
  r = C.nextRec(r, true, 's', T0 + 3600e3); // 同じ日に正答
  assert.equal(r.wf, 1, '同じ日の正答だけでは外れない');
  r = C.nextRec(r, true, 's', T0 + 7200e3); // 同じ日にもう一度
  assert.equal(r.wf, 1, '同じ日に何回正答しても外れない');
  assert.equal(r.cd.length, 1);
  r = C.nextRec(r, true, 's', T0 + DAY); // 翌日に正答
  assert.equal(r.wf, 0, '異なる2日の正答で外れる');
  assert.equal(r.w, 1); assert.equal(r.c, 3);
});

test('勘で正解した問題は復習対象になり、習熟にしない', () => {
  let r = C.nextRec(null, true, 'g', T0);
  assert.equal(r.wf, 1);
  assert.ok(r.b <= 1);
  assert.equal(C.isMastered(r), false);
  assert.equal(r.d, T0 + DAY);
});

test('迷った正解は段階を上げず翌日に再出題', () => {
  let r = C.nextRec(null, true, 's', T0); // b=1
  assert.equal(r.b, 1);
  r = C.nextRec(r, true, 'u', T0 + DAY);
  assert.equal(r.b, 1);
  assert.equal(r.d, T0 + 2 * DAY);
});

test('習熟は異なる2日以上の正答と連続正答2以上', () => {
  let r = C.nextRec(null, true, 's', T0);
  r = C.nextRec(r, true, 's', T0 + 60e3); // 同日: 段階は上がらない
  assert.equal(r.b, 1); assert.equal(C.isMastered(r), false);
  r = C.nextRec(r, true, 's', T0 + DAY);
  assert.equal(r.b, 2); assert.equal(C.isMastered(r), true);
  r = C.nextRec(r, false, '', T0 + 2 * DAY);
  assert.equal(C.isMastered(r), false); assert.equal(r.s, 0);
});

test('自信度の付け直しは解答前の記録から再計算する', () => {
  const st = new C.Store(memLS());
  const S = new C.State(st, fakeBank());
  const a = S.answer('q1', true, { ts: T0, mode: 'skima' });
  assert.equal(S.rec('q1').wf, 0);
  S.setConfidence('q1', a.before, true, 'g', a.ts, 'skima');
  assert.equal(S.rec('q1').wf, 1, '勘に変えると誤答リストへ');
  assert.equal(S.rec('q1').n, 1, '解答回数は二重に数えない');
  S.setConfidence('q1', a.before, true, 's', a.ts, 'skima');
  assert.equal(S.rec('q1').wf, 0);
  assert.equal(S.log.length, 1);
  assert.equal(S.log[0][3], 's');
});

test('全モードの解答が記録され、集計に反映される（初回・累積・直近）', () => {
  const st = new C.Store(memLS());
  const S = new C.State(st, fakeBank());
  S.answer('q0', true, { ts: T0, mode: 'random' });
  S.answer('q1', false, { ts: T0, mode: 'exam' });
  S.answer('q1', true, { ts: T0 + 1000, mode: 'wrong' });
  S.answer('q2', true, { ts: T0, mode: 'skima' });
  const s = S.stats(C.proQuestions(S.bank), T0 + 2000);
  assert.equal(s.seen, 3); assert.equal(s.n, 4); assert.equal(s.c, 3);
  assert.equal(s.firstAcc, 2 / 3);
  assert.equal(s.review, 1);
  assert.equal(S.recentAccuracy(50).acc, 0.75);
  // 再読込しても残る
  const S2 = new C.State(st, fakeBank());
  assert.equal(S2.rec('q1').n, 2);
});

test('旧版データの移行: バックアップ・ID対応・報告・二重移行しない', () => {
  const ls = memLS({
    himq_wrong: JSON.stringify([{ chId: 1, qIdx: 0 }, { chId: 9, qIdx: 3 }, { chId: 3, qIdx: 1 }, { chId: 99, qIdx: 0 }]),
    himq_bookmarks: JSON.stringify([{ chId: 2, qIdx: 5 }]),
    himq_score_1: JSON.stringify({ correct: 10, total: 15 }),
    other_app_key: 'keep',
  });
  const st = new C.Store(ls);
  const res = C.migrate(st, fakeBank(), T0);
  assert.equal(res.migrated, true);
  assert.deepEqual(res.report.wrong, { total: 4, mapped: 2, inactive: 1, unknown: 1 });
  assert.deepEqual(res.report.bookmarks, { total: 1, mapped: 1, inactive: 0, unknown: 0 });
  const q = st.get(C.KEYS.q, {});
  assert.equal(q.q0.wf, 1); assert.equal(q.q30.wf, 1); assert.equal(q.q0.lw, 1);
  assert.deepEqual(st.get(C.KEYS.bm, []), ['q5']);
  assert.deepEqual(st.get(C.KEYS.legacy, {}).chapters['1'], { correct: 10, total: 15 });
  const b = st.get(C.KEYS.backupV7, null);
  assert.ok(b && b.data.himq_wrong && b.data.himq_score_1, '移行前データを退避');
  assert.equal(ls.getItem('other_app_key'), 'keep');
  assert.equal(C.migrate(st, fakeBank(), T0 + 1).reason, 'already');
  // 誤答は今すぐ復習対象
  const S = new C.State(st, fakeBank());
  assert.deepEqual(S.wrongList(S.bank.questions).sort(), ['q0', 'q30']);
});

test('旧版データが無ければ移行しない', () => {
  const st = new C.Store(memLS());
  assert.equal(C.migrate(st, fakeBank(), T0).migrated, false);
  assert.equal(st.get(C.KEYS.meta, {}).schema, 8);
});

test('書き出し→取り込みで復元でき、取り込み前の状態はバックアップされる', () => {
  const st = new C.Store(memLS());
  C.migrate(st, fakeBank(), T0);
  const S = new C.State(st, fakeBank());
  S.answer('q3', false, { ts: T0 });
  S.toggleBookmark('q4');
  const exp = C.exportData(st, fakeBank(), T0);
  assert.equal(exp._version, 'him-quiz-v8');
  assert.ok(exp.himq_v8_q);
  // 別の端末に取り込み
  const st2 = new C.Store(memLS({ himq_v8_q: JSON.stringify({ q9: { n: 1 } }) }));
  const r = C.importData(st2, fakeBank(), JSON.parse(JSON.stringify(exp)), T0 + 10);
  assert.equal(r.migrated, false);
  const S2 = new C.State(st2, fakeBank());
  assert.equal(S2.rec('q3').wf, 1); assert.deepEqual(S2.bm, ['q4']); assert.equal(S2.rec('q9'), null);
  assert.ok(st2.get(C.KEYS.backupLast, null).data.himq_v8_q.includes('q9'), '取り込み前をバックアップ');
  C.restoreBackup(st2, 'last', T0 + 20);
  assert.ok(new C.State(st2, fakeBank()).rec('q9'));
});

test('旧版の書き出しファイル（him-quiz-v2）を取り込むと移行される', () => {
  const st = new C.Store(memLS());
  const v2 = { himq_wrong: JSON.stringify([{ chId: 1, qIdx: 0 }]), himq_bookmarks: '[]', _version: 'him-quiz-v2', _exportDate: '2026-11-01T00:00:00Z' };
  const r = C.importData(st, fakeBank(), v2, T0);
  assert.equal(r.migrated, true);
  assert.equal(new C.State(st, fakeBank()).rec('q0').wf, 1);
});

test('全リセットは直前の状態をバックアップしてから消す', () => {
  const st = new C.Store(memLS());
  const S = new C.State(st, fakeBank());
  S.answer('q1', true, { ts: T0 });
  C.resetAll(st, T0 + 1);
  assert.equal(new C.State(st, fakeBank()).rec('q1'), null);
  C.restoreBackup(st, 'last', T0 + 2);
  assert.equal(new C.State(st, fakeBank()).rec('q1').n, 1);
});

test('スキマ時間: 指定数・重複なし・復習対象と未演習を含む', () => {
  const st = new C.Store(memLS());
  const S = new C.State(st, fakeBank());
  ['q0', 'q1', 'q2'].forEach((id) => S.answer(id, false, { ts: T0 }));
  S.answer('q3', true, { ts: T0, conf: 'u' });
  const pro = C.proQuestions(S.bank);
  const ids = S.smartSession(pro, 10, { now: T0 + 2 * DAY, seed: 7 });
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
  for (const id of ['q0', 'q1', 'q2', 'q3']) assert.ok(ids.includes(id), `復習対象 ${id} を含む`);
  assert.ok(ids.some((id) => !S.rec(id)), '未演習を含む');
  assert.equal(S.smartSession(pro, 5, { now: T0, seed: 1 }).length, 5);
});

test('弱点集中: 正答率の低いサブトピックの誤答と未演習の類題を出す', () => {
  const st = new C.Store(memLS());
  const S = new C.State(st, fakeBank());
  for (let i = 10; i < 14; i++) S.answer(`q${i}`, false, { ts: T0 }); // S01 b を全部誤答
  for (let i = 0; i < 4; i++) S.answer(`q${i}`, true, { ts: T0 }); // S01 a は正答
  const weak = S.weakSubtopics(S.bank.questions, 3);
  assert.equal(weak[0].key, 'S01|b');
  const r = S.weakSession(S.bank.questions, 8, { seed: 3 });
  assert.equal(r.ids.length, 8);
  assert.ok(r.ids.every((id) => S.bank.questions.find((q) => q.id === id).subtopic === 'b'));
  assert.ok(r.ids.some((id) => !S.rec(id)), '未演習の類題を含む');
});

test('模擬試験: 全範囲は専門課程のみ・重複なし／退院時要約は症例単位／採点', () => {
  const bank = fakeBank();
  const ex = C.buildExam(bank, 'full', { seed: 5 });
  assert.equal(ex.ids.length, 42); // 専門の総数(42)が50未満
  assert.equal(new Set(ex.ids).size, ex.ids.length);
  assert.ok(!ex.ids.includes('b1'));
  const sm = C.buildExam(bank, 'summary', { seed: 1 });
  assert.deepEqual(sm.ids, ['c1', 'c2']);
  const sc = C.scoreExam(bank, ['q0', 'q1', 'c1'], { q0: 0, q1: 2 });
  assert.equal(sc.correct, 1); assert.equal(sc.unanswered, 1);
  assert.deepEqual(sc.perSubject.S01, [1, 2]);
  assert.deepEqual(sc.items[2], ['c1', -1, 0]);
  const sub = C.buildExam(bank, 'subject', { subject: 'S11', seed: 2 });
  assert.equal(sub.ids.length, 10); assert.equal(sub.minutes, 13, '10問なら25分×10/20');
});

test('試験日までの計画: 未習得 ÷ 残り日数', () => {
  const st = new C.Store(memLS());
  const S = new C.State(st, fakeBank());
  S.setExamDate('2026-12-04');
  const p = S.plan(C.proQuestions(S.bank), T0);
  assert.equal(p.days, 10);
  assert.equal(p.unmastered, 42);
  assert.equal(p.perDay, 5);
  S.setExamDate('2026-11-01');
  assert.ok(S.plan(C.proQuestions(S.bank), T0).days < 0);
});

test('保存できない環境でも例外にしない', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {}, key: () => null, length: 0 };
  const st = new C.Store(broken);
  const S = new C.State(st, fakeBank());
  assert.doesNotThrow(() => S.answer('q0', true, { ts: T0 }));
  assert.equal(st.ok, false);
});
