# ADR 0006：stage3の実機検証は通常のGoogle Chromeで行う

日付：2026-09-15／状態：採用

## 文脈

M2で足したstage3(Gemini Nano)を実機で確かめようとしたが、フィクスチャ検証に使っているChrome for Testingでは`LanguageModel.availability()`が`downloading`のまま何時間経っても`available`にならなかった。

待てば終わるのか、それとも永久に終わらないのかを切り分けた結果、**Chrome for Testingにはモデルの重みが配信されない**ことがわかった。実測は次のとおり。

| 確認したこと | Chrome for Testing 151.0.7922.34 | 通常のGoogle Chrome 152.0.7977.83 |
|---|---|---|
| `LanguageModel.availability()` | `downloading`(前セッションから固着) | `downloadable` |
| `chrome://components`の`nano_v3_cpu_component` | **バージョン`0.0.0.0`／状態「Up-to-date」**。更新を促しても32秒間動かない | (未登録。呼び出しで配信が始まる) |
| `create()`の`downloadprogress` | 60秒間`loaded`が**0のまま** | 5分で3.9%、その後も単調増加 |
| プロファイル内の`OptGuideOnDeviceModel/` | 空 | 配信が進行中 |

配信のマニフェスト(`Optimization Guide On DeviceModels Manifest`)だけは`1.20260810.11`で届いている。だから`availability()`はモデルの存在を知っていて`downloading`と答えるが、**重みの本体は決して来ない**。ブランドなしビルドに対してGoogleのコンポーネント配信が`0.0.0.0`を「最新」と回答しているためで、こちらのコードでは動かせない。

なお、Chrome for Testingの起動ログには`gpu_blocklist.cc:120 Unable to get gpu adapter`が出ており、CPU版(`nano_v3_cpu_component`)が選ばれている。ただし配信が止まっているのはCPU版の重みなので、GPUの有無はこの問題の原因ではない。

## 決定

### 1. stage3の実機検証は通常のGoogle Chromeで行う

フィクスチャ検証(stage1・stage2)はこれまでどおりChrome for Testingを使う。`scripts/launch-test-chrome.sh`と`scripts/verify-fixture.mjs`は変更しない。

stage3だけは別系統にし、通常のGoogle Chromeに開発版の拡張を読み込ませて確かめる。

### 2. 拡張の読み込みは手動で行う。自動化は諦める

通常のGoogle Chrome 152は`--load-extension`を無視する。次の組み合わせをすべて試したが、`chrome://extensions`に何も現れなかった。

- `--load-extension` ＋ `--disable-features=DisableLoadExtensionCommandLineSwitch`
- Playwrightの`launchPersistentContext`起動 ＋ `--enable-unsafe-extension-debugging`
- 上記2つの併用
- `--disable-extensions-except`の併記

したがって`chrome://extensions`のデベロッパーモードから「パッケージ化されていない拡張機能を読み込む」を**人が1回押す**。これが唯一通る経路で、回避策は見つからなかった。

一度読み込めばプロファイルに残るので、手が要るのは初回だけ。再ビルド後の再読み込みは`chrome://extensions`のリロードボタンをCDP経由で押せる。

### 3. 検証用プロファイルはstage1・stage2用と分ける

| 用途 | ブラウザ | ポート | プロファイル |
|---|---|---|---|
| stage1・stage2のフィクスチャ検証 | Chrome for Testing | 9239 | `chrome-data-nobeef` |
| stage3の実機検証 | 通常のGoogle Chrome | 9240 | `chrome-data-nanoprobe` |

同じプロファイルを両方で使うと、`--load-extension`で入った拡張と手動で入れた拡張が二重になる。

## 却下した案

- **Chrome for Testingで待ち続ける**：配信元が`0.0.0.0`を「最新」と答えている以上、待っても来ない
- **Chromiumを使う**：ブランドなしという条件が同じなので、同じ理由で配信されないと見込まれる
- **偽のPrompt APIを注入する**：前セッションで試して不可能とわかっている(Playwrightの`evaluate`は拡張とは別の実行コンテキストで動く)。stage3の回路は`test/adapters/gemini-nano-classifier.test.ts`が同一プロセス内でスタブして検証する

## 帰結

- stage3の実機検証は**全自動にできない**。CIに載せる対象からも外れる
- モデルの初回ダウンロードは数時間かかる(実測で1時間あたり約30%)。検証セッションを組むときは、ダウンロードを先に走らせてから他の作業をする
- 通常のGoogle Chromeで`create()`を呼ぶときは、ボタンのクリック経由で呼んだ(利用者の操作を伴う経路)。この操作が必須かどうかは未検証で、拡張のオプション画面はもともとボタンから開始する作りなので実害はない(ADR 0005の決定1)
- `chrome://on-device-internals`を見るには、先に`chrome://chrome-urls`で内部デバッグページを有効にする必要がある
