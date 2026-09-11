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
npm test               # Jest (policy assertions against the synthesized template)

# Multi-environment deploy (poc | dev | pro)
npm run deploy:poc
npm run deploy:dev
npm run deploy:pro

# Other per-environment commands
npm run diff:poc       # Preview CloudFormation changes
npm run synth:poc      # Generate CloudFormation template
npm run destroy:poc    # Tear down stack

# IAM groups — a single account-wide stack, no env suffix
npm run diff:iam       # Always run before deploying
npm run deploy:iam
npm run synth:iam
npm run destroy:iam

npx cdk bootstrap      # One-time per AWS account/region
```

There are **two CDK apps**. `bin/app.ts` holds `VoicevoxStack-{env}`; `bin/iam-app.ts`
holds `IamStack`, and the `:iam` scripts point at it with `--app`. They are separate
because IAM changes lock people out of the account when wrong, and are reviewed and
deployed on a different cadence from the application stack. (Originally there was a
harder reason: a CDK app constructs every declared stack before the CLI applies a
stack selector, and `VoicevoxStack` threw without `VOICEVOX_API_KEY_{ENV}`. That
dependency is gone as of #182 — secrets are read from Secrets Manager at runtime.)

`IamStack` has no environment suffix: IAM is account-global and poc/dev/pro share one
account, so environment separation comes from ARN conditions inside the policies.

## Architecture

```text
EnglishLearnApp/  (Swift/SwiftUI, iOS 17+)
aws/              (AWS CDK, TypeScript — VOICEVOX TTS backend + account IAM)
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
- `EnglishLearnApp/Config.xcconfig` — Xcode build configuration. Copy from `Config.xcconfig.example`.

For API key setup, see [docs/02.voicevox_api_authentication.md](docs/02.voicevox_api_authentication.md).

## Development Workflow

### Initial Setup

Install git hooks to prevent common commit mistakes:

```bash
./scripts/setup-hooks.sh
```

This installs a pre-commit hook that blocks commits with hardcoded `DEVELOPMENT_TEAM` values.

### Workflow

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

The VOICEVOX API requires `x-api-key` header authentication. See [docs/02.voicevox_api_authentication.md](docs/02.voicevox_api_authentication.md) for details.

Both secrets the stack needs live in Secrets Manager and are **created by hand, once
per environment** — the stack imports them by name and never sees a value, so nothing
secret reaches a Lambda environment variable, the CloudFormation template, or `cdk.out`
(#182). `cdk destroy` therefore does not delete them, which is deliberate: a deleted
secret cannot be recreated under the same name for 7–30 days.

| Secret | Read by |
| --- | --- |
| `/englishlearn/{env}/voicevox/api-key` | `voicevox-authorizer-{env}` |
| `/englishlearn/{env}/voicevox/slack-webhook-url` | `voicevox-slack-alert-{env}` |

Rotating either is a `put-secret-value` with no redeploy; allow up to 10 minutes for
the API key (two 5-minute caches, see docs/02).

Account access runs through IAM groups defined in `aws/lib/iam-stack.ts`. Read
[docs/05.iam_group_design.md](docs/05.iam_group_design.md) before changing them —
three constraints there are easy to break by accident:

- **A deny in a group policy applies to the user**, so it cancels every other group
  they belong to. Only deny what no group should ever grant.
- **Groups are not freely combinable.** `readonly` / `audit` / `develop` / `infra` /
  `admin` are tiers, one per person; only `billing` layers on top.
- **Break-glass `admin` needs a dedicated user in no other group**, or that user's
  tier denies beat `AdministratorAccess` — and it surfaces during an emergency.

Every group enforces MFA. A long-lived access key carries no MFA context and is
denied; use `./scripts/aws-mfa-session.sh` to obtain a session.
