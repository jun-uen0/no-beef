# no-beef

SNS(現状はX)の心無いコメントを、端末内AIだけで判定してカバー非表示/言い換えするChrome拡張。**このリポはGitHubでpublic公開する前提**なので、個人情報・認証情報・副業や顧客の固有名詞をコミットに含めない。

## 設計の正本

- 設計判断は`docs/adr/`(番号順)。新しい設計判断をしたらADRを足す
- 全体構成とロードマップは`docs/architecture.md`
- 大方針：ヘキサゴナル。`src/core/`はブラウザAPI非依存の純TypeScript。外部接続(サイトDOM・分類器・LLM・キャッシュ)は必ず`src/core/ports.ts`のポート経由でアダプタに置く

## 開発コマンド

- `npm run dev`：WXT開発モード
- `npm test`：ユニットテスト(vitest)
- `npm run build`：本番ビルド(`.output/chrome-mv3/`)
- `npm run typecheck`：型検査

## 規約

- コードコメントは英語(ai-rules準拠)。ドキュメントはREADMEが英語、ADR等は日本語
- commitは変更後に提案する(自動commitは採用しない)
- 判定結果や投稿本文を**リポ内・外部サービスに書き出さない**(ADR 0002。キャッシュはローカルIndexedDBのみ)

## テスト用ブラウザ(agent-browser連携)

- CDPポート**9239**・プロファイル`chrome-data-nobeef`(正本は`~/Documents/git/agent-browser/ports.local.md`)
- 実Xでの検証は読み取り中心。自動での書き込み(投稿・いいね等)はしない
