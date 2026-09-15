# BYOブリッジ：自分のエージェントに繋ぐ

no-beefの判定と言い換えを、**この端末で動いている自分のAIエージェント**に任せるための受け側(ネイティブメッセージングホスト)。設計判断は`docs/adr/0009-native-bridge.md`。

拡張が用意するのは接続口だけで、精度と費用は繋いだ側の責任になる。投稿の本文が端末から出ないことは変わらない(繋いだ先が送らなければ)。

## いつ使うか

- Chrome内蔵のGemini Nanoの端末要件(空きディスク22GB・VRAM 4GB超など)を満たさない
- 内蔵モデルより強いモデルで判定・言い換えをしたい

⚠ 設定しなくても拡張は動く。その場合はstage1(語彙)とstage2(分類器)だけで判定する。

## 仕組み

```
Chrome  ←4バイト長+JSON→  no-beef-host.mjs  ←JSON(標準入出力)→  あなたのコマンド
```

ホスト自身はエージェントではない。Chromeの通信形式を喋り、**設定したコマンドに1件ずつ渡すだけ**。

## 手順

### 1. 拡張IDを調べる

`chrome://extensions`でデベロッパーモードを有効にし、no-beefのIDを見る(32文字)。

⚠ **手で読み込んだ拡張のIDはプロファイルごとに変わる**。プロファイルを作り直したら登録もやり直す。

### 2. ホストを登録する

```
bash host/install.sh <拡張ID>
# Chrome Canary / Chromiumの場合
bash host/install.sh <拡張ID> --channel canary
```

Chromeの設定ディレクトリにJSONを1つ置く。**このリポジトリの外に書き込む唯一の操作**なので、拡張やビルドではなく人が実行する。登録先のパスは実行時に表示される。消せば解除できる。

登録したら**Chromeを再起動する**。

### 3. 繋ぎ先のコマンドを設定する

`host/agent.config.json`を作る(gitignore済み)。

```json
{ "command": ["/absolute/path/to/your-agent.sh"] }
```

コマンドは要求ごとに起動され、**標準入力に要求のJSON、標準出力に応答のJSON**を出す。

| 要求 | 応答 |
|---|---|
| `{"op":"classify","text":"…","lang":"ja"}` | `{"severity":"safe"\|"mild"\|"harmful","score":0〜1}` |
| `{"op":"rewrite","text":"…","lang":"ja"}` | `{"rewritten":"…"}` |

⚠ 応答が読めない・形がおかしいときは、ホストも拡張も**「意見なし」に倒す**。勝手に判定を作らない。

### 4. 拡張側で有効にする

設定画面の「端末内のエージェントを使う(ネイティブメッセージング)」をオンにする。既定はオフで、オフの間は`nativeMessaging`権限を一度も使わない。

## Chromeを起動せずに試す

登録の前に、ホスト単体が動くか確かめられる。

```
node -e '
const { spawn } = require("node:child_process");
const c = spawn("node", ["host/no-beef-host.mjs"], { stdio: ["pipe","pipe","inherit"] });
const frame = (o) => { const b = Buffer.from(JSON.stringify(o)); const h = Buffer.alloc(4); h.writeUInt32LE(b.length,0); return Buffer.concat([h,b]); };
let buf = Buffer.alloc(0);
c.stdout.on("data", (x) => { buf = Buffer.concat([buf,x]);
  while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
    const n = buf.readUInt32LE(0); console.log("←", buf.subarray(4,4+n).toString()); buf = buf.subarray(4+n); } });
c.stdin.end(frame({ op: "classify", text: "テストです" }));
'
```

- 設定前：`← {}`(意見なし)が返れば正常
- 設定後：`← {"severity":…,"score":…}`が返れば繋がっている

ホストの診断は**標準エラー**に出る。標準出力は通信路なので、繋ぎ先のコマンドも**余計なものを標準出力に出さない**こと。

## うまくいかないとき

| 症状 | 見るところ |
|---|---|
| 有効にしても判定が変わらない | 拡張IDが合っているか(プロファイルを作り直すと変わる)。Chromeを再起動したか |
| `Specified native messaging host not found` | 登録先のパスを確認。チャンネル(stable / canary / chromium)の取り違えが多い |
| 応答が返らない | 繋ぎ先のコマンドが標準出力にJSON以外を出していないか。15秒で打ち切る |
| 判定が「意見なし」ばかり | `score`が0〜1の数値か、`severity`が3値のどれかか。範囲外は拡張側で捨てる |
