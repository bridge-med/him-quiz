/* HIM Quiz v8 — 画面。ロジックは js/core.js（HQCore）、問題は data/bank.js（HIMQ_BANK）。 */
(function () {
  'use strict';
  var C = window.HQCore, BANK = window.HIMQ_BANK;
  var app = document.getElementById('app');
  var bnav = document.getElementById('bottomNav'), prevBtn = document.getElementById('prevBtn'), nextBtn = document.getElementById('nextBtn'), navCenter = document.getElementById('navCenter');

  // ---------- 保存先（プライベートブラウズ等で使えないときはメモリ） ----------
  var storageOk = true, ls;
  try { ls = window.localStorage; ls.setItem('himq__probe', '1'); ls.removeItem('himq__probe'); } catch (e) { storageOk = false; }
  if (!storageOk) {
    var mem = {};
    ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; }, key: function (i) { return Object.keys(mem)[i] || null; }, get length() { return Object.keys(mem).length; } };
  }
  var store = new C.Store(ls);
  var migration = C.migrate(store, BANK);
  var S = new C.State(store, BANK);

  var SUBJ = {}; BANK.subjects.forEach(function (s) { SUBJ[s.id] = s; });
  var CASES = {}; (BANK.cases || []).forEach(function (c) { CASES[c.id] = c; });
  var BY = S.byId;
  var PRO = C.proQuestions(BANK);
  var LABELS = ['A', 'B', 'C', 'D', 'E'];
  var FORMAT = BANK.formats || {}, DIFF = BANK.difficulties || {};

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(x) { return x === null || x === undefined ? '—' : Math.round(x * 100) + '%'; }
  function subjLabel(s) { return s.course === '専門' ? '第' + s.no + '科目' : '基礎課程'; }
  function qsOf(filter) { return BANK.questions.filter(filter); }
  function saveSession() { if (state && state.screen === 'quiz' || state && state.screen === 'exam') store.set(C.KEYS.session, { mode: state.mode, title: state.title, ids: state.ids, idx: state.idx, answers: state.answers, conf: state.conf, exam: state.exam || null, at: Date.now() }); }
  function clearSession() { store.remove(C.KEYS.session); }
  function warnIfNotSaved() { if (!store.ok) banner('学習データを端末に保存できませんでした（容量不足またはプライベートブラウズ）。エクスポートで控えを取ってください。'); }
  var bannerMsg = null;
  function banner(m) { bannerMsg = m; }

  var state = { screen: 'home' };
  window.addEventListener('beforeunload', function () { saveSession(); });

  // ================= ホーム =================
  function renderHome() {
    stopTimer();
    state = { screen: 'home' };
    bnav.classList.add('hidden');
    var now = Date.now();
    var st = S.stats(PRO, now);
    var recent = S.recentAccuracy(50);
    var plan = S.plan(PRO, now);
    var wrongN = S.wrongList(BANK.questions).length;
    var bmN = S.bm.filter(function (id) { return BY[id]; }).length;
    var h = '<h1>診療情報管理士 模擬問題集</h1>';
    h += '<div class="subtitle">通信教育 専門課程 科目試験対策 ・ 検証済み ' + PRO.length + '問' + (BANK.questions.length > PRO.length ? '（ほか基礎課程の参考 ' + (BANK.questions.length - PRO.length) + '問）' : '') + '</div>';
    if (!storageOk) h += '<div class="banner warn">この端末では学習データを保存できません（プライベートブラウズ等）。閉じると記録は消えます。</div>';
    if (bannerMsg) { h += '<div class="banner warn">' + esc(bannerMsg) + '</div>'; bannerMsg = null; }
    if (migration.migrated && S.meta && S.meta.report && !S.meta.reportSeen) {
      var rp = S.meta.report;
      h += '<div class="banner">旧版の学習データを引き継ぎました。間違えた問題 ' + rp.wrong.mapped + '件・ブックマーク ' + rp.bookmarks.mapped + '件を新しい問題IDに移しました' + (rp.wrong.inactive + rp.bookmarks.inactive ? '（監査で公開を止めた問題 ' + (rp.wrong.inactive + rp.bookmarks.inactive) + '件は除外）' : '') + '。移行前のデータは「バックアップから復元」で戻せます。 <button class="link-btn" onclick="HQ.dismissReport()">閉じる</button></div>';
    }
    var sess = store.get(C.KEYS.session, null);
    if (sess && sess.ids && sess.ids.length && Date.now() - (sess.at || 0) < 3 * C.DAY) {
      h += '<div class="banner">前回の続き: ' + esc(sess.title) + '（' + (Object.keys(sess.answers || {}).length) + '/' + sess.ids.length + '問）<span class="banner-actions"><button class="link-btn" onclick="HQ.resume()">再開</button><button class="link-btn" onclick="HQ.discardSession()">破棄</button></span></div>';
    }
    // ダッシュボード
    h += '<div class="tiles">';
    h += tile(st.total, '総問題数', '専門課程');
    h += tile(st.seen, '演習済み', '網羅率 ' + pct(st.coverage));
    h += tile(st.unseen, '未演習', '');
    h += tile(st.mastered, '習熟済み', '習熟率 ' + pct(st.masteryRate));
    h += tile(st.due, '復習対象', '誤答リスト ' + st.review);
    h += tile(pct(st.firstAcc), '初回正答率', '');
    h += tile(recent ? pct(recent.acc) : '—', '直近正答率', recent ? '直近' + recent.n + '問' : '');
    h += tile(pct(st.cumAcc), '累積正答率', st.n + '回解答');
    h += '</div>';
    // 試験日と1日の目安
    h += '<div class="plan-row"><label>試験日 <input type="date" id="examDate" value="' + esc(plan.examDate || '') + '" onchange="HQ.setExamDate(this.value)"></label>';
    if (plan.days !== null && plan.days > 0) h += '<span class="plan-text">あと<strong>' + plan.days + '日</strong> ・ 未習得 ' + plan.unmastered + '問 → 1日あたり<strong>' + plan.perDay + '問</strong>＋今日の復習 ' + plan.due + '問</span>';
    else if (plan.days !== null) h += '<span class="plan-text">試験日を過ぎています。新しい日付を入れると計画を出します。</span>';
    else h += '<span class="plan-text">試験日を入れると、未習得の問題数から1日の目安を出します。</span>';
    h += '</div>';
    var todayN = Math.max(5, Math.min(40, (plan.perDay || 10) + Math.min(plan.due, 20)));
    h += '<div class="top-actions">';
    h += '<button class="btn btn-primary" onclick="HQ.startToday(' + todayN + ')">今日の学習を始める（' + todayN + '問）</button>';
    h += '<div class="seg"><span class="seg-label">スキマ時間</span><button class="seg-btn" onclick="HQ.startSkima(5)">5問</button><button class="seg-btn" onclick="HQ.startSkima(10)">10問</button><button class="seg-btn" onclick="HQ.startSkima(20)">20問</button></div>';
    var weak = S.weakSubtopics(BANK.questions, 3);
    h += '<button class="btn btn-secondary" onclick="HQ.startWeak()">弱点集中' + (weak.length ? '<span class="btn-sub">' + weak.map(function (m) { return esc(m.subtopic); }).join(' / ') + '</span>' : '<span class="btn-sub">サブトピックごとに3問以上解くと判定します</span>') + '</button>';
    h += '<button class="btn btn-accent" onclick="HQ.examMenu()">模擬試験</button>';
    h += '<div class="two-col"><button class="btn btn-secondary" onclick="HQ.startWrong()">誤答の復習' + (wrongN ? '<span class="badge">' + wrongN + '</span>' : '') + '</button>';
    h += '<button class="btn btn-secondary" onclick="HQ.startBookmarks()">ブックマーク' + (bmN ? '<span class="badge">' + bmN + '</span>' : '') + '</button></div>';
    h += '<button class="btn btn-secondary" onclick="HQ.startRandom()">全科目ランダム</button>';
    h += '</div>';
    // 科目
    h += '<h2 class="sec-h">専門課程 12科目</h2><div class="chapter-grid">';
    BANK.subjects.filter(function (s) { return s.course === '専門'; }).forEach(function (s) { h += subjectCard(s); });
    h += '</div>';
    var basics = BANK.subjects.filter(function (s) { return s.course !== '専門' && BANK.questions.some(function (q) { return q.subject === s.id; }); });
    if (basics.length) {
      h += '<h2 class="sec-h">基礎課程（参考）</h2><div class="chapter-grid">';
      basics.forEach(function (s) { h += subjectCard(s); });
      h += '</div>';
    }
    // 記録
    h += '<details class="record"><summary>学習の記録（模試の推移・弱点）</summary>' + recordHtml() + '</details>';
    // データ
    h += '<div class="data-area"><h4>学習データの管理</h4><div class="data-btns">';
    h += '<button class="data-btn" onclick="HQ.exportData()">エクスポート</button>';
    h += '<button class="data-btn" onclick="document.getElementById(\'import-file\').click()">インポート</button>';
    h += '<input type="file" id="import-file" class="import-input" accept=".json,application/json" onchange="HQ.importData(event)">';
    h += '<button class="data-btn" onclick="HQ.restoreMenu()">バックアップから復元</button>';
    h += '<button class="data-btn danger" onclick="HQ.resetAll()">全リセット</button>';
    h += '</div><p class="data-note">記録はこの端末のブラウザにだけ保存されます。機種変更の前にエクスポートしてください。旧版の書き出しファイルも取り込めます。</p></div>';
    h += '<p class="disclaimer">本アプリは日本病院会の公式教材・公式サービスではありません。問題は公開されている法令・厚生労働省等の資料をもとに作成したオリジナル問題で、各問に根拠資料と基準時点を示しています。試験の正式な情報は受講生サイト等の公式情報を確認してください。問題バンク ' + esc(BANK.version) + '</p>';
    app.innerHTML = h;
    warnIfNotSaved();
  }
  function tile(num, label, sub) { return '<div class="tile"><div class="tile-num">' + esc(num) + '</div><div class="tile-label">' + esc(label) + '</div>' + (sub ? '<div class="tile-sub">' + esc(sub) + '</div>' : '') + '</div>'; }
  function subjectCard(s) {
    var qs = qsOf(function (q) { return q.subject === s.id; });
    var st = S.stats(qs);
    if (!qs.length) return '<div class="ch-card empty" aria-disabled="true"><div class="ch-num">' + esc(subjLabel(s)) + '</div><div class="ch-name">' + esc(s.short) + '</div><div class="ch-score">検証済みの問題を準備中</div></div>';
    return '<div class="ch-card" role="button" tabindex="0" onclick="HQ.openSubject(\'' + s.id + '\')"><div class="ch-num">' + esc(subjLabel(s)) + '</div><div class="ch-name">' + esc(s.short) + '</div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + Math.round(st.masteryRate * 100) + '%"></div></div>' +
      '<div class="ch-score">習熟 ' + st.mastered + '/' + st.total + ' ・ 正答率 ' + pct(st.cumAcc) + '</div></div>';
  }
  function recordHtml() {
    var h = '';
    var ex = S.exams.slice(-10);
    h += '<div class="rec-sec"><div class="rec-h">模擬試験の推移</div>';
    if (!ex.length) h += '<p class="muted">まだ模擬試験の記録はありません。</p>';
    else {
      h += sparkline(ex.map(function (e) { return e.pct; }));
      h += '<ul class="hist">' + ex.slice().reverse().map(function (e) { var d = new Date(e.at); return '<li><span>' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + esc(e.title) + '</span><strong>' + e.pct + '%</strong><span class="muted">' + e.correct + '/' + e.total + '</span></li>'; }).join('') + '</ul>';
    }
    h += '</div>';
    var weak = S.weakSubtopics(BANK.questions, 5);
    h += '<div class="rec-sec"><div class="rec-h">弱点のサブトピック（直近3回の正誤）</div>';
    if (!weak.length) h += '<p class="muted">サブトピックごとに3問以上解くと表示します。</p>';
    else h += '<ul class="hist">' + weak.map(function (m) { return '<li><span>' + esc(SUBJ[m.subject].short) + ' ／ ' + esc(m.subtopic) + '</span><strong>' + pct(m.recentAcc) + '</strong><button class="link-btn" onclick="HQ.startSubtopic(\'' + m.subject + '\',' + JSON.stringify(m.subtopic).replace(/"/g, '&quot;') + ')">演習</button></li>'; }).join('') + '</ul>';
    h += '</div>';
    if (S.legacy && S.legacy.chapters && Object.keys(S.legacy.chapters).length) {
      h += '<div class="rec-sec"><div class="rec-h">旧版（全12章版）の章別記録</div><ul class="hist">';
      Object.keys(S.legacy.chapters).forEach(function (k) { var c = S.legacy.chapters[k]; h += '<li><span>旧第' + esc(k) + '章 ' + esc((S.legacy.chapterNames || {})[k] || '') + '</span><strong>' + (c.total ? Math.round(c.correct / c.total * 100) + '%' : '—') + '</strong><span class="muted">' + c.correct + '/' + c.total + '</span></li>'; });
      h += '</ul><p class="muted">旧版の章別スコアは問題単位に分けられないため、参考として残しています。</p></div>';
    }
    return h;
  }
  function sparkline(vals) {
    var w = 280, hgt = 56, n = vals.length;
    if (n < 2) return '';
    var pts = vals.map(function (v, i) { return (i * (w - 8) / (n - 1) + 4).toFixed(1) + ',' + (hgt - 4 - v / 100 * (hgt - 8)).toFixed(1); }).join(' ');
    var y60 = (hgt - 4 - 0.6 * (hgt - 8)).toFixed(1);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + hgt + '" role="img" aria-label="模擬試験の得点の推移"><line x1="0" x2="' + w + '" y1="' + y60 + '" y2="' + y60 + '" class="spark-60"/><polyline points="' + pts + '" class="spark-line"/></svg>';
  }

  // ================= 科目の画面 =================
  function openSubject(sid) {
    var s = SUBJ[sid]; if (!s) return;
    state = { screen: 'subject', subject: sid };
    bnav.classList.add('hidden');
    var qs = qsOf(function (q) { return q.subject === sid; });
    var st = S.stats(qs), recent = S.recentAccuracy(30, idSet(qs));
    var h = '<div class="quiz-header"><button class="back-btn" aria-label="ホームへ" onclick="HQ.home()">←</button><span class="quiz-title">' + esc(subjLabel(s)) + ' ' + esc(s.name) + '</span></div>';
    h += '<div class="tiles tiles-3">' + tile(st.total, '問題数', '') + tile(st.mastered, '習熟', pct(st.masteryRate)) + tile(pct(st.cumAcc), '累積正答率', recent ? '直近 ' + pct(recent.acc) : '') + '</div>';
    h += '<div class="top-actions">';
    h += '<button class="btn btn-primary" onclick="HQ.startSubject(\'' + sid + '\')">この科目を演習</button>';
    h += '<div class="two-col"><button class="btn btn-secondary" onclick="HQ.startSubjectSmart(\'' + sid + '\')">未演習・復習から10問</button>';
    if (s.course === '専門') h += '<button class="btn btn-accent" onclick="HQ.startExam(\'subject\',\'' + sid + '\')">科目別模擬試験</button>';
    h += '</div></div>';
    h += '<h2 class="sec-h">サブトピック別</h2><div class="sub-list">';
    var subs = S.subtopicStats(qs);
    s.subtopics.forEach(function (name) {
      var m = subs.filter(function (x) { return x.subtopic === name; })[0];
      if (!m) return;
      h += '<button class="sub-row" onclick="HQ.startSubtopic(\'' + sid + '\',' + JSON.stringify(name).replace(/"/g, '&quot;') + ')"><span class="sub-name">' + esc(name) + '</span>' +
        '<span class="progress-track"><span class="progress-fill" style="width:' + Math.round(m.mastered / m.total * 100) + '%"></span></span>' +
        '<span class="sub-meta">' + m.total + '問 ・ 習熟 ' + m.mastered + ' ・ 直近 ' + pct(m.recentAcc) + '</span></button>';
    });
    h += '</div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }
  function idSet(qs) { var o = {}; qs.forEach(function (q) { o[q.id] = 1; }); return o; }

  // ================= 出題数の選択 =================
  var pendingAction = null;
  function showCountModal(title, maxQ, callback, opts) {
    pendingAction = callback;
    var list = (opts && opts.options) || [10, 20, 30];
    var h = '<div class="modal-overlay" onclick="HQ.closeModal(event)"><div class="modal" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3>';
    h += '<div class="modal-sub">出題数を選んでください（全' + maxQ + '問）</div><div class="modal-options">';
    list.forEach(function (n) { if (n < maxQ) h += '<button class="modal-opt" onclick="HQ.confirmCount(' + n + ')"><span class="opt-num">' + n + '問</span> <span class="opt-desc">未演習と復習を優先</span></button>'; });
    h += '<button class="modal-opt" onclick="HQ.confirmCount(' + maxQ + ')"><span class="opt-num">全' + maxQ + '問</span> <span class="opt-desc">全問チャレンジ</span></button>';
    h += '</div><button class="modal-cancel" onclick="HQ.closeModal()">キャンセル</button></div></div>';
    var div = document.createElement('div'); div.id = 'modal-root'; div.innerHTML = h; document.body.appendChild(div);
  }
  function closeModal(e) { if (e && e.target !== e.currentTarget) return; var m = document.getElementById('modal-root'); if (m) m.remove(); pendingAction = null; }
  function confirmCount(n) { var cb = pendingAction; closeModal(); if (cb) cb(n); }

  // ================= 演習の開始 =================
  function startPractice(mode, title, ids) {
    if (!ids.length) { alert('出題できる問題がありません。'); return; }
    state = { screen: 'quiz', mode: mode, title: title, ids: ids, idx: 0, answers: {}, conf: {}, snap: {}, startedAt: Date.now() };
    saveSession(); renderQuiz();
  }
  function prioritized(qs, n) { return S.smartSession(qs, n); }
  function startSubject(sid) {
    var qs = qsOf(function (q) { return q.subject === sid; });
    showCountModal(subjLabel(SUBJ[sid]) + ' ' + SUBJ[sid].short, qs.length, function (n) {
      var ids = n >= qs.length ? C.shuffle(qs).map(function (q) { return q.id; }) : prioritized(qs, n);
      startPractice('subject', SUBJ[sid].short, ids);
    });
  }
  function startSubjectSmart(sid) { var qs = qsOf(function (q) { return q.subject === sid; }); startPractice('smart', SUBJ[sid].short + '（未演習・復習）', prioritized(qs, 10)); }
  function startSubtopic(sid, name) {
    var qs = qsOf(function (q) { return q.subject === sid && q.subtopic === name; });
    showCountModal(name, qs.length, function (n) { startPractice('subtopic', name, n >= qs.length ? C.shuffle(qs).map(function (q) { return q.id; }) : prioritized(qs, n)); }, { options: [5, 10, 20] });
  }
  function startRandom() {
    showCountModal('全科目ランダム', PRO.length, function (n) { startPractice('random', '全科目ランダム', C.shuffle(PRO).slice(0, n).map(function (q) { return q.id; })); });
  }
  function startToday(n) { startPractice('today', '今日の学習', S.smartSession(PRO, n)); }
  function startSkima(n) { startPractice('skima', 'スキマ時間 ' + n + '問', S.smartSession(PRO, n)); }
  function startWeak() {
    var r = S.weakSession(BANK.questions, 15);
    if (!r.ids.length) { alert('まだ弱点を判定できるほどの解答がありません。サブトピックごとに3問以上解くと、正答率の低いサブトピックと、その未演習の類題を集中して出題します。'); return; }
    startPractice('weak', '弱点集中', r.ids);
  }
  function startWrong() {
    var ids = S.wrongList(BANK.questions);
    if (!ids.length) { alert('誤答の復習対象はありません。'); return; }
    startPractice('wrong', '誤答の復習', ids);
  }
  function startBookmarks() {
    var ids = S.bm.filter(function (id) { return BY[id]; });
    if (!ids.length) { alert('ブックマークはありません。'); return; }
    startPractice('bookmark', 'ブックマーク', ids);
  }
  function startRelated(id) {
    var q = BY[id]; if (!q) return;
    var ids = (q.related || []).filter(function (x) { return BY[x] && !C.isMastered(S.rec(x)); });
    if (!ids.length) ids = (q.related || []).filter(function (x) { return BY[x]; });
    if (!ids.length) return;
    startPractice('related', '類題', ids.slice(0, 10));
  }

  // ================= 演習画面 =================
  function caseHtml(q, open) {
    if (!q.caseId || !CASES[q.caseId]) return '';
    var c = CASES[q.caseId];
    return '<details class="case-panel"' + (open ? ' open' : '') + '><summary>退院時要約（架空症例）' + (c.title ? '：' + esc(c.title) : '') + '</summary><div class="case-text">' + esc(c.text) + '</div></details>';
  }
  function metaHtml(q) {
    var s = SUBJ[q.subject];
    return '<div class="meta-chips"><span class="chip">' + esc(s ? s.short : q.subject) + '</span><span class="chip">' + esc(q.subtopic) + '</span><span class="chip">' + esc(DIFF[q.difficulty] || '') + '</span>' +
      (q.format && q.format !== 'knowledge' ? '<span class="chip">' + esc(FORMAT[q.format] || q.format) + '</span>' : '') + '<span class="chip">' + q.choices.length + '択</span></div>';
  }
  function explanationHtml(q) {
    var e = q.explanation || {};
    var h = '<div class="explanation show"><div class="expl-section"><div class="expl-label green">○ 正解 ' + LABELS[q.answer] + ' の解説</div>' + esc(e.correct) + '</div>';
    h += '<div class="expl-section"><div class="expl-label red">✗ ほかの選択肢</div>';
    q.choices.forEach(function (c, i) { if (i !== q.answer && e.choiceNotes && e.choiceNotes[i]) h += '<div class="expl-wrong-item"><strong>' + LABELS[i] + '.</strong> ' + esc(e.choiceNotes[i]) + '</div>'; });
    h += '</div>';
    if (e.point) h += '<div class="expl-section"><div class="expl-label blue">☆ 覚えるポイント</div>' + esc(e.point) + '</div>';
    if (q.sources && q.sources.length) {
      h += '<div class="expl-section src"><div class="expl-label">根拠資料</div><ul class="src-list">' + q.sources.map(function (s) {
        return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>' + (s.locator ? ' ' + esc(s.locator) : '') + '</li>';
      }).join('') + '</ul><div class="asof">基準時点: ' + esc(q.asOf) + ' ・ 問題ID ' + esc(q.id) + '</div></div>';
    }
    h += '</div>';
    return h;
  }
  function renderQuiz() {
    state.screen = 'quiz';
    bnav.classList.remove('hidden');
    var total = state.ids.length, id = state.ids[state.idx], q = BY[id];
    if (!q) { state.ids.splice(state.idx, 1); if (!state.ids.length) return renderHome(); state.idx = Math.min(state.idx, state.ids.length - 1); return renderQuiz(); }
    var ans = state.answers[id], answered = ans !== undefined, ok = answered && ans === q.answer;
    var isBm = S.bm.indexOf(id) >= 0;
    var back = state.mode === 'review' ? '<button class="back-btn" aria-label="結果に戻る" onclick="HQ.backToResults()">←</button>' : '<button class="back-btn" aria-label="ホームへ" onclick="HQ.home()">←</button>';
    var h = '<div class="quiz-header">' + back + '<span class="quiz-title">' + esc(state.title) + '</span><span class="q-counter">' + (state.idx + 1) + ' / ' + total + '</span></div>';
    h += '<div class="progress-bar-wrap"><div class="progress-track"><div class="progress-fill" style="width:' + Math.round((state.idx + 1) / total * 100) + '%"></div></div></div>';
    var prevQ = state.idx > 0 ? BY[state.ids[state.idx - 1]] : null;
    h += caseHtml(q, !prevQ || prevQ.caseId !== q.caseId);
    h += '<div class="q-card fade-in' + (answered ? (ok ? ' correct' : ' wrong') : '') + '">';
    h += '<button class="bookmark-btn' + (isBm ? ' active' : '') + '" aria-label="ブックマーク" onclick="HQ.toggleBookmark(\'' + id + '\')">' + (isBm ? '★' : '☆') + '</button>';
    h += metaHtml(q);
    h += '<div class="q-text">Q' + (state.idx + 1) + '. ' + esc(q.question) + '</div><div class="choices">';
    q.choices.forEach(function (c, i) {
      var cls = 'choice-btn';
      if (answered) { if (i === q.answer) cls += ' correct-choice'; else if (i === ans) cls += ' wrong-choice'; }
      h += '<button class="' + cls + '"' + (answered ? ' disabled' : '') + ' onclick="HQ.select(' + i + ')"><span class="result-icon">' + (answered && i === q.answer ? '✓' : answered && i === ans ? '✗' : LABELS[i] + '.') + '</span> ' + esc(c) + '</button>';
    });
    h += '</div>';
    if (answered) {
      h += '<div class="answer-line ' + (ok ? 'ok' : 'ng') + '">' + (ok ? '正解' : '不正解（正解は ' + LABELS[q.answer] + '）') + '</div>';
      if (state.mode !== 'review') {
        var cf = state.conf[id] || '';
        h += '<div class="conf-row" role="group" aria-label="解答の自信（任意）"><span class="conf-label">自信</span>' +
          ['s', 'u', 'g'].map(function (k) { return '<button class="conf-btn' + (cf === k ? ' on' : '') + '" aria-pressed="' + (cf === k) + '" onclick="HQ.setConf(\'' + k + '\')">' + C.CONF[k] + '</button>'; }).join('') + '<span class="conf-hint">任意</span></div>';
      }
      h += explanationHtml(q);
      var rel = (q.related || []).filter(function (x) { return BY[x]; });
      if (rel.length && state.mode !== 'related' && state.mode !== 'review') h += '<button class="link-btn rel-btn" onclick="HQ.startRelated(\'' + id + '\')">類題を解く（' + rel.length + '問）</button>';
    }
    h += '</div>';
    app.innerHTML = h;
    prevBtn.disabled = state.idx === 0;
    var last = state.idx === total - 1;
    nextBtn.textContent = last && answered ? (state.mode === 'review' ? '結果に戻る' : '結果を見る') : '次へ →';
    nextBtn.disabled = !answered;
    navCenter.textContent = (state.idx + 1) + ' / ' + total;
  }
  function select(i) {
    if (state.screen === 'exam') return examSelect(i);
    var id = state.ids[state.idx], q = BY[id];
    if (state.answers[id] !== undefined) return;
    state.answers[id] = i;
    var ok = i === q.answer;
    var r = S.answer(id, ok, { mode: state.mode });
    state.snap[id] = { before: r.before, ts: r.ts, ok: ok };
    if (!store.ok) warnIfNotSaved();
    saveSession(); renderQuiz();
  }
  function setConf(k) {
    var id = state.ids[state.idx], sn = state.snap[id];
    if (!sn) return;
    var cur = state.conf[id];
    var next = cur === k ? '' : k;
    state.conf[id] = next;
    S.setConfidence(id, sn.before, sn.ok, next, sn.ts, state.mode);
    saveSession(); renderQuiz();
  }
  function toggleBookmark(id) { S.toggleBookmark(id); if (state.screen === 'exam') renderExam(); else renderQuiz(); }
  function goPrev() { if (state.idx > 0) { state.idx--; state.screen === 'exam' ? renderExam() : renderQuiz(); window.scrollTo(0, 0); } }
  function goNext() {
    if (state.screen === 'exam') { if (state.idx < state.ids.length - 1) { state.idx++; renderExam(); window.scrollTo(0, 0); } else examPalette(); return; }
    if (state.idx < state.ids.length - 1) { state.idx++; saveSession(); renderQuiz(); window.scrollTo(0, 0); }
    else if (state.mode === 'review') { renderExamResults(state.result); }
    else renderResults();
  }
  function renderResults() {
    clearSession();
    bnav.classList.add('hidden');
    var total = state.ids.length, correct = 0, wrong = [];
    state.ids.forEach(function (id, i) { var q = BY[id], a = state.answers[id]; if (a === q.answer) correct++; else wrong.push({ i: i, q: q, a: a }); });
    var h = '<div class="quiz-header"><button class="back-btn" aria-label="ホームへ" onclick="HQ.home()">←</button><span class="quiz-title">結果 ・ ' + esc(state.title) + '</span></div>';
    h += '<div class="result-card"><div class="result-score">' + correct + ' / ' + total + '</div><div class="result-label">正答率 ' + Math.round(correct / total * 100) + '%</div></div>';
    if (wrong.length) {
      h += '<div class="result-card left"><div class="rc-h">間違えた・未解答の問題（' + wrong.length + '問）</div>';
      wrong.forEach(function (w) { h += '<div class="result-list-item"><div class="rl-q">Q' + (w.i + 1) + '. ' + esc(w.q.question) + '</div><div class="rl-ng">✗ ' + (w.a === undefined ? '未解答' : esc(w.q.choices[w.a])) + '</div><div class="rl-ok">○ ' + esc(w.q.choices[w.q.answer]) + '</div></div>'; });
      h += '</div>';
    }
    h += '<button class="btn btn-primary" onclick="HQ.home()">ホームに戻る</button>';
    app.innerHTML = h; window.scrollTo(0, 0);
  }

  // ================= 模擬試験 =================
  var timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function examMenu() {
    var h = '<div class="modal-overlay" onclick="HQ.closeModal(event)"><div class="modal" role="dialog" aria-modal="true"><h3>模擬試験</h3>';
    h += '<div class="modal-sub">本アプリ独自の形式です。科目試験の公式な出題数・時間は公開資料で確認できないため、合格基準（各科目100点満点で60点以上）だけを目安に表示します。試験中は正誤と解説を表示しません。</div><div class="modal-options">';
    h += '<button class="modal-opt" onclick="HQ.startExam(\'full\')"><span class="opt-num">全範囲 50問 ・ 60分</span> <span class="opt-desc">専門課程12科目から配分</span></button>';
    h += '<button class="modal-opt" onclick="HQ.subjectExamMenu()"><span class="opt-num">科目別 20問 ・ 25分</span> <span class="opt-desc">科目を選ぶ</span></button>';
    h += '<button class="modal-opt" onclick="HQ.startExam(\'icd\')"><span class="opt-num">ICD-10集中 30問 ・ 40分</span> <span class="opt-desc">国際統計分類Ⅰ・Ⅱ</span></button>';
    h += '<button class="modal-opt" onclick="HQ.startExam(\'summary\')"><span class="opt-num">退院時要約集中 約16問 ・ 30分</span> <span class="opt-desc">架空症例の読み取り</span></button>';
    h += '</div><button class="modal-cancel" onclick="HQ.closeModal()">キャンセル</button></div></div>';
    closeModal(); var div = document.createElement('div'); div.id = 'modal-root'; div.innerHTML = h; document.body.appendChild(div);
  }
  function subjectExamMenu() {
    var h = '<div class="modal-overlay" onclick="HQ.closeModal(event)"><div class="modal" role="dialog" aria-modal="true"><h3>科目別模擬試験</h3><div class="modal-sub">20問・25分（独自形式）</div><div class="modal-options scroll">';
    BANK.subjects.filter(function (s) { return s.course === '専門'; }).forEach(function (s) { h += '<button class="modal-opt" onclick="HQ.startExam(\'subject\',\'' + s.id + '\')"><span class="opt-num">' + esc(subjLabel(s)) + '</span> <span class="opt-desc">' + esc(s.short) + '</span></button>'; });
    h += '</div><button class="modal-cancel" onclick="HQ.closeModal()">キャンセル</button></div></div>';
    closeModal(); var div = document.createElement('div'); div.id = 'modal-root'; div.innerHTML = h; document.body.appendChild(div);
  }
  function startExam(type, sid) {
    closeModal();
    var ex = C.buildExam(BANK, type, { subject: sid });
    if (!ex.ids.length) { alert('この模擬試験に出題できる問題がまだありません。'); return; }
    var title = ex.title + (sid ? '（' + SUBJ[sid].short + '）' : '');
    state = { screen: 'exam', mode: 'exam', title: title, ids: ex.ids, idx: 0, answers: {}, conf: {}, exam: { type: type, subject: sid || null, startedAt: Date.now(), minutes: ex.minutes, flags: {} } };
    saveSession(); startTimer(); renderExam();
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(function () {
      if (state.screen !== 'exam') return stopTimer();
      var rem = remaining();
      var el = document.getElementById('exam-timer');
      if (el) { el.textContent = fmtTime(rem); if (rem < 300) el.classList.add('low'); }
      if (rem <= 0) { stopTimer(); finishExam(true); }
    }, 1000);
  }
  function remaining() { return Math.max(0, Math.round((state.exam.startedAt + state.exam.minutes * 60000 - Date.now()) / 1000)); }
  function fmtTime(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function renderExam() {
    state.screen = 'exam';
    bnav.classList.remove('hidden');
    var total = state.ids.length, id = state.ids[state.idx], q = BY[id], ans = state.answers[id];
    var flagged = !!state.exam.flags[id];
    var h = '<div class="quiz-header"><button class="back-btn" aria-label="中断してホームへ" onclick="HQ.leaveExam()">←</button><span class="quiz-title">' + esc(state.title) + '</span><span id="exam-timer" class="exam-timer' + (remaining() < 300 ? ' low' : '') + '">' + fmtTime(remaining()) + '</span><button class="pal-open" onclick="HQ.examPalette()">一覧</button></div>';
    h += '<div class="progress-bar-wrap"><div class="progress-track"><div class="progress-fill" style="width:' + Math.round(Object.keys(state.answers).length / total * 100) + '%"></div></div></div>';
    var prevQ = state.idx > 0 ? BY[state.ids[state.idx - 1]] : null;
    h += caseHtml(q, !prevQ || prevQ.caseId !== q.caseId);
    h += '<div class="q-card exam fade-in">';
    h += '<button class="flag-btn' + (flagged ? ' on' : '') + '" aria-pressed="' + flagged + '" onclick="HQ.toggleFlag()">' + (flagged ? '見直し ✓' : '見直す') + '</button>';
    h += '<div class="q-text">Q' + (state.idx + 1) + '. ' + esc(q.question) + '</div><div class="choices">';
    q.choices.forEach(function (c, i) { h += '<button class="choice-btn' + (ans === i ? ' selected' : '') + '" aria-pressed="' + (ans === i) + '" onclick="HQ.select(' + i + ')"><span class="result-icon">' + LABELS[i] + '.</span> ' + esc(c) + '</button>'; });
    h += '</div></div>';
    h += '<p class="muted exam-note">選び直しできます。正誤と解説は終了後に表示します。</p>';
    app.innerHTML = h;
    prevBtn.disabled = state.idx === 0;
    nextBtn.disabled = false;
    nextBtn.textContent = state.idx === total - 1 ? '確認して終了' : '次へ →';
    navCenter.textContent = (state.idx + 1) + ' / ' + total;
  }
  function examSelect(i) { var id = state.ids[state.idx]; state.answers[id] = i; saveSession(); renderExam(); }
  function toggleFlag() { var id = state.ids[state.idx]; state.exam.flags[id] = !state.exam.flags[id]; saveSession(); renderExam(); }
  function examPalette() {
    var total = state.ids.length, un = 0, fl = 0;
    var h = '<div class="modal-overlay" onclick="HQ.closeModal(event)"><div class="modal wide" role="dialog" aria-modal="true"><h3>解答状況</h3><div class="palette">';
    state.ids.forEach(function (id, i) {
      var a = state.answers[id] !== undefined, f = !!state.exam.flags[id];
      if (!a) un++; if (f) fl++;
      h += '<button class="pal-btn' + (a ? ' ans' : '') + (f ? ' flag' : '') + (i === state.idx ? ' cur' : '') + '" onclick="HQ.jump(' + i + ')" aria-label="' + (i + 1) + '問目' + (a ? ' 解答済み' : ' 未解答') + (f ? ' 見直し' : '') + '">' + (i + 1) + '</button>';
    });
    h += '</div><div class="modal-sub">未解答 ' + un + '問 ・ 見直し ' + fl + '問 ・ 残り ' + fmtTime(remaining()) + '</div>';
    h += '<div class="modal-options"><button class="modal-opt primary" onclick="HQ.finishExam()">解答を終了して採点する</button></div>';
    h += '<button class="modal-cancel" onclick="HQ.closeModal()">試験に戻る</button></div></div>';
    closeModal(); var div = document.createElement('div'); div.id = 'modal-root'; div.innerHTML = h; document.body.appendChild(div);
  }
  function jump(i) { closeModal(); state.idx = i; renderExam(); window.scrollTo(0, 0); }
  function leaveExam() {
    if (!confirm('模擬試験を中断してホームに戻りますか？\n（途中の状態は保存され、ホームから再開できます。時間は進み続けます）')) return;
    saveSession(); stopTimer(); renderHome();
  }
  function finishExam(timeUp) {
    closeModal();
    if (!timeUp) {
      var un = state.ids.filter(function (id) { return state.answers[id] === undefined; }).length;
      if (!confirm((un ? '未解答が ' + un + '問あります。' : '') + '解答を終了して採点しますか？')) return;
    } else alert('時間切れです。採点します。');
    stopTimer();
    var res = C.scoreExam(BANK, state.ids, state.answers);
    var now = Date.now();
    res.at = now; res.title = state.title; res.type = state.exam.type; res.subject = state.exam.subject;
    res.dur = Math.round((now - state.exam.startedAt) / 1000);
    res.timeUp = !!timeUp;
    // 模擬試験の解答も学習履歴に記録（未解答は記録しない）
    state.ids.forEach(function (id) { var a = state.answers[id]; if (a !== undefined) S.answer(id, a === BY[id].answer, { mode: 'exam', ts: now }); });
    S.addExam(res);
    clearSession();
    renderExamResults(res);
  }
  function renderExamResults(res) {
    state = { screen: 'examResult', result: res };
    bnav.classList.add('hidden');
    var h = '<div class="quiz-header"><button class="back-btn" aria-label="ホームへ" onclick="HQ.home()">←</button><span class="quiz-title">' + esc(res.title) + ' 結果</span></div>';
    h += '<div class="result-card"><div class="result-score">' + res.correct + ' / ' + res.total + '</div><div class="result-label">正答率 ' + res.pct + '% ・ 所要 ' + fmtTime(res.dur) + (res.timeUp ? '（時間切れ）' : '') + '</div>';
    h += '<div class="pass ' + (res.pct >= 60 ? 'ok' : 'ng') + '">' + (res.pct >= 60 ? '60%以上（合格基準の目安を超えています）' : '60%未満（合格基準の目安に届いていません）') + '</div>';
    if (res.unanswered) h += '<div class="muted">未解答 ' + res.unanswered + '問</div>';
    h += '<p class="muted small">合格基準「各科目100点満点で60点以上」は公式情報。この模擬試験の出題数・時間・配分は本アプリ独自です。</p>';
    h += '<div class="subj-table">';
    Object.keys(res.perSubject).sort().forEach(function (sid) { var p = res.perSubject[sid], r = p[1] ? Math.round(p[0] / p[1] * 100) : 0; h += '<div class="st-row"><span>' + esc(SUBJ[sid] ? SUBJ[sid].short : sid) + '</span><strong class="' + (r >= 60 ? 'ok' : 'ng') + '">' + p[0] + '/' + p[1] + '（' + r + '%）</strong></div>'; });
    h += '</div></div>';
    h += '<div class="result-card left"><div class="rc-h">全問の見直し（タップで解説）</div>';
    res.items.forEach(function (it, i) {
      var q = BY[it[0]]; if (!q) return;
      h += '<button class="result-list-item btnlike" onclick="HQ.reviewExam(' + i + ')"><span class="mark ' + (it[2] ? 'ok' : 'ng') + '">' + (it[2] ? '○' : it[1] < 0 ? '−' : '✗') + '</span> Q' + (i + 1) + '. ' + esc(q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question) + '</button>';
    });
    h += '</div>';
    var wrongIds = res.items.filter(function (it) { return !it[2]; }).map(function (it) { return it[0]; });
    if (wrongIds.length) h += '<button class="btn btn-secondary" onclick="HQ.practiceIds(\'' + wrongIds.join(',') + '\')">間違えた問題を解き直す（' + wrongIds.length + '問）</button>';
    h += '<button class="btn btn-primary" onclick="HQ.home()" style="margin-top:10px">ホームに戻る</button>';
    app.innerHTML = h; window.scrollTo(0, 0);
  }
  function reviewExam(i) {
    var res = state.result;
    var ids = res.items.map(function (it) { return it[0]; }), answers = {};
    res.items.forEach(function (it) { if (it[1] >= 0) answers[it[0]] = it[1]; else answers[it[0]] = -1; });
    state = { screen: 'quiz', mode: 'review', title: '見直し', ids: ids, idx: i, answers: answers, conf: {}, snap: {}, result: res };
    renderQuiz(); window.scrollTo(0, 0);
  }

  // ================= 再開 =================
  function resume() {
    var s = store.get(C.KEYS.session, null); if (!s) return renderHome();
    state = { screen: s.exam ? 'exam' : 'quiz', mode: s.mode, title: s.title, ids: s.ids.filter(function (id) { return BY[id]; }), idx: Math.min(s.idx || 0, s.ids.length - 1), answers: s.answers || {}, conf: s.conf || {}, snap: {}, exam: s.exam };
    if (!state.ids.length) { clearSession(); return renderHome(); }
    if (state.exam) { if (remaining() <= 0) return finishExam(true); startTimer(); renderExam(); } else renderQuiz();
  }
  function discardSession() { clearSession(); renderHome(); }

  // ================= データ =================
  function exportData() {
    var data = C.exportData(store, BANK);
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'him-quiz-progress-' + C.dayKey(Date.now()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importData(ev) {
    var file = ev.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!confirm('現在の学習データを、このファイルの内容で置き換えます。（現在のデータは「バックアップから復元」で戻せます）')) return;
        var r = C.importData(store, BANK, data);
        S.load();
        banner('取り込みました（' + r.count + '件）' + (r.migrated ? '。旧版の形式だったため新しい問題IDに移しました' : '') + '。');
        renderHome();
      } catch (err) { alert('ファイルを読み込めませんでした: ' + err.message); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  }
  function restoreMenu() {
    var last = store.get(C.KEYS.backupLast, null), v7 = store.get(C.KEYS.backupV7, null);
    var h = '<div class="modal-overlay" onclick="HQ.closeModal(event)"><div class="modal" role="dialog" aria-modal="true"><h3>バックアップから復元</h3><div class="modal-sub">復元すると、現在のデータは「直前のバックアップ」として残ります。</div><div class="modal-options">';
    if (last) h += '<button class="modal-opt" onclick="HQ.restore(\'last\')"><span class="opt-num">直前のバックアップ</span> <span class="opt-desc">' + esc(new Date(last.at).toLocaleString()) + ' ・ ' + esc(last.reason) + '</span></button>';
    if (v7) h += '<button class="modal-opt" onclick="HQ.restore(\'v7\')"><span class="opt-num">旧版から移行する前のデータ</span> <span class="opt-desc">' + esc(new Date(v7.at).toLocaleString()) + '</span></button>';
    if (!last && !v7) h += '<p class="muted">バックアップはまだありません。</p>';
    h += '</div><button class="modal-cancel" onclick="HQ.closeModal()">閉じる</button></div></div>';
    closeModal(); var div = document.createElement('div'); div.id = 'modal-root'; div.innerHTML = h; document.body.appendChild(div);
  }
  function restore(which) {
    if (!confirm('バックアップの内容に戻しますか？')) return;
    closeModal();
    try {
      C.restoreBackup(store, which);
      if (which === 'v7') C.migrate(store, BANK); // 旧版の形式に戻したので、もう一度移行する
      S.load(); banner('バックアップから復元しました。'); renderHome();
    } catch (e) { alert(e.message); }
  }
  function resetAll() {
    if (!confirm('すべての学習データをリセットしますか？（直前の状態は「バックアップから復元」で戻せます）')) return;
    C.resetAll(store); S.load(); clearSession(); renderHome();
  }

  window.HQ = {
    home: renderHome, openSubject: openSubject, startSubject: startSubject, startSubjectSmart: startSubjectSmart, startSubtopic: startSubtopic,
    startRandom: startRandom, startToday: startToday, startSkima: startSkima, startWeak: startWeak, startWrong: startWrong, startBookmarks: startBookmarks,
    startRelated: startRelated, select: select, setConf: setConf, toggleBookmark: toggleBookmark, closeModal: closeModal, confirmCount: confirmCount,
    examMenu: examMenu, subjectExamMenu: subjectExamMenu, startExam: startExam, examPalette: examPalette, jump: jump, toggleFlag: toggleFlag,
    finishExam: function () { finishExam(false); }, leaveExam: leaveExam, reviewExam: reviewExam,
    backToResults: function () { if (state.result) renderExamResults(state.result); else renderHome(); },
    practiceIds: function (s) { startPractice('retry', '解き直し', s.split(',').filter(function (id) { return BY[id]; })); },
    resume: resume, discardSession: discardSession, exportData: exportData, importData: importData, restoreMenu: restoreMenu, restore: restore, resetAll: resetAll,
    setExamDate: function (v) { S.setExamDate(v); renderHome(); },
    dismissReport: function () { S.meta.reportSeen = true; store.set(C.KEYS.meta, S.meta); renderHome(); },
    _state: function () { return state; }, _S: S, _store: store,
  };
  window.goPrev = goPrev; window.goNext = goNext; // 既存の下部ナビの onclick
  // role="button" のカードをキーボードでも押せるように
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button') { e.preventDefault(); t.click(); }
  });
  renderHome();
})();
