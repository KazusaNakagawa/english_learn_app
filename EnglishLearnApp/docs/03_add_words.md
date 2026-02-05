# 単語・例文の追加方法

## 概要

単語データは `EnglishLearnApp/Resources/words.json` に保存されています。
このファイルを編集することで、新しい単語や例文を追加できます。

## JSONファイルの場所

```
EnglishLearnApp/
└── EnglishLearnApp/
    └── Resources/
        └── words.json    ← このファイルを編集
```

## データ形式

### 単語の構造

```json
{
  "id": "一意のUUID",
  "word": "英単語",
  "meaning": "日本語訳",
  "phonetic": "発音記号",
  "sentences": [
    // 例文の配列
  ]
}
```

### 例文の構造

```json
{
  "id": "一意のUUID",
  "english": "英語の例文",
  "japanese": "日本語訳",
  "category": "カテゴリ名"
}
```

## 新しい単語を追加する手順

### 1. UUIDを生成

ターミナルで以下を実行してUUIDを生成：

```bash
uuidgen
```

または、オンラインのUUID生成ツールを使用

### 2. words.jsonに追加

`words.json` の `"words"` 配列に新しい単語を追加：

```json
{
  "words": [
    // 既存の単語...
    ,
    {
      "id": "生成したUUID",
      "word": "新しい単語",
      "meaning": "日本語の意味",
      "phonetic": "発音記号",
      "sentences": [
        {
          "id": "例文用のUUID",
          "english": "Example sentence.",
          "japanese": "例文の日本語訳。",
          "category": "カテゴリ名"
        }
      ]
    }
  ]
}
```

### 3. Xcodeで再ビルド

1. Xcodeで `Cmd + B` でビルド
2. `Cmd + R` で実行

## 例：「hello」を追加する場合

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "word": "hello",
  "meaning": "こんにちは",
  "phonetic": "həˈloʊ",
  "sentences": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "english": "Hello, how are you?",
      "japanese": "こんにちは、お元気ですか？",
      "category": "挨拶"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "english": "Hello world!",
      "japanese": "ハローワールド！",
      "category": "プログラミング"
    }
  ]
}
```

## カテゴリの使い方

カテゴリは例文をグループ化するために使用します。同じカテゴリ名の例文は、アプリ内で一緒に表示されます。

例：
- 「一般的な使い方」
- 「ビジネス」
- 「カジュアル」
- 「フォーマル」

## 発音記号について

発音記号はIPA（国際音声記号）を使用します。
以下のサイトで確認できます：
- [Cambridge Dictionary](https://dictionary.cambridge.org/)
- [Oxford Learner's Dictionary](https://www.oxfordlearnersdictionaries.com/)

## 注意事項

- JSONの文法エラーがあるとアプリがクラッシュする可能性があります
- 編集後は必ずJSONの文法をチェックしてください
- オンラインのJSON Validatorを使用すると便利です

## data/フォルダからの変換

`data/` フォルダにあるマークダウンファイル（`.md`）から例文を追加する場合：

1. マークダウンから英語と日本語を抽出
2. 上記の形式に変換
3. `words.json` に追加

今後、自動変換スクリプトを追加予定です。
