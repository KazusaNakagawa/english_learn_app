import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IamStack } from '../lib/iam-stack';

const ENV = { account: '123456789012', region: 'ap-northeast-1' };

function synth(): Template {
  const app = new cdk.App();
  const stack = new IamStack(app, 'IamStack', { env: ENV });
  return Template.fromStack(stack);
}

describe('IamStack', () => {
  // 成功系: スタックが synth でき、テンプレートとして成立する
  it('synthesizes to a valid CloudFormation template', () => {
    expect(() => synth()).not.toThrow();
  });

  // 成功系: IAM はアカウントグローバルなので env サフィックスを付けない (#171)
  it('uses a fixed stack name with no environment suffix', () => {
    const app = new cdk.App();
    const stack = new IamStack(app, 'IamStack', { env: ENV });

    expect(stack.stackName).toBe('IamStack');
    expect(stack.stackName).not.toMatch(/-(poc|dev|pro)$/);
  });

  // 境界値: #172 で MFA ベースラインの ManagedPolicy 2 件が入った。
  // グループ／ユーザ／ロールの実体は #173-#175 まで 0 件のまま。
  it.each(['AWS::IAM::Group', 'AWS::IAM::User', 'AWS::IAM::Role'])(
    'contains no %s yet',
    (type) => {
      synth().resourceCountIs(type, 0);
    },
  );

  // このスタックがユーザに触れる唯一の手段はグループ経由であるべき。
  // ポリシーを直接ユーザに貼ると移行時に取りこぼす (#178)。
  it('creates only the two baseline managed policies for now', () => {
    synth().resourceCountIs('AWS::IAM::ManagedPolicy', 2);
  });

  // 失敗系に相当: VOICEVOX 側のリソースが混入していないこと (#171 受け入れ条件)
  it.each([
    'AWS::Lambda::Function',
    'AWS::ECR::Repository',
    'AWS::ApiGatewayV2::Api',
    'AWS::SNS::Topic',
    'AWS::CloudWatch::Alarm',
  ])('contains no %s — VOICEVOX resources stay in VoicevoxStack', (type) => {
    synth().resourceCountIs(type, 0);
  });

  // 境界値: 既存の手動グループを一切参照しない。
  // 誤って同名で作ると CloudFormation が AlreadyExists で落ち、
  // 既存グループを触ると現用の権限を壊す (#178)
  it.each(['dev_readonly', 'dev_user'])(
    'does not reference the pre-existing group %s',
    (groupName) => {
      const json = JSON.stringify(synth().toJSON());
      expect(json).not.toContain(groupName);
    },
  );
});
