# ビルドと公開の経路（v8）

## 正規の経路

```
bank/questions/*.json ─┐
bank/cases.json       ─┼─ node tools/build.mjs ─→ data/bank.js（verified のみ）
bank/subjects.json    ─┘                        ─→ data/icd-ref.json（使っているICDコードと公式名称）
js/core.js, js/app.js ──────────────────────────→ index.html の読み込み版（?v=ハッシュ）を更新
```

- **生成元**: `bank/`。問題は科目ごとのJSON（`bank/questions/S01.json` …）。status が `verified`・`provisional`・`rejected` のすべてを含む。
- **公開物**: `data/bank.js`。`verified` の問題だけ。直接編集しない。
- **乖離の検出**: `node tools/build.mjs --check` が、生成元から作り直した内容と、コミットされている `data/bank.js`・`index.html` の読み込み版・`data/icd-ref.json` を比べる。違えば失敗する。
- **CI**: `.github/workflows/check.yml`（PR と master への push）で `--check` と `node --test tests/*.test.mjs` を実行する。
- **デプロイ**: `.github/workflows/deploy.yml`（master への push）。同じ検査とテストに通ったときだけ、アプリ本体（`bank/`・`tools/`・`tests/`・`docs/` を除いたもの）を GitHub Pages に公開する。

## 問題を追加・修正する手順

1. 問題を作る・直す（作業ディレクトリの生成・監査の結果を `node tools/merge-results.mjs` で `bank/` に反映する。手で直すときも `bank/questions/*.json` を直す）
2. `node tools/validate.mjs bank/questions/S01.json --require-id`（一次資料キャッシュがある環境では引用の照合も行う）
3. `node tools/build.mjs`
4. `node --test tests/*.test.mjs` と、手元で `node tests/e2e/e2e.mjs`
5. `node tools/stats.mjs > docs/bank-stats.md`
6. コミット

`verified` にする条件は `docs/audit-report.md` の「検証の方法」に書いた。条件を満たさない問題は `provisional` か `rejected` のまま残り、公開されない。

## 旧ファイルについて

`build.js`・`build.py` は、以前の版（`him-quiz-v2.html`）を作るためのスクリプトで、v8 のビルドには使わない。`v3.html`・`v7.html`・`him-quiz-v1.html`・`him-quiz-v2.html`・`questions.txt` などの旧版のファイルは、外部から参照されている可能性があるため残している（どれも v8 の問題バンクとは無関係）。

## ツール一覧

| ツール | 役割 |
|---|---|
| `tools/build.mjs` | 公開バンクの生成と乖離の検査 |
| `tools/validate.mjs` | 問題ファイルのスキーマ・選択肢・否定形の指定・引用の照合・ICDコード・計算の検査 |
| `tools/icd.mjs` | ICD-10（2013年版）準拠 基本分類表の照会（コード・名称・中間分類・章・剣星） |
| `tools/blind.mjs` | 解答者用の「正答を除いた」問題ファイルを作る |
| `tools/extract-fixes.mjs` | 監査で修正された問題を再監査用に取り出す |
| `tools/merge-results.mjs` | 監査結果を判定規則に沿って `bank/` へ反映（冪等。IDは固定） |
| `tools/import-legacy.mjs` | 旧版360問の新形式への変換（一回限り） |
| `tools/stats.mjs` | 集計表（`docs/bank-stats.md`）の生成 |

一次資料キャッシュ（法令の条文・厚生労働省等の文書のテキスト）はリポジトリに含めていない。資料の一覧と取得元URLは `docs/sources.md` にある。
