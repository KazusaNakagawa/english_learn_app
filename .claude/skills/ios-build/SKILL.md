---
name: ios-build
description: iOS アプリ (EnglishLearnApp) をビルド・実行する
disable-model-invocation: true
argument-hint: "[clean]"
allowed-tools: Bash(open:*), Bash(xcodebuild:*)
---

# iOS アプリのビルド

EnglishLearnApp を Xcode でビルド・実行します。

## 手順

1. **Xcode プロジェクトを開く**
   ```bash
   open EnglishLearnApp/EnglishLearnApp.xcodeproj
   ```

2. **ビルド・実行**
   - Xcode で `Cmd + R` を押してビルド・実行
   - または `Cmd + B` でビルドのみ

3. **クリーンビルド** (引数に `clean` を指定した場合)
   - Xcode で `Cmd + Shift + K` でクリーン
   - その後 `Cmd + R` で再ビルド

## 要件

- macOS + Xcode 15+
- iOS 17.0+ ターゲット

## 設定ファイル

ビルド前に以下のファイルが必要:

- `EnglishLearnApp/EnglishLearnApp/AppConfig.swift` - `AppConfig.swift.example` からコピー
- `EnglishLearnApp/Config.xcconfig` - `Config.xcconfig.example` からコピー

## 引数

- `clean` - クリーンビルドを実行
- (なし) - 通常ビルド
