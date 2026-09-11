---
name: deploy
description: AWS CDK で VOICEVOX バックエンドをデプロイする
disable-model-invocation: true
argument-hint: "<poc|dev|pro>"
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(cd:*)
---

# AWS CDK デプロイ

VOICEVOX TTS バックエンドを指定環境にデプロイします。

## 使い方

```bash
/deploy poc   # PoC 環境
/deploy dev   # 開発環境
/deploy pro   # 本番環境
```

## 手順

1. **aws ディレクトリに移動**
   ```bash
   cd aws
   ```

2. **依存関係をインストール** (初回のみ)
   ```bash
   npm install
   ```

3. **TypeScript をビルド**
   ```bash
   npm run build
   ```

4. **デプロイを実行**

   引数 `$ARGUMENTS` に応じて実行:

   - `poc`: `npm run deploy:poc`
   - `dev`: `npm run deploy:dev`
   - `pro`: `npm run deploy:pro`

## 環境別設定

| 環境 | Lambda メモリ | Rate Limit | Burst Limit |
|-----|--------------|-----------|-------------|
| poc | 2048 MB | 5 RPS | 10 |
| dev | 2048 MB | 10 RPS | 20 |
| pro | 3008 MB | 50 RPS | 100 |

## その他のコマンド

- **差分確認**: `npm run diff:$ARGUMENTS`
- **テンプレート生成**: `npm run synth:$ARGUMENTS`
- **スタック削除**: `npm run destroy:$ARGUMENTS`

## 前提条件

- AWS CLI が設定済み
- `npx cdk bootstrap` が実行済み（初回のみ）
- **Secrets Manager に API キーのシークレットが作成済み**（環境ごとに 1 回だけ）

API キーは環境変数では渡さない (#182)。スタックはシークレット名だけを持ち、
Authorizer Lambda が実行時に値を読む。そのため**未作成でも synth / deploy は成功する**が、
Authorizer が全リクエストを拒否し、CloudWatch Logs に
`Failed to read the API key secret` が出る。

```bash
# 環境ごとに 1 回だけ（スタックと同じリージョンに作る）
aws secretsmanager create-secret \
  --name /englishlearn/poc/voicevox/api-key \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-northeast-1
```

Slack 通知を使う場合は `/englishlearn/{env}/voicevox/slack-webhook-url` も作る。
未作成でもデプロイは通るが、アラート通知が飛ばなくなる（Lambda はログのみ出力）。

シークレットの値を変えるときは `put-secret-value` のみ。**再デプロイは不要**
（反映は API キーで最大約 10 分 — docs/02 参照）。

## 注意

- `pro` 環境へのデプロイは慎重に行うこと
- デプロイ前に `npm run diff:pro` で変更内容を確認推奨
