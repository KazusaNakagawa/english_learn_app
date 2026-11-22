# 英語学習アプリ iOS 版

AI による例文生成と音声合成を組み合わせた、発音練習に特化した iOS アプリです（SwiftUI、iOS 17 以上）。ほかの版や全体像はリポジトリの [README](../README.md) を参照してください。

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

## ガイド

| やりたいこと | ガイド |
|------|------|
| ビルドして動かす（動作環境、設定ファイル、Xcode、OpenAI キー） | [docs/01_setup.md](docs/01_setup.md) |
| 実機（iPhone）で動かす | [docs/02_device_testing.md](docs/02_device_testing.md) |
| シミュレーターで確認する | [docs/05_simulator-testing.md](docs/05_simulator-testing.md) |
| 画面ごとの使い方、連続再生、権限 | [docs/04_usage.md](docs/04_usage.md) |
| 設定画面（音声、ずんだもん、OpenAI、例文生成の条件） | [docs/06_settings.md](docs/06_settings.md) |
| 検索・編集・ゴミ箱 | [docs/07_word_management.md](docs/07_word_management.md) |
| 単語データ（JSON）を直接編集する | [docs/03_add_words.md](docs/03_add_words.md) |
| 使っている音声とクレジット表記 | [docs/voices.md](../docs/voices.md) |

困ったときは、各ガイドの「トラブルシューティング」を見てください。ビルドは 01、音声認識と再生は 04、ずんだもんと例文生成は 06 にあります。

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
