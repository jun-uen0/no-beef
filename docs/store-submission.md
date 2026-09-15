# Chrome Web Store提出のチェックリスト(M5)

提出そのものは人が行う。ここは**提出前に終わっていなければならないもの**と、**審査で必ず聞かれるものへの答え**を置く場所。

## 済み

- [x] **`http://localhost/*`を製品ビルドから外す**。`wxt.config.ts`のhookが落とす。残るのは`*://x.com/*`と`*://twitter.com/*`だけ。フィクスチャ検証は`npm run build:test`で作る
- [x] **アイコン**(16／32／48／128)。正本は`assets/icon.svg`で、PNGは`rsvg-convert`で書き出す。WXTが`public/icon/`を拾ってmanifestに載せる
- [x] **プライバシーポリシー**。`docs/privacy.md`。掲載URLはGitHub上のこのファイル
- [x] **LICENSE**(MIT)

## 初版に入れないもの(2026-09-15決定)

- **M4(BYOブリッジ)と`nativeMessaging`権限**。既定オフでも権限が1つ増え、審査での説明も増える。初版はM3(言い換え)までとし、M4は`feat/m4-native-bridge`のまま次版へ回す。
  ⚠ M4をmainへmergeした後も、**初版のビルドには入れない**。提出前に`npm run build`のmanifestで`permissions`が2つだけであることを見る(下のチェックに含めた)

## 未了

- [x] **`nativeMessaging`は初版に載せない**(2026-09-15決定)。既定オフでも権限が1つ増え、審査の説明も増えるため、初版はM3までとし、M4は次版へ回す
- [ ] **`version`**。現在`0.1.0`のまま。M4(BYOブリッジ)を載せるかどうかで初版の内容が変わるので、**提出する版が確定してから**上げる。先に上げると意味の無い番号が履歴に残る
- [ ] **スクリーンショット**(1280×800または640×400)。⚠ 実タイムラインのスクリーンショットは他人の投稿とアカウント名が写る。**`test/fixtures/x-timeline.html`を使って撮る**
- [ ] **ストア掲載文**(日本語)。README(英語)の直訳ではなく、拡張のUIが日本語であることに合わせる
- [ ] **単一用途の説明**。ストアは拡張に1つの目的を求める。「SNSの心無いコメントを端末内AIで隠す／やわらげる」で通す

## 審査で聞かれるものへの答え

| 聞かれること | 答え |
|---|---|
| なぜ`storage`が要るか | 設定と判定キャッシュ。どちらも端末内で、投稿本文は保存しない |
| なぜ`offscreen`が要るか | service workerでは分類器のWASMを実行できないため。実行専用で、`chrome.runtime`以外のAPIを持たない(ADR 0008) |
| なぜx.comのホスト権限が要るか | 投稿を読むため。書き込み(投稿・いいね・フォロー)は一切しない |
| `nativeMessaging`は何に使うか | BYOブリッジ(ADR 0009)。**既定はオフ**で、設定画面で利用者が明示的に有効にしたときだけポートを開く。受け側の登録も利用者が手で行う |
| リモートコードを使っていないか | **使っていない**。ONNX Runtimeのwasmは拡張に同梱する(`public/wasm/`)。CDNから読む実装だったものを、まさにこの規約に合わせて外した |
| なぜ約22MBもあるか | 上記のwasmバックエンド(21MB)。分類器の重み(約136MB)は同梱せず、初回解析時にブラウザがダウンロードする |
| データを外部送信するか | しない。送信先が存在しない(ADR 0002) |

## 提出前に必ず通すもの

```
npm run typecheck && npm test
npm run build:test && bash scripts/launch-test-chrome.sh
python3 -m http.server 8787 -d test/fixtures
node scripts/verify-stages.mjs    # 各段が本当に答えているか
node scripts/verify-fixture.mjs   # カバーの判定
node scripts/verify-rewrite.mjs   # 言い換えの導線
```

⚠ 最後に**`npm run build`(製品ビルド)でmanifestを目視する**。`content_scripts[0].matches`に`localhost`が残っていないこと、`icons`が4サイズ載っていること、`permissions`が`storage`と`offscreen`の2つだけであることを見る。
