# アーキテクチャ

ヘキサゴナル。`src/core/`はブラウザAPI非依存の純TypeScriptで、外部との接続はすべてポート(`src/core/ports.ts`)越しのアダプタに置く。

## 実行コンテキストと配置

```
┌─ content script(x.com) ──────────────────────────────┐
│ SiteAdapter(X)：MutationObserverで投稿検知・カバーUI │
│   ├ chrome.runtime.sendMessage(MSG_ANALYZE)          │
│   └ chrome.runtime.sendMessage(MSG_REWRITE)          │
│       ※カバーのボタンが押されたときだけ(ADR 0007)  │
└──────────────────────────────────────────────────────┘
                    ↓
┌─ background(service worker) ─────────────────────────┐
│ AnalysisPipeline(core)                               │
│   stage1: LexiconClassifier(同期・正規表現)          │
│   stage2: OffscreenClassifierProxy                   │
│   stage3: GeminiNanoClassifier(Prompt API)           │
│     └ ゲート：mild帯 OR 皮肉候補(ADR 0004)          │
│   cache : MemoryCache(L1)+IndexedDbCache(L2)         │
│   └ chrome.runtime.sendMessage(MSG_CLASSIFY)         │
│ GeminiNanoRewriter(Prompt API・段ではない)           │
│   └ 生成文はcheckRewriteを通してから返す            │
└──────────────────────────────────────────────────────┘
                    ↓
┌─ offscreen document ─────────────────────────────────┐
│ OnnxClassifier：transformers.js(WASM)                │
│ ※service workerはWASM実行の制約が多いため隔離       │
│ ⚠ chrome.runtimeしか使えない。設定は読めないので     │
│   スコアだけ返し、severityはbackgroundが決める       │
│   (ADR 0008)。wasmはpublic/wasm/から自前で配信       │
└──────────────────────────────────────────────────────┘
```

- メッセージ契約は`src/messaging/protocol.ts`が正本
- 利用者の閾値を適用するのは`src/core/severity.ts`の`severityFor()`ひとつ。呼ぶのは`chrome.storage`を読める場所(background)に限る(ADR 0008)
- stage3はbackgroundで直接動く(Prompt APIはservice workerで使えるため、stage2と違いoffscreenが要らない)。アダプタの作りはADR 0005
- stage3は全投稿には流さない。`PipelineStage.shouldRun(req, current)`で発火を絞る(条件と根拠はADR 0004)
- Gemini Nanoのモデルダウンロードはオプション画面から利用者が始める。拡張が自動では始めない(ADR 0005)
- 言い換えはパイプラインの段ではない。カバーの`やわらかく読む`が押されたときだけ走り、生成文はカバーの内側にラベル付きで出す。原文のDOMには触らず、永続化もしない(ADR 0007)

## ポートとアダプタ

| ポート | MVP実装 | 将来の差し替え |
|---|---|---|
| `ClassifierPort` | lexicon／onnx(offscreen)／gemini-nano(background) | webllm・BYOブリッジ(M4) |
| `RewriterPort` | gemini-nano(background・要求時のみ) | BYOブリッジ(M4) |
| `CachePort` | memory(L1)・indexeddb(L2) | 共有基盤(ADR 0002改訂が前提) |
| `SiteAdapter` | x | 他SNS(YouTubeコメント等) |

## ロードマップ

- M1(完了)：X・日本語・カバー非表示のみ(①+②)
- M2(完了)：Gemini Nanoアダプタ(グレーゾーン・皮肉判定)。stage3の発火条件はADR 0004
- M3(現在)：言い換え(RewriterPort)。出し方と生成文の扱いはADR 0007
- M4：BYOブリッジ(ネイティブメッセージング→ユーザ自身のエージェント)
- M5：Chrome Web Store公開準備

## テスト

- core層：vitest(DOM不要)
- SiteAdapter：フィクスチャHTML(`test/fixtures/`)で決定的に検証
- 統合：ビルド→CDP起動のChromeに`--load-extension`→agent-browser経由で確認
  - `scripts/verify-fixture.mjs`：カバーの判定(harmful/safe)
  - `scripts/verify-rewrite.mjs`：言い換えボタンの導線と、言い換えできないときカバーが残ること
  - `scripts/verify-stages.mjs`：**各段が本当に答えているか**(段でしか出せない`source`を確認)。
    stage2が長期間死んでいても誰も気づかなかったので常設した
  - `scripts/probe-live.mjs`：本番x.comのDOM実測(件数と比率だけ。本文・アカウント名・idは出さない)
