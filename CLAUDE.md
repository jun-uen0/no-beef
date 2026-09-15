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
- 手順：`npm run build:test` → `bash scripts/launch-test-chrome.sh` → `python3 -m http.server 8787 -d test/fixtures` → `node scripts/verify-fixture.mjs`(カバーの判定)・`node scripts/verify-rewrite.mjs`(言い換えの導線)・`node scripts/verify-stages.mjs`(各段が本当に答えているか)。終わったら`close-cdp-chrome.sh`とサーバのkillで必ず片付ける
- 言い換え(M3)の実文は9240でしか見られない。`NOBEEF_CDP_URL=http://127.0.0.1:9240 node scripts/verify-rewrite.mjs`。9239では「言い換えられませんでした」に落ちる経路のほうを検証する(カバーが残ることを見る)
- ⚠ **Chrome for TestingにはGemini Nanoの重みが配信されない**(ADR 0006)。`chrome://components`の`nano_v3_cpu_component`がバージョン`0.0.0.0`のまま「Up-to-date」を返し、`availability()`は`downloading`で固着する。**待っても`available`にならない**ので待たない。stage3の実機検証は通常のGoogle Chrome(ポート9240・プロファイル`chrome-data-nanoprobe`)で行い、拡張は`chrome://extensions`のデベロッパーモードから**人が手で読み込む**(stable Chromeは`--load-extension`をどのフラグ併用でも無視する)
- stage3(Gemini Nano)はこのフィクスチャ検証の対象外。偽のPrompt APIをservice workerへ注入する方式は**使えない**(Playwrightの`evaluate`は別の実行コンテキストで動くため、スタブはテスト側にだけ見え、拡張は本物のAPIを使い続ける)。stage3の回路は`test/adapters/gemini-nano-classifier.test.ts`が同一プロセス内でスタブして検証する
- ⚠ **フィクスチャ検証は`npm run build:test`でビルドする**。`npm run build`(製品ビルド)は`http://localhost/*`のマッチをmanifestから外すので、content scriptがフィクスチャに注入されず、「投稿が1件も検出されない」という壊れ方をする(ADR 0008の周辺・`wxt.config.ts`のhookが正本)
- ⚠ **Chromeは拡張のservice workerスクリプトをキャッシュし、manifestのバージョンが同じだと再ビルドしても古いコードを動かし続ける**。実際にこれで、前のビルドが書いた判定を読んで検証が「PASS」した。`launch-test-chrome.sh`が起動のたびに`Default/Service Worker`を消すのはこのため(ScriptCacheだけ消すと登録と食い違って拡張が起動しなくなる)。再ビルドしていないときは`NOBEEF_KEEP_SW_CACHE=1`で省ける
- ⚠ **閉じた直後に起動しない**。ポート9239がまだ解放されておらず、起動スクリプトが古いインスタンスに接続して古いビルドを測る。`curl`でポートの解放を待ってから起動する
