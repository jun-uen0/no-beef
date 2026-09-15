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
- ③のLLM(Gemini Nano)はM2でbackgroundに`ClassifierPort`/`RewriterPort`アダプタとして追加する(Prompt APIはservice workerで使える)

## ポートとアダプタ

| ポート | MVP実装 | 将来の差し替え |
|---|---|---|
| `ClassifierPort` | lexicon／onnx(offscreen) | gemini-nano(M2)・webllm・BYOブリッジ(M4) |
| `RewriterPort` | (M3) | gemini-nano・BYOブリッジ |
| `CachePort` | memory(L1)・indexeddb(L2) | 共有基盤(ADR 0002改訂が前提) |
| `SiteAdapter` | x | 他SNS(YouTubeコメント等) |

## ロードマップ

- M1(現在)：X・日本語・カバー非表示のみ(①+②)
- M2：Gemini Nanoアダプタ(グレーゾーン・皮肉判定)
- M3：言い換え(RewriterPort)
- M4：BYOブリッジ(ネイティブメッセージング→ユーザ自身のエージェント)
- M5：Chrome Web Store公開準備

## テスト

- core層：vitest(DOM不要)
- SiteAdapter：フィクスチャHTML(`test/fixtures/`)で決定的に検証
- 統合：ビルド→CDP起動のChromeに`--load-extension`→agent-browser経由で確認
