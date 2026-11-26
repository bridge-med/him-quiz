/* HIM Quiz v8 — 学習ロジック（DOMを持たない）。ブラウザでは window.HQCore、Node では module.exports。
 * 保存はすべて localStorage（キー接頭辞 himq_）。問題は永続ID（bank の id）で記録する。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HQCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var INTERVALS = [0, 1, 3, 7, 14, 30]; // 箱（習熟段階）ごとの次回までの日数
  var MASTER_BOX = 2; // 2日以上に分けて正答し、連続正答2以上で「習熟」
  var LOG_MAX = 300;
  var K = {
    meta: 'himq_v8_meta', q: 'himq_v8_q', bm: 'himq_v8_bm', exams: 'himq_v8_exams', log: 'himq_v8_log',
    legacy: 'himq_v8_legacy', session: 'himq_v8_session', backupV7: 'himq_backup_v7', backupLast: 'himq_backup_last',
  };
  var CONF = { s: '自信あり', u: '迷った', g: '勘' };

  // ---------- 日付 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function parseDate(s) { // 'YYYY-MM-DD' をローカル日付の 0 時として読む
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // ---------- 保存 ----------
  function Store(ls) { this.ls = ls; this.ok = true; this.lastError = null; }
  Store.prototype.raw = function (k) { try { return this.ls.getItem(k); } catch (e) { return null; } };
  Store.prototype.get = function (k, d) {
    var v = this.raw(k);
    if (v === null || v === undefined) return d;
    try { return JSON.parse(v); } catch (e) { return d; }
  };
  Store.prototype.setRaw = function (k, v) {
    try { this.ls.setItem(k, v); return true; } catch (e) { this.ok = false; this.lastError = e; return false; }
  };
  Store.prototype.set = function (k, v) { return this.setRaw(k, JSON.stringify(v)); };
  Store.prototype.remove = function (k) { try { this.ls.removeItem(k); } catch (e) { /* noop */ } };
  Store.prototype.keys = function (prefix) {
    var out = [];
    try { for (var i = 0; i < this.ls.length; i++) { var k = this.ls.key(i); if (k && k.indexOf(prefix) === 0) out.push(k); } } catch (e) { /* noop */ }
    return out;
  };
  Store.prototype.snapshot = function (excludeBackups) {
    var data = {}, self = this;
    this.keys('himq_').forEach(function (k) {
      if (excludeBackups && k.indexOf('himq_backup_') === 0) return;
      data[k] = self.raw(k);
    });
    return data;
  };

  // ---------- 問題ごとの記録 ----------
  // n 解答回数 / c 正答 / w 誤答 / s 連続正答 / f 初回の正誤(1/0) / l 最終解答時刻 / cf 最終の自信(s,u,g,'')
  // b 習熟段階(0-5) / d 次回復習推奨時刻 / wf 誤答リストに載っている / cd 誤答後に正答した日(異なる日) / h 直近の履歴 / lw 旧版の誤答から移行
  function emptyRec() { return { n: 0, c: 0, w: 0, s: 0, b: 0, d: 0, wf: 0, cd: [], h: [] }; }
  function cloneRec(r) {
    var o = {}; r = r || emptyRec();
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = Array.isArray(r[k]) ? r[k].map(function (x) { return Array.isArray(x) ? x.slice() : x; }) : r[k];
    if (!o.cd) o.cd = []; if (!o.h) o.h = [];
    ['n', 'c', 'w', 's', 'b', 'd', 'wf'].forEach(function (k) { if (typeof o[k] !== 'number') o[k] = 0; });
    return o;
  }
  // 解答1回分の更新。conf: 's' 自信あり / 'u' 迷った / 'g' 勘 / '' 未入力
  function nextRec(prev, correct, conf, ts, mode) {
    var r = cloneRec(prev);
    var first = r.n === 0;
    var today = dayKey(ts);
    var sameDayAsLastCorrect = r.lc ? dayKey(r.lc) === today : false;
    r.n++;
    if (first) r.f = correct ? 1 : 0;
    conf = conf || '';
    if (correct) {
      r.c++; r.s++;
      if (conf === 'g') { // 勘で当たった: 覚えていない扱い。誤答リストに入れ、翌日に再出題
        r.b = Math.min(r.b, 1) || 1; r.d = ts + DAY; r.wf = 1; r.cd = [];
      } else {
        if (conf === 'u') { r.b = Math.max(1, r.b); r.d = ts + DAY; } // 迷った: 段階を上げない
        else { if (!sameDayAsLastCorrect || r.b === 0) r.b = Math.min(5, r.b + 1); r.d = ts + INTERVALS[r.b] * DAY; }
        if (r.wf) { // 誤答リストは「異なる2日に正答」するまで外さない
          if (r.cd.indexOf(today) < 0) r.cd.push(today);
          if (r.cd.length >= 2) { r.wf = 0; r.cd = []; r.lw = 0; }
        }
        r.lc = ts;
      }
    } else {
      r.w++; r.s = 0; r.b = 0; r.d = ts; r.wf = 1; r.cd = [];
    }
    r.l = ts; r.cf = conf;
    r.h.push([ts, correct ? 1 : 0, conf, mode || '']);
    if (r.h.length > 8) r.h = r.h.slice(-8);
    return r;
  }
  function isMastered(r) { return !!r && r.b >= MASTER_BOX && r.s >= 2 && !r.wf && r.cf !== 'g'; }
  function isDue(r, now) { return !!r && r.n > 0 && (r.wf === 1 || (!isMastered(r) && r.d <= now)); }
  function level(r) {
    if (!r || !r.n) return 'new';
    if (r.wf) return 'review';
    if (isMastered(r)) return 'mastered';
    return 'learning';
  }

  // ---------- 状態 ----------
  function State(store, bank) {
    this.st = store; this.bank = bank;
    this.byId = {};
    var self = this;
    (bank.questions || []).forEach(function (q) { self.byId[q.id] = q; });
    this.load();
  }
  State.prototype.load = function () {
    this.meta = this.st.get(K.meta, null);
    this.q = this.st.get(K.q, {}) || {};
    this.bm = this.st.get(K.bm, []) || [];
    this.exams = this.st.get(K.exams, []) || [];
    this.log = this.st.get(K.log, []) || [];
    this.legacy = this.st.get(K.legacy, null);
  };
  State.prototype.saveQ = function () { return this.st.set(K.q, this.q); };
  State.prototype.saveAll = function () {
    var ok = this.st.set(K.q, this.q);
    ok = this.st.set(K.bm, this.bm) && ok;
    ok = this.st.set(K.exams, this.exams) && ok;
    ok = this.st.set(K.log, this.log) && ok;
    if (this.meta) ok = this.st.set(K.meta, this.meta) && ok;
    return ok;
  };
  State.prototype.rec = function (id) { return this.q[id] || null; };

  // 解答を記録する。戻り値の before は自信度の付け直し用
  State.prototype.answer = function (id, correct, opts) {
    opts = opts || {};
    var ts = opts.ts || Date.now();
    var before = this.q[id] ? cloneRec(this.q[id]) : null;
    this.q[id] = nextRec(before, correct, opts.conf || '', ts, opts.mode || '');
    this.log.push([ts, id, correct ? 1 : 0, opts.conf || '', opts.mode || '']);
    if (this.log.length > LOG_MAX) this.log = this.log.slice(-LOG_MAX);
    this.st.set(K.q, this.q); this.st.set(K.log, this.log);
    return { before: before, after: this.q[id], ts: ts };
  };
  // 解答後に自信度を付けた（付け直した）とき: 解答前の記録から計算し直す
  State.prototype.setConfidence = function (id, before, correct, conf, ts, mode) {
    this.q[id] = nextRec(before, correct, conf, ts, mode);
    for (var i = this.log.length - 1; i >= 0; i--) { if (this.log[i][1] === id && this.log[i][0] === ts) { this.log[i][3] = conf; break; } }
    this.st.set(K.q, this.q); this.st.set(K.log, this.log);
    return this.q[id];
  };
  State.prototype.toggleBookmark = function (id) {
    var i = this.bm.indexOf(id);
    if (i >= 0) this.bm.splice(i, 1); else this.bm.push(id);
    this.st.set(K.bm, this.bm);
    return i < 0;
  };
  State.prototype.setExamDate = function (s) {
    this.meta = this.meta || { schema: 8 };
    this.meta.examDate = s || null;
    this.st.set(K.meta, this.meta);
  };
  State.prototype.addExam = function (r) {
    this.exams.push(r);
    if (this.exams.length > 30) this.exams = this.exams.slice(-30);
    this.st.set(K.exams, this.exams);
  };

  // ---------- 集計 ----------
  function proQuestions(bank) { return bank.questions.filter(function (q) { return q.course === '専門'; }); }
  State.prototype.stats = function (qs, now) {
    now = now || Date.now();
    var self = this, o = { total: qs.length, seen: 0, firstCorrect: 0, n: 0, c: 0, mastered: 0, review: 0, due: 0 };
    qs.forEach(function (q) {
      var r = self.q[q.id];
      if (!r || !r.n) return;
      o.seen++; o.n += r.n; o.c += r.c;
      if (r.f === 1) o.firstCorrect++;
      if (isMastered(r)) o.mastered++;
      if (r.wf) o.review++;
      if (isDue(r, now)) o.due++;
    });
    o.unseen = o.total - o.seen;
    o.coverage = o.total ? o.seen / o.total : 0;
    o.cumAcc = o.n ? o.c / o.n : null;
    o.firstAcc = o.seen ? o.firstCorrect / o.seen : null;
    o.masteryRate = o.total ? o.mastered / o.total : 0;
    return o;
  };
  State.prototype.recentAccuracy = function (n, filterIds) {
    n = n || 50;
    var ev = this.log;
    if (filterIds) ev = ev.filter(function (e) { return filterIds[e[1]]; });
    ev = ev.slice(-n);
    if (!ev.length) return null;
    var c = 0; ev.forEach(function (e) { c += e[2]; });
    return { acc: c / ev.length, n: ev.length };
  };
  // サブトピック（科目×サブトピック）ごとの状況。弱点度は直近3回の正誤から（ラプラス平滑化）
  State.prototype.subtopicStats = function (qs) {
    var self = this, map = {};
    qs.forEach(function (q) {
      var key = q.subject + '|' + q.subtopic;
      var m = map[key] || (map[key] = { key: key, subject: q.subject, subtopic: q.subtopic, total: 0, seen: 0, mastered: 0, rc: 0, rn: 0, n: 0, c: 0 });
      m.total++;
      var r = self.q[q.id];
      if (!r || !r.n) return;
      m.seen++; m.n += r.n; m.c += r.c;
      if (isMastered(r)) m.mastered++;
      (r.h || []).slice(-3).forEach(function (h) { m.rn++; m.rc += h[1]; });
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      m.recentAcc = m.rn ? m.rc / m.rn : null;
      m.score = (m.rc + 1) / (m.rn + 2); // 小さいほど弱い
      return m;
    });
  };
  State.prototype.weakSubtopics = function (qs, k, minSeen) {
    minSeen = minSeen || 3;
    return this.subtopicStats(qs).filter(function (m) { return m.seen >= minSeen && m.recentAcc !== null && m.recentAcc < 0.8; })
      .sort(function (a, b) { return a.score - b.score; }).slice(0, k || 3);
  };

  // 試験日までの計画: 未習得 ÷ 残り日数
  State.prototype.plan = function (qs, now) {
    now = now || Date.now();
    var ed = this.meta && this.meta.examDate ? parseDate(this.meta.examDate) : null;
    var s = this.stats(qs, now);
    var out = { examDate: this.meta && this.meta.examDate || null, due: s.due, unmastered: s.total - s.mastered, days: null, perDay: null };
    if (ed === null) return out;
    var days = Math.round((ed - startOfDay(now)) / DAY);
    out.days = days;
    if (days <= 0) return out;
    out.perDay = Math.ceil(out.unmastered / days);
    return out;
  };

  // ---------- 出題の組み立て ----------
  function rng(seed) { // 再現できる乱数（テスト用に seed を渡せる）
    if (seed === undefined || seed === null) return Math.random;
    var x = (seed >>> 0) || 1;
    return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  function shuffle(arr, rand) { rand = rand || Math.random; var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // スキマ時間・今日の学習: 復習対象（誤答→自信なし→未習得の期日到来）と未演習を半分ずつ。足りなければ互いに補う
  State.prototype.smartSession = function (qs, count, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), rand = rng(opts.seed), self = this;
    var t1 = [], t2 = [], t3 = [], unseen = [], later = [], mastered = [];
    qs.forEach(function (q) {
      var r = self.q[q.id];
      if (!r || !r.n) unseen.push(q);
      else if (r.wf && r.d <= now) t1.push(q);
      else if (r.wf || ((r.cf === 'g' || r.cf === 'u') && r.d <= now)) t2.push(q);
      else if (!isMastered(r) && r.d <= now) t3.push(q);
      else if (!isMastered(r)) later.push(q);
      else mastered.push(q);
    });
    var byDue = function (a, b) { return (self.q[a.id].d || 0) - (self.q[b.id].d || 0); };
    var review = t1.sort(byDue).concat(t2.sort(byDue), t3.sort(byDue));
    // 未演習は弱いサブトピックの類題を先に
    var weakKeys = {};
    this.weakSubtopics(qs, 5).forEach(function (m) { weakKeys[m.key] = 1; });
    var u = shuffle(unseen, rand);
    u = u.filter(function (q) { return weakKeys[q.subject + '|' + q.subtopic]; }).concat(u.filter(function (q) { return !weakKeys[q.subject + '|' + q.subtopic]; }));
    var nReview = Math.min(review.length, Math.ceil(count / 2));
    var nNew = Math.min(u.length, count - nReview);
    nReview = Math.min(review.length, count - nNew);
    var pick = review.slice(0, nReview).concat(u.slice(0, nNew));
    var fill = shuffle(later, rand).concat(shuffle(mastered, rand));
    for (var i = 0; pick.length < count && i < fill.length; i++) pick.push(fill[i]);
    return shuffle(pick, rand).map(function (q) { return q.id; });
  };
  // 弱点集中: 弱いサブトピックの誤答→未習得→未演習の類題→その他
  State.prototype.weakSession = function (qs, count, opts) {
    opts = opts || {};
    var rand = rng(opts.seed), self = this;
    var weak = opts.subtopicKeys || this.weakSubtopics(qs, 3).map(function (m) { return m.key; });
    if (!weak.length) return { ids: [], weak: [] };
    var set = {}; weak.forEach(function (k) { set[k] = 1; });
    var inWeak = qs.filter(function (q) { return set[q.subject + '|' + q.subtopic]; });
    var a = [], b = [], c = [], d = [];
    inWeak.forEach(function (q) {
      var r = self.q[q.id];
      if (r && r.wf) a.push(q); else if (r && r.n && !isMastered(r)) b.push(q); else if (!r || !r.n) c.push(q); else d.push(q);
    });
    var pick = shuffle(a, rand).concat(shuffle(b, rand), shuffle(c, rand), shuffle(d, rand)).slice(0, count);
    return { ids: shuffle(pick, rand).map(function (q) { return q.id; }), weak: weak };
  };
  State.prototype.wrongList = function (qs) {
    var self = this;
    return qs.filter(function (q) { var r = self.q[q.id]; return r && r.wf; })
      .sort(function (x, y) { return (self.q[x.id].d || 0) - (self.q[y.id].d || 0); }).map(function (q) { return q.id; });
  };

  // ---------- 模擬試験 ----------
  var EXAM_TYPES = {
    full: { title: '全範囲模擬試験', count: 50, minutes: 60 },
    subject: { title: '科目別模擬試験', count: 20, minutes: 25 },
    icd: { title: 'ICD-10集中', count: 30, minutes: 40 },
    summary: { title: '退院時要約集中', count: 16, minutes: 30 },
  };
  function buildExam(bank, type, opts) {
    opts = opts || {};
    var rand = rng(opts.seed), conf = EXAM_TYPES[type];
    if (!conf) throw new Error('unknown exam type ' + type);
    var pro = proQuestions(bank), ids = [];
    if (type === 'full') {
      var bySub = {};
      pro.forEach(function (q) { (bySub[q.subject] = bySub[q.subject] || []).push(q); });
      var subs = Object.keys(bySub).sort();
      var total = pro.length, n = Math.min(conf.count, total), alloc = {}, used = 0;
      subs.forEach(function (s) { alloc[s] = Math.min(bySub[s].length, Math.max(2, Math.floor(n * bySub[s].length / total))); used += alloc[s]; });
      var order = shuffle(subs, rand), i = 0;
      while (used < n && i < 1000) { var s = order[i % order.length]; if (alloc[s] < bySub[s].length) { alloc[s]++; used++; } i++; }
      while (used > n) { var s2 = order[i % order.length]; if (alloc[s2] > 1) { alloc[s2]--; used--; } i++; }
      subs.forEach(function (s) { ids = ids.concat(shuffle(bySub[s], rand).slice(0, alloc[s]).map(function (q) { return q.id; })); });
      ids = shuffle(ids, rand);
    } else if (type === 'subject') {
      ids = shuffle(pro.filter(function (q) { return q.subject === opts.subject; }), rand).slice(0, conf.count).map(function (q) { return q.id; });
    } else if (type === 'icd') {
      ids = shuffle(pro.filter(function (q) { return q.subject === 'S11' || q.subject === 'S12'; }), rand).slice(0, conf.count).map(function (q) { return q.id; });
    } else if (type === 'summary') {
      var byCase = {};
      pro.forEach(function (q) { if (q.caseId) (byCase[q.caseId] = byCase[q.caseId] || []).push(q); });
      var cases = shuffle(Object.keys(byCase).sort(), rand);
      for (var c = 0; c < cases.length && ids.length < conf.count; c++) ids = ids.concat(byCase[cases[c]].map(function (q) { return q.id; }));
    }
    // 問題数が規定より少ないときは時間も比例して短くする（1問あたりの時間は同じ）
    return { type: type, title: conf.title, ids: ids, minutes: ids.length >= conf.count ? conf.minutes : Math.max(5, Math.round(conf.minutes * ids.length / conf.count)) };
  }
  function scoreExam(bank, ids, answers) {
    var byId = {}; bank.questions.forEach(function (q) { byId[q.id] = q; });
    var r = { total: ids.length, correct: 0, unanswered: 0, perSubject: {}, items: [] };
    ids.forEach(function (id) {
      var q = byId[id]; if (!q) return;
      var a = answers[id]; var ok = a !== undefined && a !== null && a === q.answer;
      if (a === undefined || a === null) r.unanswered++;
      if (ok) r.correct++;
      var ps = r.perSubject[q.subject] || (r.perSubject[q.subject] = [0, 0]);
      ps[1]++; if (ok) ps[0]++;
      r.items.push([id, (a === undefined || a === null) ? -1 : a, ok ? 1 : 0]);
    });
    r.pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
    return r;
  }

  // ---------- 旧版（v2: 章ID＋配列インデックス）からの移行 ----------
  function legacyKeys(store) {
    return store.keys('himq_').filter(function (k) { return /^himq_(score_\d+|wrong|bookmarks)$/.test(k); });
  }
  function migrate(store, bank, now) {
    now = now || Date.now();
    var meta = store.get(K.meta, null);
    if (meta && meta.schema >= 8) return { migrated: false, reason: 'already' };
    var lk = legacyKeys(store);
    var report = { at: now, wrong: { total: 0, mapped: 0, inactive: 0, unknown: 0 }, bookmarks: { total: 0, mapped: 0, inactive: 0, unknown: 0 }, scores: 0 };
    if (!lk.length) {
      store.set(K.meta, { schema: 8, createdAt: now });
      return { migrated: false, reason: 'no-legacy' };
    }
    // 1) 移行前のデータを丸ごと退避（復元できるように）
    var backup = { at: now, reason: '旧版からの移行前', data: store.snapshot(true) };
    if (!store.get(K.backupV7, null)) store.set(K.backupV7, backup);
    var map = bank.legacyMap || {};
    var q = store.get(K.q, {}) || {};
    function resolve(item, bucket) {
      bucket.total++;
      if (!item || typeof item.chId !== 'number' || typeof item.qIdx !== 'number') { bucket.unknown++; return null; }
      var m = map[item.chId + '_' + item.qIdx];
      if (!m) { bucket.unknown++; return null; }
      if (m.active) bucket.mapped++; else bucket.inactive++;
      return m.id;
    }
    // 2) 誤答リスト → 問題IDの誤答フラグ（いつ解いたかは不明なので、今すぐ復習対象）
    (store.get('himq_wrong', []) || []).forEach(function (w) {
      var id = resolve(w, report.wrong);
      if (!id) return;
      var r = cloneRec(q[id] || emptyRec());
      r.n = Math.max(r.n, 1); r.w = Math.max(r.w, 1); r.s = 0; r.b = 0; r.d = now; r.wf = 1; r.cd = []; r.lw = 1;
      if (r.f === undefined) r.f = 0;
      q[id] = r;
    });
    // 3) ブックマーク → 問題ID
    var bm = store.get(K.bm, []) || [];
    (store.get('himq_bookmarks', []) || []).forEach(function (b) {
      var id = resolve(b, report.bookmarks);
      if (id && bm.indexOf(id) < 0) bm.push(id);
    });
    // 4) 章別スコアは問題単位に分解できないので、旧版の記録として保存
    var chapters = {};
    lk.forEach(function (k) {
      var m = /^himq_score_(\d+)$/.exec(k);
      if (m) { chapters[m[1]] = store.get(k, { correct: 0, total: 0 }); report.scores++; }
    });
    store.set(K.q, q); store.set(K.bm, bm);
    store.set(K.legacy, { chapters: chapters, chapterNames: bank.legacyChapters || {}, at: now });
    store.set(K.meta, { schema: 8, migratedAt: now, migratedFrom: 'v2', report: report, examDate: (meta && meta.examDate) || null });
    return { migrated: true, report: report };
  }

  // ---------- 入出力・バックアップ ----------
  function exportData(store, bank, now) {
    var data = store.snapshot(true);
    data._format = 'him-quiz';
    data._version = 'him-quiz-v8';
    data._exportDate = new Date(now || Date.now()).toISOString();
    data._bankVersion = bank.version;
    data._totalQuestions = bank.questions.length;
    return data;
  }
  function backupNow(store, reason, now) {
    var b = { at: now || Date.now(), reason: reason, data: store.snapshot(true) };
    store.set(K.backupLast, b);
    return b;
  }
  function replaceAll(store, data) {
    store.keys('himq_').forEach(function (k) { if (k.indexOf('himq_backup_') !== 0) store.remove(k); });
    Object.keys(data).forEach(function (k) {
      if (k.indexOf('himq_') !== 0 || k.indexOf('himq_backup_') === 0) return;
      var v = data[k];
      store.setRaw(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
  }
  // 旧版(v2)・v8 どちらの書き出しファイルも受け付ける。取り込み前の状態は himq_backup_last に退避
  function importData(store, bank, data, now) {
    if (!data || typeof data !== 'object') throw new Error('形式が違います');
    var keys = Object.keys(data).filter(function (k) { return k.indexOf('himq_') === 0 && k.indexOf('himq_backup_') !== 0; });
    if (!keys.length) throw new Error('HIM Quiz の学習データが含まれていません');
    backupNow(store, '取り込み前', now);
    replaceAll(store, data);
    var hasV8 = keys.some(function (k) { return k.indexOf('himq_v8_') === 0; });
    var res = { count: keys.length, migrated: false };
    if (!hasV8) { var m = migrate(store, bank, now); res.migrated = m.migrated; res.report = m.report; }
    return res;
  }
  function restoreBackup(store, which, now) {
    var key = which === 'v7' ? K.backupV7 : K.backupLast;
    var b = store.get(key, null);
    if (!b || !b.data) throw new Error('バックアップがありません');
    var cur = { at: now || Date.now(), reason: '復元前', data: store.snapshot(true) };
    replaceAll(store, b.data);
    store.set(K.backupLast, cur);
    return b;
  }
  function resetAll(store, now) {
    backupNow(store, '全リセット前', now);
    store.keys('himq_').forEach(function (k) { if (k.indexOf('himq_backup_') !== 0) store.remove(k); });
    store.set(K.meta, { schema: 8, createdAt: now || Date.now() });
  }

  return {
    DAY: DAY, INTERVALS: INTERVALS, MASTER_BOX: MASTER_BOX, KEYS: K, CONF: CONF, EXAM_TYPES: EXAM_TYPES,
    Store: Store, State: State, nextRec: nextRec, isMastered: isMastered, isDue: isDue, level: level, emptyRec: emptyRec,
    dayKey: dayKey, parseDate: parseDate, startOfDay: startOfDay, shuffle: shuffle, rng: rng,
    proQuestions: proQuestions, buildExam: buildExam, scoreExam: scoreExam,
    migrate: migrate, exportData: exportData, importData: importData, backupNow: backupNow, restoreBackup: restoreBackup, resetAll: resetAll,
  };
});
