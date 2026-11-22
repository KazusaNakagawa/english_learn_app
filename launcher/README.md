# english-learn-app

Run the English Learn App web version on your own machine with one command.

```bash
npx english-learn-app
```

> Not published to npm yet. From the repository, run
> `node scripts/prepare-dist.mjs && npm start` in `launcher/` instead
> (see Development below).

It serves the app at http://127.0.0.1:5280/ and opens it in your browser.
Press Ctrl-C to stop. Running the command again while it is up just reopens
the browser.

Your words, audio cache, and settings are kept in the browser, keyed by that
URL. Keep using the same port: the app opened on another port starts empty.

## Generating sentences with Claude Code

AIで例文を生成 runs the Claude Code CLI on this machine, using your
Pro/Max login. No API key is needed. macOS and Linux only for now: on
Windows the npm-installed `claude.cmd` is not started yet. One-time setup:

```bash
npm install -g @anthropic-ai/claude-code
claude          # log in with a Pro or Max account
```

Settings → 例文の生成方法 shows whether it is ready, and what to do when
it is not. The local API behind it (`POST /api/generate-sentences`):

- runs `claude -p` with structured output, no tools, no slash commands, no
  MCP servers, and no saved session;
- removes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`
  and `CLAUDE_CODE_USE_BEDROCK` / `_VERTEX` / `_FOUNDRY` from the CLI's
  environment, and skips your Claude Code settings (`--setting-sources ""`,
  so no hooks run), so the subscription is used rather than API billing;
- answers only loopback clients whose `Origin` is this page, so other sites
  cannot spend your subscription;
- runs one generation at a time, gives up after 3 minutes, and stops the CLI
  when the page cancels.

## Local voice (Kokoro)

Speech can use [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) on this
machine: English in the `am_echo` voice, Japanese in `jf_alpha`. Free, no key,
and nothing leaves the machine. It needs [uv](https://docs.astral.sh/uv/):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

The first start installs its Python packages and downloads the model, about
1.5 GB in total (uv's cache and `~/.cache/huggingface`); later starts take a few
seconds. Without uv, speech uses the browser's voice as before.

On macOS, also installing `espeak-ng` (`brew install espeak-ng`) lets Kokoro
read English words missing from its dictionary; without it, a sentence with
such a word is read by the browser's voice instead.

The local API behind it (`POST /api/tts` with `{ "text", "lang": "en" | "ja" }`,
answering `audio/wav`):

- starts the voice on the first `GET /api/health?tts=1` or `POST /api/tts`, and
  answers 503 `starting` until it is ready, so the page falls back meanwhile;
  a health request another site's page makes (`Sec-Fetch-Site: cross-site`)
  gets the status but never starts it;
- has the same loopback and `Origin` checks as the generate endpoint;
- runs one sentence at a time (up to 500 characters) and stops the voice when
  the launcher stops.

To remove it: `uv cache clean` and delete
`~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M`.

## Options

```
--port <n>       Port to listen on (default: 5280)
--no-browser     Do not open the browser (also skipped when $CI is set)
-v, --version    Print the version
-h, --help       Show help
```

## Requirements

- Node.js 20+ (releasing needs 20.12+)

No API keys are needed. Speech uses the local voice when uv is installed (above),
and otherwise falls back to the browser's voice when no VOICEVOX endpoint is set.
Sentence generation needs the Claude Code CLI (above)
or an OpenAI key entered in Settings.

## Development (in the repository)

```bash
cd launcher
npm test                              # node:test, no dependencies
node scripts/prepare-dist.mjs         # rebuild ../web and copy it into dist/
npm start                             # serve dist/
```

Releasing is `npm publish` in this directory: `prepack` builds `../web` with
every `VITE_*` variable blanked except `VITE_APP_VERSION` / `VITE_APP_ENV`
(which it sets), copies the output into `dist/`, and refuses to continue if the
launcher and web versions differ or if any value from `web/.env*` (or a
`VITE_*` shell variable) appears in the build. It always rebuilds; an existing
`web/dist` is never packaged as is. Tag the release with that version.
