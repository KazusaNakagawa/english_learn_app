# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "kokoro==0.9.4",
#   "misaki[en,ja]==0.9.4",
#   "unidic-lite==1.0.8",
#   # misaki downloads this with pip at first use, and a uv environment has no pip.
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""Local Kokoro TTS for the launcher (launcher/lib/tts.mjs runs it with `uv run --script`).

Protocol: one JSON object per line.
  stdin   {"id": 1, "text": "...", "lang": "en" | "ja"}
  stdout  {"ready": true}                      once, after the models are loaded
          {"id": 1, "wav": "<base64>"}          16-bit mono WAV
          {"id": 1, "error": "unsupported-text" | "failed", "message": "..."}
Everything else the libraries print goes to stderr. EOF on stdin ends the process.
"""
import base64
import io
import json
import os
import platform
import sys
import wave

VOICES = {"en": ("a", "am_echo"), "ja": ("j", "jf_alpha")}
SAMPLE_RATE = 24000

# The protocol owns the real stdout; anything a library prints lands on stderr.
_out = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr


def send(obj):
    _out.write(json.dumps(obj, ensure_ascii=False) + "\n")
    _out.flush()


# fugashi prefers the full `unidic`, which misaki[ja] installs without its
# dictionary (a separate 770 MB download). A stand-in pointing at unidic-lite's
# dictionary takes its place.
def use_unidic_lite():
    import types
    import unidic_lite

    sys.modules["unidic"] = types.SimpleNamespace(DICDIR=unidic_lite.DICDIR)


use_unidic_lite()

SYSTEM_ESPEAK = [
    "/opt/homebrew/lib/libespeak-ng.dylib",
    "/usr/local/lib/libespeak-ng.dylib",
]


def configure_espeak():
    """Pick the espeak-ng that misaki uses for English words missing from its dictionary.

    The macOS build bundled in espeakng-loader 0.2.4 ignores the data path it is
    given and calls exit() on its first use, so on macOS only a system copy is
    used. Without one, English runs with no fallback and unknown words are
    reported as unsupported-text instead of being dropped silently.
    Returns True when a fallback is available.
    """
    if platform.system() != "Darwin":
        return True
    import espeakng_loader

    # KOKORO_ESPEAK_LIBRARY overrides the search; "none" turns the fallback off.
    override = os.environ.get("KOKORO_ESPEAK_LIBRARY")
    candidates = [] if override == "none" else [override] if override else SYSTEM_ESPEAK
    lib = next((p for p in candidates if os.path.exists(p)), None)
    if lib is None:
        import misaki.espeak

        class NoFallback:
            def __init__(self, *args, **kwargs):
                raise RuntimeError("espeak-ng is not installed")

        misaki.espeak.EspeakFallback = NoFallback
        return False
    data = os.path.join(os.path.dirname(os.path.dirname(lib)), "share", "espeak-ng-data")
    espeakng_loader.get_library_path = lambda: lib
    espeakng_loader.get_data_path = lambda: data
    return True


def to_wav(audio):
    import numpy as np

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)
    return buf.getvalue()


def has_unknown_words(result):
    # With no fallback, misaki gives a word it cannot read empty phonemes (unk='').
    return any(t.text.strip() and any(c.isalpha() for c in t.text) and not t.phonemes for t in result.tokens or [])


def main():
    fallback = configure_espeak()
    from kokoro import KModel, KPipeline
    import numpy as np

    model = KModel(repo_id="hexgrad/Kokoro-82M").eval()
    pipelines = {}
    for lang, (code, voice) in VOICES.items():
        pipe = KPipeline(lang_code=code, repo_id="hexgrad/Kokoro-82M", model=model)
        pipe.load_voice(voice)
        pipelines[lang] = pipe
    # Warm up so the first real request is not the slow one.
    for lang, text in (("en", "Hello."), ("ja", "こんにちは。")):
        for _ in pipelines[lang](text, voice=VOICES[lang][1]):
            pass
    send({"ready": True, "espeak": fallback})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            lang, text = req.get("lang"), req.get("text")
            if lang not in VOICES or not isinstance(text, str) or not text.strip():
                send({"id": req_id, "error": "failed", "message": "bad request"})
                continue
            chunks = []
            unknown = False
            for result in pipelines[lang](text, voice=VOICES[lang][1]):
                if lang == "en" and not fallback and has_unknown_words(result):
                    unknown = True
                    break
                if result.audio is not None:
                    chunks.append(result.audio.numpy())
            if unknown or not chunks:
                send({"id": req_id, "error": "unsupported-text", "message": "text has words the voice cannot read"})
                continue
            wav = to_wav(np.concatenate(chunks))
            send({"id": req_id, "wav": base64.b64encode(wav).decode("ascii")})
        except Exception as err:  # keep serving after a bad request
            print(f"[kokoro_worker] {type(err).__name__}: {err}", file=sys.stderr)
            send({"id": req_id, "error": "failed", "message": str(err)})


if __name__ == "__main__":
    main()
