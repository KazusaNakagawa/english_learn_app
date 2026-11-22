# 使っている音声とクレジット

設定画面の選択肢ごとに、実際に読み上げる音声は次のとおりです。

| 設定 | iOS 版 | Web 版 |
|------|--------|--------|
| 英語「男性」（Web 版の既定） | iOS の男性音声 | **Kokoro-82M の `am_echo`**（このパソコンで生成） |
| 英語「女性」 | iOS の女性音声 | ブラウザの女性音声 |
| 英語「デフォルト」 | iOS の標準音声 | ブラウザの標準音声 |
| 日本語「女性」（Web 版の既定） | —（iOS 版にはない選択肢） | **Kokoro-82M の `jf_alpha`**（このパソコンで生成） |
| 日本語「デフォルト」 | iOS の標準音声 | ブラウザの標準音声 |
| 英語・日本語「ずんだもん」 | VOICEVOX（AWS の API） | VOICEVOX（Docker か AWS。[接続先](../web/README.md#ずんだもん音声の接続先)） |

- **Kokoro**（Web 版のローカル音声）は、ランチャーか `npm run dev` で開いたときに、このパソコンの中で音声を作ります。無料で、API キーは要らず、文章を外部に送りません。[uv](https://docs.astral.sh/uv/) が必要です（[ローカル音声](../web/README.md#ローカル音声kokoro)）。
- 音声を作れないときは、同じ性別のブラウザの音声で読みます。準備中、uv がない、静的サーバーで開いた、などの場合です。
- 生成した音声は IndexedDB にキャッシュし、2 回目からはすぐに再生します。

## クレジットとライセンス

| 音声 | ライセンス | 表記 |
|------|-----------|------|
| VOICEVOX:ずんだもん | [ずんだもん音源利用規約](https://zunko.jp/con_ongen_kiyaku.html)、[VOICEVOX 利用規約](https://voicevox.hiroshiba.jp/term/) | **必須**。商用・非商用とも「VOICEVOX:ずんだもん」。アプリでは設定画面に表示しています |
| Kokoro-82M（`am_echo` / `jf_alpha`） | Apache-2.0（[モデルカード](https://huggingface.co/hexgrad/Kokoro-82M)） | 義務なし。モデルはアプリに同梱せず、初回に Hugging Face から取得します |
| espeak-ng（任意。Kokoro が辞書にない英単語を読むため） | GPL-3.0 | 利用者が `brew install` で入れるもので、アプリには同梱しません |

> Kokoro の日本語の声のうち `jf_gongitsune` / `jf_nezumi` / `jf_tebukuro` / `jm_kumo` は CC BY 3.0 のデータ（Koniwa）から作られており、作者名の表記が必要です。この 4 つに切り替える場合は表記を追加してください。

仕組みと計測結果は [web/local-tts-kokoro.md](web/local-tts-kokoro.md) を参照してください。
