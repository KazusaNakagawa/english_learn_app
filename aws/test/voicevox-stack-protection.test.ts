import * as cdk from 'aws-cdk-lib';
import { VoicevoxStack } from '../lib/voicevox-stack';

const ENV = { account: '123456789012', region: 'ap-northeast-1' };

function stackFor(stackEnv: string): VoicevoxStack {
  const app = new cdk.App();
  return new VoicevoxStack(app, `VoicevoxStack-${stackEnv}`, { env: ENV, stackEnv });
}

describe('VoicevoxStack deletion protection', () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['VOICEVOX_API_KEY_POC', 'VOICEVOX_API_KEY_DEV', 'VOICEVOX_API_KEY_PRO'];

  beforeAll(() => {
    // constructor が API キーを要求するため、合成用のダミーを置く。
    for (const key of KEYS) {
      saved[key] = process.env[key];
      process.env[key] = 'dummy-for-synth';
    }
  });

  afterAll(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  // 成功系: pro だけは誤削除から守る。
  // develop グループは CDK bootstrap ロールを assume できるため、
  // identity policy 側の Deny では pro を守れない (#174)。
  // スタック側の保護はプリンシパルに依存しないので、誰が来ても効く。
  it('enables termination protection on pro', () => {
    expect(stackFor('pro').terminationProtection).toBe(true);
  });

  // 境界値: poc / dev は日常的に作り直すので保護しない。
  // ここを true にすると cdk destroy:poc が失敗するようになる。
  it.each(['poc', 'dev'])('leaves %s unprotected so it stays disposable', (env) => {
    expect(stackFor(env).terminationProtection).toBe(false);
  });
});
