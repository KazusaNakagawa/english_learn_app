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

  // 境界値: このスタックはユーザもロールも作らない。
  // ユーザは手動作成しグループに入れる運用 (#176)、ロールは別スタックの責務。
  it.each(['AWS::IAM::User', 'AWS::IAM::Role'])('contains no %s', (type) => {
    synth().resourceCountIs(type, 0);
  });

  // 権限はグループ経由でのみ与える。
  // ユーザに直接ポリシーを貼ると移行時に取りこぼす (#178)。
  it('attaches no policy directly to a user', () => {
    synth().resourceCountIs('AWS::IAM::UserPolicy', 0);
    synth().resourceCountIs('AWS::IAM::Policy', 0);
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
