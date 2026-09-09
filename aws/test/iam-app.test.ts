import * as fs from 'fs';
import * as path from 'path';

const IAM_APP = '../bin/iam-app';
const IAM_APP_FILE = path.join(__dirname, '../bin/iam-app.ts');

// VoicevoxStack の constructor はこれらが未設定だと throw する。
// IAM 側の操作がその影響を受けないことが、このスタックを分けた理由そのもの (#171)。
const VOICEVOX_KEYS = [
  'VOICEVOX_API_KEY_POC',
  'VOICEVOX_API_KEY_DEV',
  'VOICEVOX_API_KEY_PRO',
];

describe('IAM app entry (bin/iam-app.ts)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of VOICEVOX_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of VOICEVOX_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  // 失敗系→成功系: VOICEVOX の資格情報が一切ない環境でも IAM 操作が通ること。
  // 分離前は "Error: API key not found. Set environment variable: VOICEVOX_API_KEY_POC" で落ちていた。
  it('constructs with no VOICEVOX_API_KEY_* set', () => {
    expect(() => require(IAM_APP)).not.toThrow();
  });

  // 境界値: env context を明示的に与えても VOICEVOX 側に依存しないこと
  it.each(['poc', 'dev', 'pro'])(
    'constructs with no VOICEVOX_API_KEY_* set even when env=%s is in context',
    (env) => {
      process.env.CDK_CONTEXT_JSON = JSON.stringify({ env });
      try {
        expect(() => require(IAM_APP)).not.toThrow();
      } finally {
        delete process.env.CDK_CONTEXT_JSON;
      }
    },
  );

  // 回帰防止: 誰かが VoicevoxStack をこのエントリに足すと上の保証が壊れる。
  // 構築順に依存せず検出したいので、ソースの依存関係そのものを見る。
  // 単純な文字列一致だと「なぜ分けたか」を説明するコメントにも反応してしまうため、
  // import 文と生成箇所だけを対象にする。
  it('neither imports nor instantiates VoicevoxStack', () => {
    const source = fs.readFileSync(IAM_APP_FILE, 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*voicevox-stack['"]/);
    expect(source).not.toMatch(/require\(\s*['"][^'"]*voicevox-stack['"]/);
    expect(source).not.toMatch(/new\s+VoicevoxStack\s*\(/);
  });
});
