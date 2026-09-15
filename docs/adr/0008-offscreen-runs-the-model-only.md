# ADR 0008：offscreen文書はモデルを回すだけ。判定方針はbackgroundが持つ

日付：2026-09-15／状態：採用

## 文脈

x.comの本番タイムラインで初めて拡張を動かしたところ、stage2(ONNX分類器)が一度も判定を返していないことが分かった。掘っていくと、原因が2層あった。

1. transformers.jsがONNX Runtimeのwasmバックエンドを**CDNからスクリプトとして読み込む**。MV3の拡張ページは自分自身からしかスクリプトを読めないのでCSPに弾かれ、`no available backend found`で固定されていた
2. 1を直してstage2が動き出した直後、今度は**設定画面のしきい値がstage2に効いていない**ことが分かった。offscreen文書の中で`chrome.storage`が`undefined`だったため、`loadConfig()`が毎回例外を投げ、`catch`が`DEFAULT_CONFIG`を返していた

2つ目が本ADRの主題である。**offscreen文書には`chrome.runtime`しか与えられない**。これは実装の不足ではなくプラットフォームの仕様で、回避する方法は無い。

しかもこの失敗は徴候が出ない。既定値が妥当な値なので、利用者がスライダーを動かしても「効いていないように見えるだけ」で、エラーも警告も出なかった。実際、`harmfulThreshold`を0(=すべて隠す)にしても穏やかな文が`safe`で返ってくることを実測して初めて気づいた。

## 決定

**offscreen文書はモデルを回してスコアを返すところまでを担い、それ以上の判断をしない。**

- `ClassifyResponse`を`Verdict`から`{ score: number } | null`に変えた。`null`は従来どおり「意見なし」(モデルが使えない・読めないラベル集合)
- スコアから`severity`を決めるのは`OffscreenClassifierProxy`(background側)の仕事とした。backgroundは`chrome.storage`を読めるので、利用者の閾値がここで初めて意味を持つ
- しきい値の適用そのものは`severityFor()`として`src/core/severity.ts`へ出し、ONNX経路とGemini Nano経路が同じ1つを使う。ブラウザAPIに触れない純粋関数なのでテストできる

ONNX Runtimeのwasmは`scripts/copy-ort-runtime.mjs`が`node_modules`から`public/wasm/`へコピーし、拡張自身が配信する。CDNに戻す選択肢は無い(MV3はリモートコードを許さない)。

## 却下した案

- **`MSG_CLASSIFY`に設定を同梱してoffscreenへ渡す**：動くが、判定方針という同じ1つの決定がプロセスを跨いで散る。offscreenは「モデルの実行環境」として役割を狭く保つほうが、将来WebLLM等に差し替えるときも楽
- **offscreen側で`chrome.storage`が使えないことをコメントで注意するに留める**：同じ事故が起きる。型と戻り値の形で不可能にするほうが強い
- **wasmをリポジトリにコミットする**：21MBのバイナリを履歴に載せる理由が無い。ビルド時のコピーで足りる

## 帰結

- **offscreen文書に新しい責務を足すときは、まず`chrome.runtime`だけで足りるかを確認する**。足りないなら、それはbackgroundの仕事である
- パッケージが約900KBから約22.5MBになった。Chrome Web Storeの上限(2GB)には遠いが、M5の審査で説明が1つ増える
- 「黙って既定値に落ちる`catch`」が事故の実体だった。`catch`で妥当な既定値を返す形は、**利用者の設定を握りつぶす場所では書かない**
- この種の不具合はフィクスチャでは永久に出ない。段ごとの疎通は`scripts/verify-stages.mjs`が、しきい値の実効性は手動の実測が見る。前者は回帰として常設した
