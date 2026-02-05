# セットアップ手順

## 動作環境

- macOS
- Xcode 15以上
- iOS 17.0以上

## 1. Xcodeのインストール

1. App Storeを開く
2. 「Xcode」を検索
3. インストール（無料、約12GB）
4. インストール完了後、Xcodeを起動して利用規約に同意

## 2. プロジェクトを開く

### 方法A: Finderから
1. Finderで `EnglishLearnApp` フォルダを開く
2. `EnglishLearnApp.xcodeproj` をダブルクリック

### 方法B: ターミナルから
```bash
open EnglishLearnApp/EnglishLearnApp.xcodeproj
```

## 3. シミュレーターで実行

1. Xcode上部のデバイス選択で「iPhone 17」などを選択
2. 再生ボタン（▶）をクリック、または `Cmd + R`
3. シミュレーターが起動し、アプリが実行される

## 次のステップ

- 実機でテストする場合: [02_device_testing.md](./02_device_testing.md)
- 単語を追加する場合: [03_add_words.md](./03_add_words.md)
