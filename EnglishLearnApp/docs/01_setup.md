# セットアップ手順

## 動作環境

| 項目 | 要件 |
|------|------|
| 開発環境 | macOS + Xcode 15 以上 |
| 実行環境 | iOS 17.0 以上（シミュレーター / 実機） |

## 1. Xcodeのインストール

1. App Storeを開く
2. 「Xcode」を検索
3. インストール（無料、約12GB）
4. インストール完了後、Xcodeを起動して利用規約に同意

## 2. リポジトリのクローン

```bash
git clone https://github.com/KazusaNakagawa/english_learn_app.git
cd english_learn_app
```

## 3. 設定ファイルの作成

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
> API キーの取得方法は [docs/02.voicevox_api_authentication.md](../../docs/02.voicevox_api_authentication.md) を参照してください。

> ⚠️ `AppConfig.swift` / `Config.xcconfig` には秘密情報を含める可能性があります。
> これらのファイルは `.gitignore` で管理されており、**絶対にコミットしない** でください。
> 万が一 API キーが漏えいした場合は、ただちに無効化・再発行してください。

## 4. プロジェクトを開く

### 方法A: Finderから
1. Finderで `EnglishLearnApp` フォルダを開く
2. `EnglishLearnApp.xcodeproj` をダブルクリック

### 方法B: ターミナルから
```bash
open EnglishLearnApp/EnglishLearnApp.xcodeproj
```

## 5. シミュレーターで実行

1. Xcode上部のデバイス選択で「iPhone 17」などを選択
2. 再生ボタン（▶）をクリック、または `Cmd + R`
3. シミュレーターが起動し、アプリが実行される

クリーンビルドは `Cmd + Shift + K` です。シミュレーターでの確認項目は [05_simulator-testing.md](./05_simulator-testing.md) を参照してください。

## 6. OpenAI API キーの設定（任意）

アプリを起動するとオンボーディング画面が表示されます。
OpenAI の API キーを入力すると、単語追加時に例文を自動生成できます。
スキップして後から設定画面で入力することも可能です（[06_settings.md](./06_settings.md#3-openai-api設定)）。

> API キーは iOS Keychain に安全に保存されます。

## トラブルシューティング

### ビルドエラーが出る場合

- `AppConfig.swift` と `Config.xcconfig` が存在するか確認してください
- `Product > Clean Build Folder`（`Cmd + Shift + K`）を実行してから再ビルド
- Xcode を最新版にアップデート

## 次のステップ

- 実機でテストする場合: [02_device_testing.md](./02_device_testing.md)
- アプリの使い方: [04_usage.md](./04_usage.md)
- 単語データを直接編集する場合: [03_add_words.md](./03_add_words.md)
