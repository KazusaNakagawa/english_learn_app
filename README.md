# 英語学習アプリ (EnglishLearnApp)

AI による例文生成と音声合成を組み合わせた、発音練習のためのアプリです。iOS 版と、ブラウザで動く Web 版があります。

https://github.com/user-attachments/assets/c3b27a16-7429-4013-9d7c-2de9c0098a28

> 連続再生モードの例。**前半：** © VOICEVOX: ずんだもん、**後半：** デフォルト音声

## 構成

| ディレクトリ | 内容 | 詳しい説明 |
|------|------|------|
| `EnglishLearnApp/` | iOS 版（SwiftUI、iOS 17+）。単語管理、読み上げ、発音チェック、連続再生、OpenAI での例文生成 | [EnglishLearnApp/README.md](EnglishLearnApp/README.md) |
| `web/` | Web 版（React + Vite、PWA）。単語データはブラウザに保存。ローカル音声（Kokoro）と Claude Code での例文生成に対応 | [web/README.md](web/README.md) |
| `launcher/` | ビルド済みの Web 版を手元で配信し、ブラウザを開くコマンド（npm には未公開） | [launcher/README.md](launcher/README.md) |
| `aws/` | ずんだもん音声（VOICEVOX エンジン）を AWS Lambda で動かす CDK スタックと、アカウントの IAM | [aws/README.md](aws/README.md) |

## はじめ方

| 版 | 手順 |
|------|------|
| Web 版（Node.js 20 以上） | ランチャーで起動: [web/README.md](web/README.md#ワンコマンドで起動ランチャー)。開発サーバー: [起動](web/README.md#起動) |
| iOS 版（macOS + Xcode 15 以上） | [EnglishLearnApp/docs/01_setup.md](EnglishLearnApp/docs/01_setup.md) |

## 音声

iOS の音声、ブラウザの音声、ずんだもん（VOICEVOX）、Web 版のローカル音声 Kokoro を使います。選択肢ごとの音声、クレジット表記（ずんだもんは必須）、ライセンスは [docs/voices.md](docs/voices.md) にまとめています。

## ドキュメント

| 場所 | 内容 |
|------|------|
| [EnglishLearnApp/docs/](EnglishLearnApp/docs/) | iOS 版のセットアップ、実機テスト、使い方、設定画面、単語管理 |
| [docs/web/](docs/web/) | Web 版のローカル音声（Kokoro）、ローカルの VOICEVOX、PWA、要件と設計 |
| [docs/](docs/) | ずんだもん音声のクラウド要件、Lambda のトラブルシューティング、API 認証、監視、IAM グループ設計 |
| [docs/voices.md](docs/voices.md) | 使っている音声とクレジット |
| [SECURITY.md](SECURITY.md) | 脆弱性の報告方法 |

## 開発の流れ

Issue を立て、`develop` からブランチを切り、`develop` への PR にします。iOS の `DEVELOPMENT_TEAM` を誤ってコミットしないよう、最初に `./scripts/setup-hooks.sh` を実行してください。詳しくは [CLAUDE.md](CLAUDE.md) を参照してください。
