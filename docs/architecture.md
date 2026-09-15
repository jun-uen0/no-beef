# アーキテクチャ

ヘキサゴナル。`src/core/`はブラウザAPI非依存の純TypeScriptで、外部との接続はすべてポート(`src/core/ports.ts`)越しのアダプタに置く。

## 実行コンテキストと配置

```
┌─ content script(x.com) ──────────────────────────────┐
│ SiteAdapter(X)：MutationObserverで投稿検知・カバーUI │
│   └ chrome.runtime.sendMessage(MSG_ANALYZE)          │
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
└──────────────────────────────────────────────────────┘
                    ↓
┌─ offscreen document ─────────────────────────────────┐
│ OnnxClassifier：transformers.js(WASM/WebGPU)         │
│ ※service workerはWASM実行の制約が多いため隔離       │
└──────────────────────────────────────────────────────┘
```

- メッセージ契約は`src/messaging/protocol.ts`が正本
- stage3はbackgroundで直接動く(Prompt APIはservice workerで使えるため、stage2と違いoffscreenが要らない)。アダプタの作りはADR 0005
- stage3は全投稿には流さない。`PipelineStage.shouldRun(req, current)`で発火を絞る(条件と根拠はADR 0004)
- Gemini Nanoのモデルダウンロードはオプション画面から利用者が始める。拡張が自動では始めない(ADR 0005)

## ポートとアダプタ

| ポート | MVP実装 | 将来の差し替え |
|---|---|---|
| `ClassifierPort` | lexicon／onnx(offscreen)／gemini-nano(background) | webllm・BYOブリッジ(M4) |
| `RewriterPort` | (M3) | gemini-nano・BYOブリッジ |
| `CachePort` | memory(L1)・indexeddb(L2) | 共有基盤(ADR 0002改訂が前提) |
| `SiteAdapter` | x | 他SNS(YouTubeコメント等) |

## ロードマップ

- M1(完了)：X・日本語・カバー非表示のみ(①+②)
- M2(現在)：Gemini Nanoアダプタ(グレーゾーン・皮肉判定)。stage3の発火条件はADR 0004
- M3：言い換え(RewriterPort)
- M4：BYOブリッジ(ネイティブメッセージング→ユーザ自身のエージェント)
- M5：Chrome Web Store公開準備

## テスト

- core層：vitest(DOM不要)
- SiteAdapter：フィクスチャHTML(`test/fixtures/`)で決定的に検証
- 統合：ビルド→CDP起動のChromeに`--load-extension`→agent-browser経由で確認
