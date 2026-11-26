#!/usr/bin/env node
// 監査レポート（docs/audit-report.md）と既存問題の修正・除外一覧（docs/legacy-changes.md）を生成する。
//   node tools/report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBank } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = process.env.HIMQ_WORK || '/home/user/hq-work';
const { subjects, questions } = loadBank();
const SM = new Map(subjects.subjects.map((s) => [s.id, s]));
const readJson = (p, d = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d);
const changes = readJson(path.join(WORK, 'legacy-changes.json'), []);
const dup = readJson(path.join(WORK, 'dup-review.json'), null);
const esc = (s) => String(s ?? '').replace(/\|/g, '／').replace(/\n/g, ' ');
const cnt = (arr, f) => arr.filter(f).length;
const legacy = questions.filter((q) => q.legacy), fresh = questions.filter((q) => !q.legacy);
const st = (arr, s) => cnt(arr, (q) => q.status === s);
const fixedIds = new Set(changes.filter((c) => c.action === 'fix').map((c) => c.id));
const reasonOf = (q) => { const m = /除外理由:\s*([a-z-]+)/.exec(q.verification?.notes || ''); return m ? m[1] : (q.status === 'rejected' ? 'other' : null); };

// ---------------- audit-report.md ----------------
const L = [];
L.push('# 問題品質監査レポート（HIM Quiz v8）', '');
L.push(`作成: \`node tools/report.mjs\`（生成元 \`bank/\` と監査記録 \`bank/audit/\` から集計）`, '');
L.push('## 1. 数字', '');
L.push('| | 旧版（既存360問） | v8 新規 | 合計 |', '|---|---:|---:|---:|');
L.push(`| 監査・生成した問題 | ${legacy.length} | ${fresh.length} | ${questions.length} |`);
L.push(`| **verified（公開）** | ${st(legacy, 'verified')} | ${st(fresh, 'verified')} | **${st(questions, 'verified')}** |`);
L.push(`| うち監査で修正したもの | ${cnt(legacy, (q) => fixedIds.has(q.id) && q.status === 'verified')} | ${cnt(fresh, (q) => (q.verification?.method || []).some((m) => /で修正/.test(m)) && q.status === 'verified')} | |`);
L.push(`| provisional（追加確認が必要・非公開） | ${st(legacy, 'provisional')} | ${st(fresh, 'provisional')} | ${st(questions, 'provisional')} |`);
L.push(`| rejected（除外・非公開） | ${st(legacy, 'rejected')} | ${st(fresh, 'rejected')} | ${st(questions, 'rejected')} |`);
L.push(`| 監査で修正が必要と判定（再監査の結果を問わず） | ${changes.filter((c) => c.action === 'fix').length} | ${cnt(fresh, (q) => (q.verification?.method || []).some((m) => /で修正/.test(m)))} | |`);
L.push('');
L.push('未検証の問題は公開バンク（`data/bank.js`）に入らない。`tests/data.test.mjs` が「公開＝verified」を毎回確かめる。', '');
L.push('## 2. 検証の方法（役割の分離）', '');
L.push('どの問題も、作った（または旧版を書いた）エージェント自身の判断では verified にしない。役割ごとに別のエージェントを起動し、記録を残した。', '');
L.push('| 役割 | 担当 | やったこと |', '|---|---|---|');
L.push('| 出題範囲調査 | 調査エージェント6体＋現場 | 日本病院会の募集要項等で範囲を確認（`docs/exam-research.md`）。法令52本・厚生労働省等の文書 約400件を取得し、テキスト化して登録簿にした（`docs/sources.md`） |');
L.push('| 問題生成 | 生成エージェント（分野ごと） | 一次資料の該当箇所を開いてから作問。根拠は資料ID・URL・該当箇所・**原文どおりの引用**で記録 |');
L.push('| 正答検証 | ブラインド解答エージェント（**生成と別のモデル**） | 正答・解説を除いた問題だけを解き、正答・自信・曖昧さを記録 |');
L.push('| 選択肢・解説検証／領域監査 | 監査エージェント（ICD-10専門、法令・制度、統計、医療管理・情報、実務・DPC・がん登録の5領域） | 正答の一意性、誤答が明確に誤りか、問題文の曖昧さ、正誤の指定、解説と正答の一致、根拠が正答を支持するか、基準時点、ICDの版と分類、計算を確認。pass / fix / reject を判定 |');
L.push('| 修正分の再監査 | 別の監査エージェント | 修正された問題を、まず正答を見ずに解き、その後に全項目を確認。pass / provisional / reject（再監査者は修正しない） |');
L.push('| 重複・品質監査 | スクリプト＋監査エージェント | 文字3-gramの類似度で近い組を抽出し、重複か類題かを判定。正答位置の偏りを集計 |');
L.push('| 機械検査 | `tools/validate.mjs`・`tools/build.mjs` | スキーマ、4〜5択、選択肢別解説の数、否定形の指定と問題文の一致、**引用が資料本文に実在するか**（正規化して照合）、ICDコードが基本分類表（2013年版）に存在するか、計算問題の式と正答の一致 |');
L.push('');
L.push('**verified の条件**（`tools/merge-results.mjs` が機械的に判定）', '');
L.push('- 監査が pass で、ブラインド解答が正答と一致し、機械検査に通ること', '- 監査で fix になった問題は、独立した再監査が pass で、再監査者のブラインド解答も正答と一致し、機械検査に通ること', '- それ以外（ブラインド解答と不一致のまま、再監査が provisional、機械検査で不合格など）は provisional。誤り・曖昧・根拠不足・古い・重複は rejected', '');
L.push('各問題の `verification` に、日付・手順（method）・担当（roles）・監査記録の場所（log）・監査メモ（notes）を残した。監査記録の原本は `bank/audit/` にある（ブラインド解答、監査の判定と根拠、再監査）。', '');
L.push('## 3. 科目別の結果', '');
L.push('| 科目 | verified | provisional | rejected | 計 |', '|---|---:|---:|---:|---:|');
for (const s of subjects.subjects) {
  const qs = questions.filter((q) => q.subject === s.id);
  if (!qs.length) continue;
  L.push(`| ${s.course === '専門' ? '専門' + s.no : '基礎'} ${s.name} | ${st(qs, 'verified')} | ${st(qs, 'provisional')} | ${st(qs, 'rejected')} | ${qs.length} |`);
}
L.push('');
L.push('## 4. 除外・保留の理由', '');
const reasons = {};
for (const q of questions.filter((x) => x.status === 'rejected')) { const r = reasonOf(q) || 'other'; reasons[r] = (reasons[r] || 0) + 1; }
const RN = { 'wrong-answer': '正答が誤り', ambiguous: '曖昧・正答が一意でない', unsupported: '根拠資料で確認できない', outdated: '制度・名称が古い', duplicate: '重複', 'out-of-scope': '範囲外', 'low-quality': '品質不足', other: 'その他（再監査で不合格など）' };
L.push('| 理由（rejected） | 件数 |', '|---|---:|');
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) L.push(`| ${RN[k] || k} | ${v} |`);
L.push('');
const prov = questions.filter((q) => q.status === 'provisional');
const pr = { '再監査で保留': cnt(prov, (q) => /再監査/.test(q.verification?.notes || '') || (q.verification?.method || []).some((m) => /provisional/.test(m))), 'ブラインド解答と不一致': cnt(prov, (q) => /不一致/.test(q.verification?.notes || '')), '機械検査で不合格': cnt(prov, (q) => /機械検査/.test(q.verification?.notes || '')), '未監査・再監査未実施': cnt(prov, (q) => /未監査|監査結果なし|未実施/.test(JSON.stringify(q.verification || {}))) };
L.push('| provisional の内訳（重複あり） | 件数 |', '|---|---:|');
for (const [k, v] of Object.entries(pr)) L.push(`| ${k} | ${v} |`);
L.push('');
L.push('## 5. 既存360問で見つかった主な誤りの型', '');
L.push('旧版の問題は出典がなく、監査で多くの修正が必要だった。修正・除外の全件は `docs/legacy-changes.md`。代表的な型:', '');
L.push('- 正答そのものの誤り（例: ICD-10（2013年版）の章数を21章としていた。正しくは22章）', '- 正答は合っていても、誤答の解説や「ポイント」に誤った記述（剣印・星印の使い方、コードの範囲、主傷病名と医療資源病名の混同など）', '- 制度改正前の名称・数値（社会保険診療報酬支払基金の改組、令和8年度診療報酬改定、安全管理ガイドラインの版など）', '- 誤答が明らかに無関係で学習効果が低い（4択→根拠のある5択に作り直し）', '- 科目の誤分類（DPC・がん登録を国際統計分類Ⅱに、コーディングを診療情報管理Ⅱに置いていた）', '');
if (dup) {
  L.push('## 6. 重複・類似の監査', '');
  L.push(`問題文＋正答の文字3-gramの類似度（Jaccard ${dup.threshold} 以上）で抽出した組と、再監査で指摘された組を確認し、同一問題と判断した ${dup.rejected} 問を除外した（一覧は \`bank/overrides.json\`）。同じ知識を別の角度から問う類題は残した。`, '');
}
L.push('## 7. 基準時点の注意（2026年に変わったもの）', '');
L.push('- 2026-10-01: 社会保険診療報酬支払基金 →「医療情報基盤・診療報酬審査支払機構」', '- 令和8年度診療報酬改定（2026-06-01施行）: 診療録管理体制加算の再編（加算1=100点、加算2=30点）、DPC/PDPS傷病名コーディングテキスト第7版', '- 医療情報システムの安全管理に関するガイドライン 第7.0版（令和8年6月）', '- 医療・介護関係事業者における個人情報の適切な取扱いのためのガイダンス、オンライン診療の指針（令和8年4月改訂）', '- 地域医療構想（2040年）で「包括期」、特定機能病院のA・B、医療安全管理者の配置義務（令和8年4月）', '- 統計基準: ICD-10（2013年版）準拠の分類は2026-12-31まで。2027-01-01からICD-11準拠（総務省告示 令和8年第11号）', '- 死亡診断書（死体検案書）記入マニュアル 令和8年度版', '');
L.push('## 8. 限界と注意', '');
L.push('- 監査はAIエージェントが一次資料を照合して行った。役割と使うモデルを分け、引用の実在は機械で確かめたが、人の専門家による査読ではない。誤りを見つけたら問題IDを添えて知らせてほしい。', '- 科目試験の問題数・時間・形式は公開資料で確認できなかった。模擬試験は独自の形式。', '- 公式テキスト・練習問題は使っていないため、テキスト固有の言い回しや範囲の細部とずれる可能性がある。', '- 法令・制度は 2026-11-24 時点の取得内容に基づく。以後の改正は反映していない。', '');
fs.writeFileSync(path.join(ROOT, 'docs', 'audit-report.md'), L.join('\n') + '\n');

// ---------------- legacy-changes.md ----------------
const C = [];
C.push('# 既存問題（旧版360問）の修正・除外一覧', '');
C.push('旧版の各問題（`lg-旧章-旧番号`。旧版の学習履歴はこのIDに移行）の監査結果。「状態」は最終の検証状態。', '');
const byId = new Map(questions.map((q) => [q.id, q]));
const sum = { verified: 0, provisional: 0, rejected: 0 };
for (const q of legacy) sum[q.status]++;
C.push(`- verified ${sum.verified}問（うち修正 ${cnt(legacy, (q) => fixedIds.has(q.id) && q.status === 'verified')}問）／ provisional ${sum.provisional}問 ／ rejected ${sum.rejected}問`, '');
C.push('| ID | 旧章 | 新しい科目 | 監査 | 状態 | 内容 |', '|---|---|---|---|---|---|');
for (const q of [...legacy].sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const ch = changes.find((c) => c.id === q.id);
  const action = ch ? (ch.action === 'fix' ? '修正' : '除外') : (/未監査/.test(q.verification?.notes || '') ? '未監査' : '変更なし');
  const detail = ch ? (ch.detail || ch.reason || '') : '';
  C.push(`| ${q.id} | ${q.legacy.chapter} ${esc(q.legacy.chapterName)} | ${esc(SM.get(q.subject)?.short || q.subject)} | ${action} | ${q.status} | ${esc(detail).slice(0, 220)} |`);
}
fs.writeFileSync(path.join(ROOT, 'docs', 'legacy-changes.md'), C.join('\n') + '\n');
console.log('written docs/audit-report.md, docs/legacy-changes.md');
