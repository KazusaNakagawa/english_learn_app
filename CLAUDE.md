# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A bilingual English learning iOS app with AI-powered sentence generation (OpenAI) and optional cloud TTS (VOICEVOX/ずんだもん via AWS Lambda). The app works fully offline using native iOS TTS; the AWS backend is supplemental.

## Commands

### iOS App

The iOS app has no CLI build system. Open and run from Xcode:

```bash
open EnglishLearnApp/EnglishLearnApp.xcodeproj
# Build: Cmd+R  |  Clean: Cmd+Shift+K
```

Requirements: macOS with Xcode 15+, iOS 17.0+ target.

### AWS CDK Infrastructure

```bash
cd aws
npm install
npm run build          # Compile TypeScript

# Multi-environment deploy (poc | dev | pro)
npm run deploy:poc
npm run deploy:dev
npm run deploy:pro

# Other per-environment commands
npm run diff:poc       # Preview CloudFormation changes
npm run synth:poc      # Generate CloudFormation template
npm run destroy:poc    # Tear down stack

npx cdk bootstrap      # One-time per AWS account/region
```

## Architecture

```text
EnglishLearnApp/  (Swift/SwiftUI, iOS 17+)
aws/              (AWS CDK, TypeScript — VOICEVOX TTS backend)
docs/             (Architecture decisions, troubleshooting guides)
```

### iOS App

**Entry point:** `EnglishLearnAppApp.swift` mounts `ContentView` (a `TabView`) and injects `SettingsManager.shared` as an environment object.

**Two tabs:**
- **学習 (Learning):** `WordListView` → `SentenceListView` → `SentencePracticeView` (or `WordPracticeView` for words with no sentences)
- **設定 (Settings):** `SettingsView` — voice gender, OpenAI API key/model, VOICEVOX style, prompt customization

**Key services:**

| File | Responsibility |
| ---- | ------------- |
| `WordDataManager` | Singleton. Loads/saves `words.json` to `~/Documents/`. Falls back to bundle. Manages soft-delete (10-day trash). |
| `SpeechService` | TTS dispatch. Routes to `AVSpeechSynthesizer` (default/female/male) or VOICEVOX HTTP API (zundamon). |
| `SpeechRecognizer` | STT via `SFSpeechRecognizer` (en-US). Returns `.correct` / `.close` / `.incorrect` / `.noInput`. |
| `OpenAIService` | Generates `[Sentence]` from OpenAI Chat Completions API using structured JSON output. |
| `SettingsManager` | Singleton. All user preferences persisted to `UserDefaults`. |

### Data Model

```swift
Word        { id, word, meaning, phonetic, sentences: [Sentence], deletedAt: Date? }
Sentence    { id, english, japanese, category }
```

Persistence is a single `words.json` file. The bundle copy (`Resources/words.json`) provides seed data; once the user edits anything, `~/Documents/words.json` takes precedence.

### VOICEVOX TTS Flow

Two-step API call (both against API Gateway → Lambda):
1. `POST /audio_query?text=...&speaker=3` → JSON query config
2. `POST /synthesis?speaker=3` (body = query JSON) → WAV binary → played via `AVAudioPlayer`

The base URL comes from `AppConfig.voicevoxBaseURL` (excluded from git — copy from `AppConfig.swift.example`).

### AWS CDK Stack (`aws/`)

Stack name pattern: `VoicevoxStack-{env}` where `env` ∈ `{poc, dev, pro}`.

Per-environment resource naming: `voicevox-engine-{env}` (ECR repo, Lambda, API Gateway, IAM role).

Per-environment config (defined in `lib/voicevox-stack.ts`):

| env | Lambda memory | Rate limit | Burst limit |
| --- | ------------ | --------- | ----------- |
| poc | 2048 MB | 5 RPS | 10 |
| dev | 2048 MB | 10 RPS | 20 |
| pro | 3008 MB | 50 RPS | 100 |

The Lambda runs a Docker image (`voicevox/voicevox_engine:cpu-ubuntu22.04-0.25.1` + Lambda Web Adapter). Cold starts take 10–30 s, which is acceptable for poc/dev. Build must target `linux/amd64` explicitly (Apple Silicon compatibility).

## Configuration Files (git-ignored)

Two files must be created locally before building the iOS app:

- `EnglishLearnApp/EnglishLearnApp/AppConfig.swift` — contains `voicevoxBaseURL` and `voicevoxApiKey`. Copy from `AppConfig.swift.example`.
- `EnglishLearnApp/Config.xcconfig` — Xcode build configuration (includes `VOICEVOX_API_KEY`). Copy from `Config.xcconfig.example`.

### Setting up VOICEVOX API key

1. Generate an API key (64-character hex string):
   ```bash
   export VOICEVOX_API_KEY_POC="$(openssl rand -hex 32)"
   echo $VOICEVOX_API_KEY_POC  # Save this value
   ```

2. Deploy the CDK stack with the API key:
   ```bash
   cd aws
   npm run deploy:poc
   ```

3. Copy the API key from the deployment output (`VoicevoxApiKey`) and add it to:
   - `EnglishLearnApp/Config.xcconfig` (for Xcode build)
   - `EnglishLearnApp/EnglishLearnApp/AppConfig.swift` (hardcoded fallback)

**Important:** The API key must match between the deployed Lambda Authorizer and the iOS app.

## Development Workflow

1. **Create an Issue** — file a GitHub Issue for the task before starting.
2. **Cut a working branch** — pull the latest `develop` branch, then create a feature branch from it.
3. **Implement** — make the code changes.
4. **Manual verification** — confirm the change works by running the app or the affected AWS stack by hand.
5. **Document if needed** — if the change introduces non-obvious behaviour, a setup step, or a known pitfall, add a document under `docs/`.
6. **Commit** — commit with a clear message referencing the Issue number.
7. **Push and open a PR** — push the branch and create a pull request targeting `develop`.

```bash
# EnglishLearnApp/EnglishLearnApp.xcodeproj/project.pbxproj
# Critical: The following variables should be kept outside the commit.
DEVELOPMENT_TEAM = "$(DEVELOPMENT_TEAM)";
```

## Security

The VOICEVOX API Gateway is protected by:

- **Lambda Authorizer:** All routes (`/audio_query`, `/synthesis`, `/speakers`) require a valid `x-api-key` header. Unauthorized requests return `403 Forbidden`.
- **CORS:** Disabled (native iOS app does not require CORS). `/version` (health check) remains public.
- **Throttling:** Per-environment rate limits (see table above) prevent abuse and cap costs.

The API key is set via environment variable `VOICEVOX_API_KEY_{ENV}` before CDK deployment and is stored in the Lambda Authorizer. Issue #12 (multi-env deploy) tracks additional hardening for production.
