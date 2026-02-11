# 単語管理機能（検索・編集・ゴミ箱）

## 概要

単語リスト画面に以下の3つの機能を追加しました。

| 機能 | 説明 |
|---|---|
| 検索 | 単語・意味・発音記号でリストを絞り込む |
| 編集 | 登録済み単語の word / meaning / phonetic を変更する |
| ゴミ箱 | 削除した単語を10日間保持し、復元または完全削除できる |

---

## 検索

### 操作方法

単語リスト画面の上部に表示される検索バーに文字を入力すると、リアルタイムで絞り込みが行われます。

- **対象フィールド**: 英単語 / 意味 / 発音記号
- **大文字・小文字**: 区別しない（case-insensitive）

### 実装詳細

`WordListView` 内の `filteredWords` 計算プロパティが検索を担当します。

```swift
private var filteredWords: [Word] {
    if searchText.isEmpty { return words }
    let query = searchText.lowercased()
    return words.filter {
        $0.word.lowercased().contains(query) ||
        $0.meaning.lowercased().contains(query) ||
        $0.phonetic.lowercased().contains(query)
    }
}
```

---

## 編集

### 操作方法

単語リストの行を **右にスワイプ** → 「編集」ボタンをタップすると編集シートが開きます。

- 変更できる項目: 英単語 / 意味 / 発音記号
- 例文（sentences）と削除日時（deletedAt）は編集画面では変更されません
- 「保存」ボタンで確定、「キャンセル」で破棄

### 実装詳細

`EditWordView` が編集フォームを提供し、保存時に `WordDataManager.updateWord(_:)` を呼びます。

```swift
// WordListView.swift
.swipeActions(edge: .leading) {
    Button { wordToEdit = word } label: {
        Label("編集", systemImage: "pencil")
    }
    .tint(.orange)
}
.sheet(item: $wordToEdit) { word in
    EditWordView(word: word) { updatedWord in
        WordDataManager.shared.updateWord(updatedWord)
        words = WordDataManager.shared.loadWords()
    }
}
```

---

## ゴミ箱

### 操作方法

#### 単語をゴミ箱へ移動

単語リストの行を **左にスワイプ** → 「ゴミ箱へ」ボタンをタップします。
単語はリストから消えますが、**10日間はゴミ箱に残ります**。

#### ゴミ箱を開く

単語リスト画面の左上にあるゴミ箱アイコン（`trash`）をタップします。

#### ゴミ箱内の操作

| スワイプ方向 | アクション |
|---|---|
| 右スワイプ（leading） | 元に戻す（アクティブに復元） |
| 左スワイプ（trailing） | 完全削除（確認ダイアログあり） |

各行には「あとN日で完全削除」と残り日数が表示されます。

### 自動パージ

`loadWords()` を呼び出すたびに、削除から10日を超えた単語は自動的に完全削除されます。

### 実装詳細

ソフトデリートは `Word.deletedAt: Date?` フィールドで管理します。

```swift
// Word.swift
struct Word: Codable, Identifiable {
    let id: UUID
    var word: String
    var meaning: String
    var phonetic: String
    var sentences: [Sentence]
    var deletedAt: Date?   // nil = アクティブ、non-nil = ゴミ箱
}
```

`WordDataManager` の主なメソッド:

| メソッド | 説明 |
|---|---|
| `loadWords()` | アクティブ単語のみ返す + 10日超過分を自動パージ |
| `loadAllWords()` | 全単語（アクティブ + ゴミ箱）を返す |
| `loadTrashWords()` | ゴミ箱内の単語（10日以内）を返す |
| `saveAllWords(_:)` | 全単語を Documents に保存 |
| `moveToTrash(wordId:)` | `deletedAt = Date()` に設定 |
| `restoreFromTrash(wordId:)` | `deletedAt = nil` に設定 |
| `permanentlyDelete(wordId:)` | 配列から完全削除 |
| `updateWord(_:)` | ID で検索して全フィールドを上書き |

### データの後方互換性

`deletedAt` は `Optional` なため、既存の `words.json`（`deletedAt` キーなし）はそのままデコードできます。デコード時に `nil` として扱われます。

---

## 関連ファイル

```text
EnglishLearnApp/
└── EnglishLearnApp/
    ├── Models/
    │   └── Word.swift          # Word struct + WordDataManager
    └── Views/
        ├── WordListView.swift  # 検索・スワイプアクション・ゴミ箱ボタン
        ├── EditWordView.swift  # 単語編集フォーム（新規）
        └── TrashView.swift     # ゴミ箱画面（新規）
```
