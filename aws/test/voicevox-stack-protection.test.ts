import * as cdk from 'aws-cdk-lib';
import { VoicevoxStack } from '../lib/voicevox-stack';

const ENV = { account: '123456789012', region: 'ap-northeast-1' };

function stackFor(stackEnv: string): VoicevoxStack {
  const app = new cdk.App();
  return new VoicevoxStack(app, `VoicevoxStack-${stackEnv}`, { env: ENV, stackEnv });
}

// #182 以降、constructor は API キーを要求しない（秘密は Secrets Manager から
// 実行時に読む）。そのためダミーの環境変数を置く必要はない。
// 「何も設定されていなくても合成できる」ことは test/lambda-secrets.test.ts で見る。
describe('VoicevoxStack deletion protection', () => {
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
