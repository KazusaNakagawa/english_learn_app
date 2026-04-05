#!/usr/bin/env python3
"""
word_set.json を Resources/words.json へ同期するスクリプト。

使い方:
    python3 scripts/data/sync_to_bundle.py

これにより EnglishLearnApp/data/word_set.json の内容が
EnglishLearnApp/EnglishLearnApp/Resources/words.json に書き出され、
アプリの初期データとして使われるようになる。

※ Documents/words.json が端末に残っている場合はアプリ削除→再インストール後に
   バンドルの words.json が読み込まれる。
"""

import json
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "EnglishLearnApp" / "data" / "word_set.json"
DST = REPO_ROOT / "EnglishLearnApp" / "EnglishLearnApp" / "Resources" / "words.json"

with SRC.open(encoding="utf-8") as f:
    data = json.load(f)

# createdAt は Swift モデルで optional なので除去して軽量化する（なくても動く）
words = []
for w in data["words"]:
    entry = {k: v for k, v in w.items() if k != "createdAt"}
    words.append(entry)

output = {"words": words}

with DST.open("w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Synced {len(words)} words → {DST.relative_to(REPO_ROOT)}")
