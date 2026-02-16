# 実機（iPhone）でのテスト手順

## 前提条件

- Mac と iPhone
- USBケーブル（Lightning または USB-C）
- Apple ID（無料でOK）

## 手順

### 1. iPhoneをMacに接続

1. USBケーブルでiPhoneをMacに接続
2. iPhone側で「このコンピュータを信頼しますか？」と表示されたら **「信頼」** をタップ
3. iPhoneのパスコードを入力

### 2. Apple IDでXcodeにサインイン

1. Xcodeメニュー → **Settings**（または `Cmd + ,`）
2. **Accounts** タブを選択
3. 左下の **「+」** ボタンをクリック
4. **Apple ID** を選択
5. Apple IDとパスワードを入力してサインイン

### 3. 署名の設定

1. Xcode左側のプロジェクトナビゲーターで **「EnglishLearnApp」**（青いアイコン）をクリック
2. 中央のエリアで **TARGETS** の「EnglishLearnApp」を選択
3. **Signing & Capabilities** タブを選択
4. **Team** のドロップダウンから自分の名前（Personal Team）を選択
5. **「Automatically manage signing」** にチェックが入っていることを確認

> エラーが出る場合は、Bundle Identifierを `com.yourname.EnglishLearnApp` のように変更してください

### 4. 実行先をiPhoneに変更

1. Xcode上部のデバイス選択（「iPhone 17」などと表示されている部分）をクリック
2. **接続したiPhoneの名前** を選択

### 5. アプリをインストール・実行

1. 再生ボタン（▶）をクリック、または `Cmd + R`
2. 初回はビルドとインストールに時間がかかります

### 6. デベロッパを信頼（初回のみ）

初回インストール時、iPhoneで以下の操作が必要です：

1. **設定** アプリを開く
2. **一般** → **VPNとデバイス管理**
3. 「デベロッパAPP」の下に表示される自分のApple IDをタップ
4. **「○○を信頼」** をタップ
5. 確認ダイアログで **「信頼」** をタップ

### 7. アプリを起動

ホーム画面に追加された「EnglishLearnApp」をタップして起動

## 権限の許可

初回起動時に以下の許可を求められます：

- **マイク** → 「OK」をタップ（発音チェックに使用）
- **音声認識** → 「OK」をタップ（発音認識に使用）

## トラブルシューティング

### 「Untrusted Developer」と表示される
→ 手順6のデベロッパ信頼を行ってください

### 「Unable to install」エラー
→ iPhone側でストレージ容量を確認してください

### 「Failed Registering Bundle Identifier」エラー

バンドルIDが無効な場合に発生します。

- **原因:** `icloud.com.*` など Apple が予約しているプレフィックスを使用している
- **解決:** 逆ドメイン形式のユニークなIDに変更する（例: `com.yourname.WordCraft`）
- **設定箇所:** Signing & Capabilities → Bundle Identifier、または `project.pbxproj` 内の `PRODUCT_BUNDLE_IDENTIFIER`（Debug / Release 両方）

### 「No profiles for '...' were found」エラー

プロビジョニングプロファイルが見つからない場合に発生します。

**「Communication with Apple failed — Your team has no devices」と表示される場合:**

実機が登録されていないことが原因です。

1. iPhoneをUSBケーブルでMacに接続する
2. iPhone側で「このコンピュータを信頼」をタップ
3. iPhoneの **デベロッパモード** を有効にする
   - 設定 → プライバシーとセキュリティ → デベロッパモード → ON
4. Xcodeの上部でターゲットデバイスに **接続したiPhone** を選択
5. Signing & Capabilities の「**Try Again**」をクリック

> デバイスが接続されていればプロビジョニングプロファイルが自動生成されます。

**その他の場合:**

1. Xcode → Settings (⌘+,) → Accounts でApple IDがサインインされているか確認
2. 「Automatically manage signing」のチェックを一度外して再度チェックする
3. Teamが正しく選択されているか確認

### 署名エラーが出る

1. Bundle Identifierを変更（例: `com.yourname.WordCraft`）
2. Teamが正しく選択されているか確認

### 7日後にアプリが起動しなくなった
→ 無料Apple IDの制限です。Xcodeから再度インストールしてください

## 注意事項

- 無料のApple IDでは、アプリは **7日間** のみ有効
- 7日経過後は、再度Xcodeからインストールが必要
- 有料のApple Developer Program（年額12,800円）に登録すると、この制限がなくなります
