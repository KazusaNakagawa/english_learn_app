# english-learn-app

Run the English Learn App web version on your own machine with one command.

```bash
npx english-learn-app
```

It serves the app at http://127.0.0.1:5280/ and opens it in your browser.
Press Ctrl-C to stop. Running the command again while it is up just reopens
the browser.

Your words, audio cache, and settings are kept in the browser, keyed by that
URL. Keep using the same port: the app opened on another port starts empty.

## Generating sentences with Claude Code

AIで例文を生成 runs the Claude Code CLI on this machine, using your
Pro/Max login. No API key is needed. One-time setup:

```bash
npm install -g @anthropic-ai/claude-code
claude          # log in with a Pro or Max account
```

Settings → 例文の生成方法 shows whether it is ready, and what to do when
it is not. The local API behind it (`POST /api/generate-sentences`):

- runs `claude -p` with structured output, no tools, no slash commands, no
  MCP servers, and no saved session;
- removes `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the CLI's
  environment, so the subscription is used rather than API billing;
- answers only loopback clients whose `Origin` is this page, so other sites
  cannot spend your subscription;
- runs one generation at a time, gives up after 3 minutes, and stops the CLI
  when the page cancels.

## Options

```
--port <n>       Port to listen on (default: 5280)
--no-browser     Do not open the browser (also skipped when $CI is set)
-v, --version    Print the version
-h, --help       Show help
```

## Requirements

- Node.js 20+ (releasing needs 20.12+)

No API keys are needed. Speech falls back to the browser's voice when no
VOICEVOX endpoint is set. Sentence generation needs the Claude Code CLI (above)
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
