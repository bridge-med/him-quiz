# HIM Quiz — 診療情報管理士 模擬問題集

日本病院会 診療情報管理士通信教育 **専門課程の科目試験（Web）** に向けた、無料の学習アプリ。公開先: https://bridge-med.github.io/him-quiz/

- 専門課程の12科目に沿った問題。根拠資料（法令・厚生労働省等）と基準時点つきの解説
- 誤答と自信度にもとづく復習、スキマ時間の5・10・20問、弱点集中、模擬試験、学習ダッシュボード
- 学習記録は端末のブラウザにだけ保存（ログイン不要）。エクスポート・インポート・バックアップ復元に対応

日本病院会の公式教材・公式サービスではありません。問題はすべて公開資料をもとにしたオリジナル問題で、退院時要約は架空症例です。

## 開発

| 目的 | コマンド |
|---|---|
| 公開バンクの生成 | `node tools/build.mjs` |
| 生成物とソースの乖離チェック | `node tools/build.mjs --check` |
| テスト | `node --test tests/*.test.mjs` |
| ブラウザテスト（Playwright） | `node tests/e2e/e2e.mjs` |
| 集計表 | `node tools/stats.mjs > docs/bank-stats.md` |

- 構成とビルドの経路: [docs/build.md](docs/build.md)
- 試験範囲の調査: [docs/exam-research.md](docs/exam-research.md)
- 問題品質の監査: [docs/audit-report.md](docs/audit-report.md)、集計: [docs/bank-stats.md](docs/bank-stats.md)
- 既存問題の修正・除外: [docs/legacy-changes.md](docs/legacy-changes.md)
- 根拠資料の一覧: [docs/sources.md](docs/sources.md)
- 変更履歴: [docs/CHANGELOG.md](docs/CHANGELOG.md)
