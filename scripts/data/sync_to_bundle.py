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

REQUIRED_KEYS = {"id", "word", "meaning", "phonetic", "sentences"}

with SRC.open(encoding="utf-8") as f:
    data = json.load(f)

if not isinstance(data, dict) or "words" not in data or not isinstance(data["words"], list):
    raise ValueError("Invalid source format: expected {'words': [...]} at root")

# createdAt は Swift モデルで optional なので除去して軽量化する（なくても動く）
words = []
for idx, w in enumerate(data["words"]):
    missing = REQUIRED_KEYS - set(w.keys())
    if missing:
        raise ValueError(f"words[{idx}] missing keys: {sorted(missing)}")
    entry = {k: v for k, v in w.items() if k != "createdAt"}
    words.append(entry)

output = {"words": words}

# アトミック書き込み: 一時ファイルに書き出してからリネームすることで
# 部分書き込みによる Resources/words.json の破損を防ぐ
tmp = DST.with_suffix(".json.tmp")
try:
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    tmp.replace(DST)
except Exception:
    tmp.unlink(missing_ok=True)
    raise

print(f"Synced {len(words)} words → {DST.relative_to(REPO_ROOT)}")
