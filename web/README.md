# 英語学習アプリ Web 版

ブラウザで動く版です（React + Vite + TypeScript、PWA）。単語データはブラウザの IndexedDB に保存し、サーバーは要りません。

できること:

- 単語の追加・編集・ゴミ箱（10 日間は復元可能）・アーカイブ
- iOS 版と同じ形式の JSON で単語データをインポート（追加 / 置き換え）・エクスポート
- 例文の読み上げ（ローカル音声 Kokoro / ずんだもん / ブラウザの音声）と連続再生、音声キャッシュ。どの設定でどの音声になるかは [使っている音声](../docs/voices.md)
- 意味・発音記号・例文の自動生成。このパソコンの Claude Code（Pro / Max プラン）で API キーなしで生成するか、OpenAI の API キーで生成します。例文生成の条件はプリセットで管理できます
- PWA としてインストールでき、単語一覧はオフラインでも開けます（[docs/web/pwa.md](../docs/web/pwa.md)）
- 設定画面からプライバシーポリシーと利用規約を開けます

> Web 版の API キー（OpenAI / VOICEVOX）は sessionStorage に保存されるため、タブを閉じると消えます。

## 動作環境

| 項目 | 要件 |
|------|------|
| 開発・ランチャー | Node.js 20 以上 + npm |
| ブラウザ | Chrome / Safari などのモダンブラウザ |
| ローカル音声（任意） | [uv](https://docs.astral.sh/uv/)。初回に約 1.5 GB をダウンロード。macOS は `espeak-ng` もあるとよい |

## 起動

Node.js 20 以上が必要です（Node.js 24 で動作確認）。

リポジトリのルートから実行します。

```bash
cd web
npm install
cp .env.example .env   # 初回のみ。中身は空のままでも動きます
npm run dev
```

ブラウザで http://localhost:5173/ を開くと、サンプルの単語が並んだ単語一覧が表示されます。単語データ、音声キャッシュ、設定は、開いた URL（ポート番号を含む）ごとに保存されます。別のポートで開くと、登録した単語は見えません。

## ワンコマンドで起動（ランチャー）

`launcher/` は、ビルド済みの Web 版を手元で配信してブラウザを開く npm パッケージです。npm にはまだ公開していないので、リポジトリから起動します。

```bash
cd launcher
node scripts/prepare-dist.mjs   # web/ をビルドして launcher/dist にコピー
npm start                       # http://127.0.0.1:5280/ で配信し、ブラウザを開く
```

- ポートは 5280 で固定です。開発サーバー（5173）とは URL が違うので、それぞれ別の単語データになります。
- 起動中にもう一度実行すると、ブラウザを開き直すだけで終了します。5280 を別のプログラムが使っているときはエラーで止まります。
- オプション（`--port` など）と公開の仕組み（未公開）は [launcher/README.md](../launcher/README.md) を参照してください。

## ローカル音声（Kokoro）

英語「男性」と日本語「女性」は、このパソコンで動かす [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) で読み上げます（英語 `am_echo`、日本語 `jf_alpha`）。ランチャーか `npm run dev` で開いたときだけ使えます。

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # uv をインストール（初回のみ）
brew install espeak-ng                              # 任意（macOS）。辞書にない英単語も Kokoro で読む
```

- uv を入れたら、ランチャー（または `npm run dev`）を Ctrl-C で止めて起動し直し、設定画面の「ローカル音声」で「再確認」を押します。
- 初回は Python のパッケージとモデル（合わせて約 1.5 GB）をダウンロードするため数分かかります。2 回目からは数秒で準備できます。
- 準備中や uv がないときは、ブラウザの音声で読みます。設定画面の「ローカル音声」に状態と対処が出ます。
- espeak-ng がないと、辞書にない英単語を含む文はブラウザの音声で読みます。
- 削除するときは `uv cache clean` を実行し、`~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M` を消します。

仕組みと注意点は [docs/web/local-tts-kokoro.md](../docs/web/local-tts-kokoro.md)、API の仕様は [launcher/README.md](../launcher/README.md) を参照してください。

## AI で例文を生成する（Claude Code）

単語の追加・編集画面の「AIで例文を生成」は、既定では、このパソコンの Claude Code を使います。API キーは要りません。生成には Pro / Max プランの利用枠を使います。

初回だけ、次の準備をします（macOS / Linux。Windows ではまだ動きません）。

1. Claude Code をインストールします: `npm install -g @anthropic-ai/claude-code`
2. ターミナルで `claude` を起動し、Pro または Max プランのアカウントでログインします
3. アプリをランチャー（`npm start`）か、`web/` の `npm run dev` で開きます

設定画面の「例文の生成方法」に「Claude Code（Pro プラン）で生成できます」と出れば準備完了です。モデルは Sonnet（既定）・Haiku・Opus から選べます。20 個の例文はおよそ 15 秒で生成できます。

| 画面の表示 | 原因と対処 |
|------|------|
| この画面では Claude Code で生成できません | ランチャーや `npm run dev` 以外（`vite preview` やほかのサーバー）で開いています。ランチャーで開き直してください |
| Claude Code がインストールされていません | 手順 1 を実行し、「再確認」を押します |
| Claude Code にログインしていません | 手順 2 を実行し、「再確認」を押します |
| Claude の利用上限に達しました | プランの上限に達しています。リセットされるまで待つか、Haiku を選んでください |

- OpenAI の API キーで生成する場合は、設定の「例文の生成方法」で OpenAI を選びます。
- ランチャーと開発サーバーは `/api/generate-sentences` で `claude -p` を起動します。従量課金にならないよう環境変数を外すこと、ほかのサイトから呼べないことなど、API の仕様は [launcher/README.md](../launcher/README.md#generating-sentences-with-claude-code) を参照してください。

## ずんだもん音声の接続先

接続先は、設定画面の「VOICEVOX設定」で入力します。入力した値は次の再生から使われ、再ビルドや開発サーバーの再起動は要りません。

| 使い方 | 設定画面の接続先 | API キー |
|------|------|------|
| ローカルの Docker | `http://127.0.0.1:50021` | 不要 |
| AWS（このリポジトリの CDK スタック） | API Gateway の URL | 必要 |
| 使わない | 空欄（`.env` にも接続先がないとき） | — |

- 欄が空のときは、`.env` の `VITE_VOICEVOX_ENDPOINT_POC` を既定の接続先として使います。`.env` の `VITE_VOICEVOX_API_KEY_POC` は、この既定の接続先にだけ送ります。
- 設定画面で入力した API キーは、入力したときの接続先にだけ送ります。
- 「接続テスト」で、つながるかと、API キーが正しいかを確かめられます。
- 接続先がない、つながらない、キーがないときは、ブラウザの音声で読みます。

ローカルの Docker でエンジンを動かす手順は [docs/web/local-voicevox.md](../docs/web/local-voicevox.md) を参照してください。

`web/.env` で `VITE_ZUNDAMON_AVATAR=true` にすると、ずんだもんの声で読んでいる間、画面右下に立ち絵が出ます。初期状態では出ません。画像の置き方は [docs/web/zundamon-avatar.md](../docs/web/zundamon-avatar.md) を参照してください。

## テスト・ビルド

```bash
cd web
npm test          # vitest
npx tsc -b        # 型チェック（ルートの tsconfig は参照だけなので -b が必要）
npm run lint
npm run build     # 型チェックと本番ビルド（dist/）
npm run preview   # ビルドしたものをローカルで確認
```

---

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| アプリ | React + Vite + TypeScript、PWA（vite-plugin-pwa）、IndexedDB（データ・音声キャッシュ） |
| 音声 | Kokoro-82M（ローカル、Python を uv で起動）、VOICEVOX、Web Speech API（フォールバック） |
| ランチャー | Node.js（依存なし）。`/api/generate-sentences`（Claude Code CLI）と `/api/tts`（Kokoro）を提供 |

---

## トラブルシューティング

### Web 版で Claude Code の例文生成が使えない場合

- 設定画面の「例文の生成方法」に出る案内に従ってください（[AI で例文を生成する（Claude Code）](#ai-で例文を生成するclaude-code)）
- ターミナルで `claude auth status` を実行し、`"loggedIn": true` になっているか確認します

### Web 版でローカル音声（Kokoro）にならない場合

- 設定画面の「ローカル音声」に出る案内に従ってください（[ローカル音声](#ローカル音声kokoro)）
- 英語は「男性」、日本語は「女性」を選んでいるか確認します。ほかの選択肢はローカル音声を使いません
- 初回は準備に数分かかり、その間はブラウザの音声で読みます

