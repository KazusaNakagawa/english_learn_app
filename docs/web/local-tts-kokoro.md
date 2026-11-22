# ローカル音声(Kokoro)

Web 版の読み上げを、手元で動く Kokoro-82M で行う仕組みのメモです。英語は `am_echo`(米国男性)、日本語は `jf_alpha`(女性)を使います。無料で API キーは要らず、音声データはマシンの外に出ません。設定画面では、英語の「男性」と日本語の「女性」がこの声です(既定)。ローカル音声が使えないときは、同じ性別のブラウザの声で読みます。利用者向けの手順は [web/README.md](../../web/README.md#ローカル音声kokoro)、API の仕様は [launcher/README.md](../../launcher/README.md#local-voice-kokoro)、声とライセンスは [docs/voices.md](../voices.md) にあります。

2026-11-21 に、Apple M4(macOS、CPU のみ)と uv 0.10.12 で動作を確かめました。

## 声を選んだ経緯

標準の Web Speech は、英語がネイティブらしく聞こえず、日本語は VOICEVOX の Lambda を撤去してから OS の機械的な声にフォールバックしていました。Kokoro の英語男性声 13 種と日本語 3 種を、現状の macOS の声と同じ例文で聞き比べて、上の 2 つを選びました。

クラウドの TTS API は API キーと従量課金が必要なので使いません。ブラウザ内で動く `kokoro-js` は英語の声しか持たず `jf_alpha` を鳴らせないので、ランチャーから Python の Kokoro を動かす形にしました。

## 構成

```text
ページ ──POST /api/tts──▶ launcher/lib/api.mjs ──▶ lib/tts.mjs ──stdin/stdout(JSON 行)──▶ uv run --script lib/kokoro_worker.py
```

- `kokoro_worker.py` は PEP 723 のインラインメタデータで依存を宣言し、`kokoro_worker.py.lock` で版を固定しています。依存を変えたら `uv lock --script launcher/lib/kokoro_worker.py` で lock を作り直してください。
- worker は最初の `GET /api/health?tts=1` か `POST /api/tts` で起動します。準備ができるまで `/api/tts` は 503 `starting` を返すので、ページはそのあいだブラウザの声で読みます。
- 速度の実測(M4、CPU のみ): 依存とモデルがキャッシュ済みなら起動まで 6〜30 秒、その後は 1 文あたり約 0.3 秒です。初回は依存とモデルで約 1.5GB をダウンロードします。

## 落とし穴

### macOS 向けに同梱された espeak-ng がデータを読めない

misaki(Kokoro の発音変換)は、辞書にない英単語の読みに espeak-ng を使います。pip の `espeakng-loader` 0.2.4 に同梱された macOS 版のライブラリは、データの場所をどう渡しても無視し、ビルド環境のパスを読みに行ってプロセスごと `exit()` します。

```text
Error processing file '/Users/runner/work/espeakng-loader/.../espeak-ng-data/phontab': No such file or directory.
```

`espeak_Initialize` に直接パスを渡しても、`ESPEAK_DATA_PATH` を設定しても同じでした。そこで worker は、macOS ではシステムの espeak-ng(Homebrew の `/opt/homebrew/lib` か `/usr/local/lib`)だけを使います。見つからなければ espeak を使わず、辞書にない単語を含む文は `unsupported-text` を返します。ページはその文だけブラウザの声で読むので、単語が無音で飛ぶことはありません。テストや切り分けでは、環境変数 `KOKORO_ESPEAK_LIBRARY` にライブラリのパスか `none` を渡して挙動を切り替えられます。

### misaki[ja] が辞書のない unidic を入れる

`misaki[ja]` は `unidic` に依存しますが、pip は辞書本体(約 770MB、`python -m unidic download` で別途取得)を入れません。fugashi は `unidic` があればそちらを優先するので、そのままでは MeCab の初期化に失敗します。worker は起動時に、`unidic-lite` の辞書を指す `unidic` モジュールを差し込んで回避しています。

### spaCy のモデルを pip で取りに行く

misaki の英語処理は、初回に `en_core_web_sm` を pip でダウンロードしようとします。uv の環境には pip がないので、worker の依存に wheel の URL を直接書いています。

### 起動に失敗した子プロセスを kill しない

spawn に失敗した `ChildProcess` を止めようとして `kill()` を送ると、テストランナーとシェルごと落ちる現象がありました。pid 0(自分のプロセスグループ全体)に届いたと見ています。`tts.mjs` で pid が正の数のときだけ kill するようにしたところ、再現しなくなりました。
