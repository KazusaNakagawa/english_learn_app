# 英語学習アプリ (EnglishLearnApp)

AI による例文生成と音声合成を組み合わせた、発音練習に特化した iOS アプリです。ブラウザで動く [Web 版](#web-版ブラウザ) もあります。

## 機能一覧

### 単語管理
- **単語リスト** — 英単語・発音記号・日本語訳の一覧表示
- **単語追加** — 手動入力 または OpenAI API による例文の自動生成
- **単語編集** — 既存の単語・例文を編集
- **アーカイブ** — 習得済み単語を別管理（一覧から非表示）
- **ゴミ箱** — ソフトデリート（削除後 10 日間は復元可能）

### 音声・発音練習
- **音声読み上げ (TTS)** — iOS ネイティブ音声（デフォルト / 女性 / 男性）
- **ずんだもん音声** — VOICEVOX による高品質な日本語・英語 TTS（AWS Lambda 経由）
- **発音チェック** — マイクで録音し、正解 / 惜しい / 不正解を判定（SFSpeechRecognizer）

### 連続再生
- **連続再生モード** — バイリンガル（英→日→英）または 英語のみ（英→英）を選択可能
- **再生キュー** — 複数の単語・例文をまとめてキューに追加
- **フルプレイヤー** — キューの並び替え（ドラッグ）、個別削除、タップで指定箇所から再生
- **ミニプレイヤー** — 画面下部に常駐する再生コントロール
- **ロック画面対応** — Now Playing 情報・リモートコントロール（前後スキップ、一時停止）

### 検索・フィルタ・ソート
- **全文検索** — 単語・日本語訳・発音記号を横断検索
- **頭文字フィルタ** — A〜Z のクイックフィルタ
- **カテゴリフィルタ** — 例文カテゴリで絞り込み
- **ソート** — アルファベット順 / 登録日順 / 例文数順

### 一括操作
- **複数選択** — チェックボックスで複数の単語を選択
- **まとめてアーカイブ / ゴミ箱移動**
- **スワイプ操作** — 右スワイプで編集、左スワイプでアーカイブ / ゴミ箱

### AI・設定
- **OpenAI 連携** — 単語追加時に例文を自動生成（GPT-4o / GPT-4o mini など選択可）
- **プロンプトプリセット** — 例文生成条件を最大 10 件まで管理（組み込み＋カスタム）
- **データエクスポート / インポート** — 単語データを JSON 形式でバックアップ・移行
- **音声キャッシュ管理** — VOICEVOX 音声のキャッシュサイズ確認・クリア（設定画面）

---

## 動作環境

| 項目 | 要件 |
|------|------|
| 開発環境 | macOS + Xcode 15 以上 |
| 実行環境 | iOS 17.0 以上（シミュレーター / 実機） |
| Web 版の開発環境 | Node.js 20 以上 + npm |
| Web 版の実行環境 | Chrome / Safari などのモダンブラウザ |

---

## デモ動画

**連続再生モード** での実際の使用例です：

https://github.com/user-attachments/assets/c3b27a16-7429-4013-9d7c-2de9c0098a28

> **前半：** © VOICEVOX: ずんだもん での連続再生  
> **後半：** デフォルト音声での連続再生

---

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone https://github.com/KazusaNakagawa/english_learn_app.git
cd english_learn_app
```

### 2. 設定ファイルの作成

ビルド前に **2 つのファイル** をサンプルからコピーして作成する必要があります。

```bash
cp EnglishLearnApp/EnglishLearnApp/AppConfig.swift.example \
   EnglishLearnApp/EnglishLearnApp/AppConfig.swift

cp EnglishLearnApp/EnglishLearnApp/Config.xcconfig.example \
   EnglishLearnApp/EnglishLearnApp/Config.xcconfig
```

| ファイル | 設定内容 |
|---------|---------|
| `AppConfig.swift` | VOICEVOX API の Base URL・API キー |
| `Config.xcconfig` | Xcode ビルド設定（Development Team など） |

> ずんだもん音声を使わない場合、`AppConfig.swift` は空欄のままで構いません。
> API キーの取得方法は [docs/02.voicevox_api_authentication.md](docs/02.voicevox_api_authentication.md) を参照してください。

> ⚠️ `AppConfig.swift` / `Config.xcconfig` には秘密情報を含める可能性があります。
> これらのファイルは `.gitignore` で管理されており、**絶対にコミットしない** でください。
> 万が一 API キーが漏えいした場合は、ただちに無効化・再発行してください。

### 3. Xcode でビルド・実行

```bash
open EnglishLearnApp/EnglishLearnApp.xcodeproj
```

- ビルド: `Cmd + R`
- クリーン: `Cmd + Shift + K`

### 4. OpenAI API キーの設定（任意）

アプリを起動するとオンボーディング画面が表示されます。
OpenAI の API キーを入力すると、単語追加時に例文を自動生成できます。
スキップして後から設定画面で入力することも可能です。

> API キーは iOS Keychain に安全に保存されます。

---

## 使い方

### 単語リスト画面

- 検索バーで単語・日本語訳・発音記号を横断検索
- 頭文字バーまたはカテゴリチップでフィルタ
- ▶ ボタンで連続再生開始
- 右スワイプ → 編集、左スワイプ → アーカイブ / ゴミ箱

### 単語追加画面

1. 英単語を入力
2. 「例文を生成」をタップ → OpenAI が例文・日本語訳・発音記号を自動入力
3. 内容を確認して「保存」

### 例文一覧画面

- 例文がカテゴリ別に表示されます
- 例文の ▶ をタップ → その例文からキューに追加して連続再生開始
- 例文をタップ → 発音練習画面へ
- 連続再生中は再生中の例文まで自動スクロール

### 発音練習画面

1. 「英語を聞く」でお手本を再生
2. マイクボタンをタップして発音
3. 判定結果：**完璧！** / **惜しい！** / **もう一度練習しましょう**

### 連続再生（フルプレイヤー）

- ミニプレイヤーをタップして全画面表示
- 再生中の行まで自動スクロール
- ドラッグで順番を入れ替え、スワイプで個別削除
- ロック画面からも操作可能

### 設定画面

| セクション | 設定内容 |
|-----------|---------|
| 英語の音声 | デフォルト / 女性 / 男性 / ずんだもん |
| 日本語の音声 | ずんだもん / デフォルト |
| 連続再生 | モード（バイリンガル / 英語のみ）、例文間の間隔（0.5〜3.0 秒） |
| OpenAI API | APIキー入力、使用モデル選択 |
| VOICEVOX | ずんだもんのスタイル（ノーマル / あまあま / ツンツン / セクシー / ささやき / ヒソヒソ） |
| 例文生成条件 | プロンプトプリセットの選択・管理 |
| データ管理 | JSON エクスポート / インポート、音声キャッシュのクリア |

---

## 収録単語（初期データ）

| 単語 | 意味 | 例文数 |
|------|------|--------|
| rarity | 珍しさ・希少性 | 30 |
| these days | 最近、この頃 | 15 |
| experience | 経験、体験 | 40 |
| perspective | 視点・観点 | 12 |
| accomplish | 達成する・成し遂げる | 12 |
| remarkable | 注目すべき・素晴らしい | 10 |
| challenge | 挑戦・困難 | 12 |
| opportunity | 機会・チャンス | 12 |

単語・例文は JSON エクスポート / インポートで追加・移行できます。

---

## 権限について

初回起動時に以下の許可が必要です：

| 権限 | 用途 |
|------|------|
| マイク | 発音の録音 |
| 音声認識 | 発音の正誤判定 |

許可しない場合、発音チェック機能は使用できません（それ以外の機能は正常に動作します）。

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| UI フレームワーク | SwiftUI（iOS 17+） |
| 音声合成 (TTS) | AVSpeechSynthesizer（ネイティブ）/ VOICEVOX HTTP API |
| 音声認識 (STT) | SFSpeechRecognizer（en-US） |
| AI 例文生成 | OpenAI Chat Completions API（structured output） |
| セキュアストレージ | iOS Keychain（API キー保管） |
| ロック画面連携 | MediaPlayer framework（Now Playing / Remote Command） |
| ネットワーク監視 | Network framework（NWPathMonitor） |
| クラウド TTS 基盤 | AWS Lambda + API Gateway（VOICEVOX エンジン） |
| インフラ管理 | AWS CDK（TypeScript） |
| Web 版 | React + Vite + TypeScript、IndexedDB（データ保存）、Web Speech API（音声） |

---

## トラブルシューティング

### ビルドエラーが出る場合

- `AppConfig.swift` と `Config.xcconfig` が存在するか確認してください
- `Product > Clean Build Folder`（`Cmd + Shift + K`）を実行してから再ビルド
- Xcode を最新版にアップデート

### 音声認識が動かない場合

- 設定アプリ → EnglishLearnApp でマイク・音声認識の権限が許可されているか確認
- 音声認識はサーバー処理のため、実機ではインターネット接続が必要
- シミュレーターではマイク機能に制限があります（実機での使用を推奨）

### ずんだもん音声が出ない場合

- `AppConfig.swift` に VOICEVOX の Base URL と API キーが設定されているか確認
- 設定 → 英語の音声 / 日本語の音声で「ずんだもん」が選択されているか確認
- 詳細は [docs/02.voicevox_api_authentication.md](docs/02.voicevox_api_authentication.md) を参照

### OpenAI 例文生成が失敗する場合

- 設定画面で OpenAI API キーが入力されているか確認
- API キーの使用制限・クレジット残高を OpenAI ダッシュボードで確認

---

## Web 版（ブラウザ）

`web/` に、ブラウザで動く版があります（React + Vite）。単語データはブラウザの IndexedDB に保存し、サーバーは要りません。

できること:

- 単語の追加・編集・ゴミ箱（10 日間は復元可能）・アーカイブ
- iOS 版と同じ形式の JSON で単語データをインポート（追加 / 置き換え）・エクスポート
- 例文の読み上げ（ずんだもん / ブラウザの音声）と連続再生、音声キャッシュ
- OpenAI API による例文の自動生成（API キーを設定画面で入力）

> Web 版の API キー（OpenAI / VOICEVOX）は sessionStorage に保存されるため、タブを閉じると消えます。

### 起動

Node.js 20 以上が必要です（Node.js 24 で動作確認）。

```bash
cd web
npm install
cp .env.example .env   # 初回のみ。中身は空のままでも動きます
npm run dev
```

ブラウザで http://localhost:5173/ を開くと、サンプルの単語が並んだ単語一覧が表示されます。単語データ、音声キャッシュ、設定は、開いた URL（ポート番号を含む）ごとに保存されます。別のポートで開くと、登録した単語は見えません。

### ワンコマンドで起動（ランチャー）

`launcher/` は、ビルド済みの Web 版を手元で配信してブラウザを開く npm パッケージです。

```bash
cd launcher
node scripts/prepare-dist.mjs   # web/ をビルドして launcher/dist にコピー
npm start                       # http://127.0.0.1:5280/ で配信し、ブラウザを開く
```

- ポートは 5280 で固定です。開発サーバー（5173）とは URL が違うので、それぞれ別の単語データになります。
- 起動中にもう一度実行すると、ブラウザを開き直すだけで終了します。5280 を別のプログラムが使っているときはエラーで止まります。
- 公開は `launcher/` で `npm publish` です。毎回 `web/` を作り直し、そのとき `VITE_APP_VERSION` / `VITE_APP_ENV` 以外の `VITE_*`（VOICEVOX の接続先と API キーなど）を空にします。`web/.env*` の値がバンドルに残っていれば中止します。詳しくは [launcher/README.md](launcher/README.md)。

### ずんだもん音声の接続先

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

ローカルの Docker でエンジンを動かす手順は [docs/web/local-voicevox.md](docs/web/local-voicevox.md) を参照してください。

### テスト・ビルド

```bash
cd web
npm test          # vitest
npx tsc -b        # 型チェック（ルートの tsconfig は参照だけなので -b が必要）
npm run lint
npm run build     # 型チェックと本番ビルド（dist/）
npm run preview   # ビルドしたものをローカルで確認
```

---

## AWS インフラ（VOICEVOX バックエンド）

VOICEVOX エンジンを AWS Lambda 上で動かすための CDK スタックです。

```bash
cd aws
npm install
npm run deploy:poc   # poc 環境へデプロイ
```

環境ごとの設定:

| 環境 | Lambda メモリ | レートリミット |
|------|-------------|--------------|
| poc | 2048 MB | 5 RPS |
| dev | 2048 MB | 10 RPS |
| pro | 3008 MB | 50 RPS |

詳細は [docs/00.zundamon_voice_cloud_requirements.md](docs/00.zundamon_voice_cloud_requirements.md) を参照してください。
