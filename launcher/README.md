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
VOICEVOX endpoint is set; OpenAI and VOICEVOX can be configured in Settings.

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
