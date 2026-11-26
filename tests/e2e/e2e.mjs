#!/usr/bin/env node
// ブラウザテスト（Playwright）。CI では動かさず、手元で実行する:
//   node tests/e2e/e2e.mjs [SITE_DIR]      SITE_DIR 既定はリポジトリ直下（静的ホスティングと同じ構成で配信）
// iPhone 13（WebKit がない環境では Chromium で iPhone の画面・UA・タッチを再現）と PC（1280×800）で確認する。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require('playwright');

const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}/index.html`;

const results = [];
let current = '';
let PAGE = null;
async function check(name, fn) {
  try { await fn(); results.push({ ok: true, name: `${current} ${name}` }); }
  catch (e) {
    let snap = '';
    try { snap = await PAGE.evaluate(() => (document.getElementById('modal-root') ? '[modal] ' : '') + document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)); } catch (_) { /* noop */ }
    results.push({ ok: false, name: `${current} ${name}`, err: e.message.split('\n')[0] + ' ｜画面: ' + snap });
    try { await PAGE.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.remove(); window.HQ.home(); }); } catch (_) { /* 次のテストのためにホームへ戻す */ }
  }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

async function noOverflow(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  assert(r.sw <= r.vw + 1, `${label}: 横スクロール ${r.sw} > ${r.vw}`);
}

async function run(browserType, deviceName, ctxOpts) {
  current = `[${deviceName}]`;
  const browser = await browserType.launch();
  const ctx = await browser.newContext({ ...ctxOpts, acceptDownloads: true });
  const page = await ctx.newPage();
  PAGE = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());

  // 旧版（v2）の学習データを入れた状態で初回表示 → 移行
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('himq_wrong', JSON.stringify([{ chId: 9, qIdx: 0 }, { chId: 6, qIdx: 1 }, { chId: 1, qIdx: 2 }]));
    localStorage.setItem('himq_bookmarks', JSON.stringify([{ chId: 2, qIdx: 0 }]));
    localStorage.setItem('himq_score_6', JSON.stringify({ correct: 5, total: 8 }));
  });
  await page.goto(URL0);
  await page.waitForSelector('.tiles');

  await check('全問題データの読み込み（verified のみ）', async () => {
    const r = await page.evaluate(() => ({ n: window.HIMQ_BANK.questions.length, allVerified: window.HIMQ_BANK.questions.every((q) => q.verifiedAt) }));
    assert(r.n > 0, 'no questions'); assert(r.allVerified, '検証日のない問題がある');
  });
  await check('旧版データの移行とバックアップ', async () => {
    const r = await page.evaluate(() => ({ meta: JSON.parse(localStorage.getItem('himq_v8_meta')), backup: !!localStorage.getItem('himq_backup_v7'), legacy: JSON.parse(localStorage.getItem('himq_v8_legacy')) }));
    assert(r.meta && r.meta.schema === 8 && r.meta.migratedFrom === 'v2', 'meta');
    assert(r.backup, 'backup');
    assert(r.meta.report.wrong.total === 3 && r.meta.report.bookmarks.total === 1, 'report');
    assert(r.legacy.chapters['6'].total === 8, 'legacy chapter score');
  });
  await check('ホームの表示と横スクロールなし', async () => { await noOverflow(page, 'home'); });

  // スキマ時間 5問（自信度つき）
  await check('スキマ時間5問・自信度・結果', async () => {
    await page.click('.seg-btn >> text=5問');
    await page.waitForSelector('.q-card');
    await noOverflow(page, 'quiz');
    for (let i = 0; i < 5; i++) {
      await page.click('.choice-btn >> nth=0');
      await page.waitForSelector('.explanation');
      if (i === 0) { await page.click('.conf-btn >> text=勘'); await page.waitForSelector('.conf-btn.on'); }
      await page.click('#nextBtn');
    }
    await page.waitForSelector('.result-score');
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('himq_v8_log')));
    assert(log.length === 5, `log ${log.length}`);
    assert(log[0][3] === 'g', '自信度が記録されていない');
    await page.click('button:has-text("ホームに戻る")');
  });
  await check('選択肢のタップ領域（44px前後）', async () => {
    await page.click('.ch-card:not(.empty) >> nth=0'); await page.waitForSelector('.sub-list');
    await page.click('text=この科目を演習'); await page.click('.modal-opt >> nth=0');
    await page.waitForSelector('.choice-btn');
    const h = await page.$$eval('.choice-btn', (els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)));
    assert(h >= 40, `choice height ${h}`);
    await page.click('.back-btn');
  });
  await check('科目別演習（章別演習）と科目別の集計更新', async () => {
    await page.click('.ch-card:not(.empty) >> nth=1'); await page.waitForSelector('.sub-list');
    await page.click('text=この科目を演習'); await page.click('.modal-opt >> nth=0');
    await page.waitForSelector('.q-card');
    await page.click('.choice-btn >> nth=1'); await page.waitForSelector('.explanation');
    await page.click('.back-btn');
    const txt = await page.textContent('.ch-card:not(.empty) >> nth=1');
    assert(/正答率 (\d+%|—)/.test(txt), txt);
  });
  await check('全科目ランダム', async () => {
    await page.click('button:has-text("全科目ランダム")'); await page.click('.modal-opt >> nth=0');
    await page.waitForSelector('.q-card'); await page.click('.choice-btn >> nth=2'); await page.waitForSelector('.explanation');
    await page.click('.back-btn');
  });
  await check('5択と4択の表示', async () => {
    const counts = await page.evaluate(() => { const c = {}; window.HIMQ_BANK.questions.forEach((q) => { c[q.choices.length] = (c[q.choices.length] || 0) + 1; }); return c; });
    for (const n of [4, 5]) {
      if (!counts[n]) continue;
      const id = await page.evaluate((n) => window.HIMQ_BANK.questions.find((q) => q.choices.length === n).id, n);
      await page.evaluate((id) => window.HQ.practiceIds(id), id);
      await page.waitForSelector('.q-card');
      const k = await page.$$eval('.choice-btn', (els) => els.length);
      assert(k === n, `${n}択の表示 ${k}`);
      await page.click('.choice-btn >> nth=0'); await page.waitForSelector('.explanation');
      const notes = await page.$$eval('.expl-wrong-item', (els) => els.length);
      assert(notes === n - 1, `選択肢別解説 ${notes}`);
      await page.click('.back-btn');
    }
  });
  await check('退院時要約（症例）問題の表示', async () => {
    const id = await page.evaluate(() => (window.HIMQ_BANK.questions.find((q) => q.caseId) || {}).id);
    if (!id) return; // 症例問題がまだ無い場合は対象外
    await page.evaluate((id) => window.HQ.practiceIds(id), id);
    await page.waitForSelector('.case-panel[open] .case-text');
    await noOverflow(page, 'case');
    await page.click('.back-btn');
  });
  await check('誤答の復習（移行した誤答を含む）', async () => {
    await page.click('button:has-text("誤答の復習")'); await page.waitForSelector('.q-card');
    await page.click('.back-btn');
  });
  await check('ブックマーク（移行分を含む）', async () => {
    await page.click('button:has-text("ブックマーク")'); await page.waitForSelector('.q-card');
    await page.click('.bookmark-btn');
    const bm = await page.evaluate(() => JSON.parse(localStorage.getItem('himq_v8_bm')));
    assert(Array.isArray(bm), 'bm');
    await page.click('.back-btn');
  });
  await check('今日の学習・試験日の設定', async () => {
    await page.fill('#examDate', '2026-12-05');
    await page.dispatchEvent('#examDate', 'change');
    await page.waitForSelector('.plan-text strong');
    await page.click('button:has-text("今日の学習を始める")'); await page.waitForSelector('.q-card');
    await page.click('.back-btn');
  });
  await check('模擬試験: 正誤を出さない・見直し・一覧・途中終了・結果・見直し画面', async () => {
    await page.click('button.btn-accent:has-text("模擬試験")'); await page.click('text=全範囲 50問');
    await page.waitForSelector('#exam-timer');
    await page.click('.choice-btn >> nth=1');
    assert(!(await page.$('.explanation')), '試験中に解説が出ている');
    assert(!(await page.$('.correct-choice')), '試験中に正誤が出ている');
    await page.click('.flag-btn');
    await page.click('#nextBtn'); await page.click('.choice-btn >> nth=0');
    await page.click('.pal-open'); await page.waitForSelector('.palette');
    const st = await page.evaluate(() => ({ ans: document.querySelectorAll('.pal-btn.ans').length, flag: document.querySelectorAll('.pal-btn.flag').length }));
    assert(st.ans === 2 && st.flag === 1, JSON.stringify(st));
    await noOverflow(page, 'palette');
    await page.click('text=解答を終了して採点する');
    await page.waitForSelector('.pass');
    const ex = await page.evaluate(() => JSON.parse(localStorage.getItem('himq_v8_exams')));
    assert(ex.length === 1 && ex[0].unanswered >= 40, 'exam record');
    await page.click('.btnlike >> nth=0'); await page.waitForSelector('.explanation');
    await page.click('#nextBtn'); await page.waitForSelector('.explanation'); // 見直しは次の問題へ進める
    await page.click('.back-btn'); await page.waitForSelector('.pass'); // ← で結果一覧へ戻る
    await page.click('button:has-text("ホームに戻る")');
  });
  await check('模擬試験: 制限時間で自動採点', async () => {
    await page.click('button.btn-accent:has-text("模擬試験")'); await page.click('text=ICD-10集中');
    await page.waitForSelector('#exam-timer');
    await page.evaluate(() => { window.HQ._state().exam.startedAt = Date.now() - 999 * 60000; });
    await page.waitForSelector('.pass', { timeout: 5000 });
    const ex = await page.evaluate(() => JSON.parse(localStorage.getItem('himq_v8_exams')));
    assert(ex[ex.length - 1].timeUp === true, 'timeUp');
    await page.click('button:has-text("ホームに戻る")');
  });
  await check('模擬試験: 中断して再開', async () => {
    await page.click('button.btn-accent:has-text("模擬試験")'); await page.click('text=退院時要約集中');
    const started = await page.$('#exam-timer');
    if (!started) return; // 症例問題がまだ無い
    await page.click('.choice-btn >> nth=0');
    await page.click('.back-btn');
    await page.waitForSelector('text=前回の続き');
    await page.click('text=再開'); await page.waitForSelector('#exam-timer');
    await page.click('.pal-open'); await page.click('text=解答を終了して採点する'); await page.waitForSelector('.pass');
    await page.click('button:has-text("ホームに戻る")');
  });
  await check('弱点集中（サブトピック単位）', async () => {
    await page.evaluate(() => {
      const S = window.HQ._S, qs = window.HIMQ_BANK.questions;
      const sub = qs[0].subject, top = qs[0].subtopic;
      qs.filter((q) => q.subject === sub && q.subtopic === top).slice(0, 4).forEach((q) => S.answer(q.id, false, { mode: 'test' }));
    });
    await page.click('.back-btn').catch(() => {});
    await page.evaluate(() => window.HQ.home());
    await page.click('button:has-text("弱点集中")'); await page.waitForSelector('.q-card');
    await page.click('.back-btn');
  });
  let exported;
  await check('データのエクスポート', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button.data-btn:has-text("エクスポート")')]);
    const p = path.join(os.tmpdir(), `himq-export-${Date.now()}.json`);
    await dl.saveAs(p);
    exported = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert(exported._version === 'him-quiz-v8' && exported.himq_v8_q, 'export content');
    fs.writeFileSync(p, JSON.stringify(exported)); exported.path = p;
  });
  await check('全リセット → インポートで復元', async () => {
    await page.click('button.data-btn:has-text("全リセット")');
    const n0 = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('himq_v8_q') || '{}')).length);
    assert(n0 === 0, 'reset');
    await page.setInputFiles('#import-file', exported.path);
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('himq_v8_q') || '{}')).length > 0);
  });
  await check('旧版の書き出しファイルを取り込むと移行', async () => {
    const p = path.join(os.tmpdir(), `himq-v2-${Date.now()}.json`);
    fs.writeFileSync(p, JSON.stringify({ himq_wrong: JSON.stringify([{ chId: 10, qIdx: 1 }]), himq_bookmarks: '[]', _version: 'him-quiz-v2' }));
    await page.setInputFiles('#import-file', p);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('himq_v8_meta') || '{}').migratedFrom === 'v2' && localStorage.getItem('himq_v8_q'));
  });
  await check('バックアップから復元', async () => {
    await page.click('button.data-btn:has-text("バックアップから復元")'); await page.click('.modal-opt >> nth=0');
    await page.waitForSelector('.tiles');
  });
  await check('JavaScript エラーなし', async () => { assert(errors.length === 0, errors.join(' | ')); });
  await page.screenshot({ path: path.join(os.tmpdir(), `himq-${deviceName.replace(/\W+/g, '_')}.png`) });
  await browser.close();
}

let wk = null;
try { const b = await webkit.launch(); await b.close(); wk = webkit; } catch (e) { /* WebKit 未導入 */ }
await run(wk || chromium, wk ? 'iPhone 13 (WebKit)' : 'iPhone 13 (Chromium emulation)', devices['iPhone 13']);
await run(chromium, 'Desktop 1280x800', { viewport: { width: 1280, height: 800 } });
server.close();
const ng = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' — ' + r.err}`);
console.log(`\n${results.length - ng.length}/${results.length} passed`);
process.exit(ng.length ? 1 : 0);
