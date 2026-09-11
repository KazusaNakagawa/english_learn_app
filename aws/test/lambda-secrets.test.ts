import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { VoicevoxStack } from '../lib/voicevox-stack';
import { asArray, renderArns, Statement } from './support/synth';

const ENV = { account: '123456789012', region: 'ap-northeast-1' };

/**
 * Values a previous version of this stack read from the deploy environment and
 * copied verbatim into a Lambda environment variable (#182). They are set here
 * on purpose: the stack must now ignore them entirely, and the sentinel makes
 * a regression visible as "this exact string is in the template".
 */
const SENTINELS: Record<string, string> = {
  VOICEVOX_API_KEY_POC: 'sentinel-api-key-3f9c1d',
  VOICEVOX_SLACK_WEBHOOK_POC: 'https://hooks.slack.com/services/sentinel/5b2e77',
};

const AUTHORIZER = 'voicevox-authorizer-poc';
const SLACK_ALERT = 'voicevox-slack-alert-poc';
const ENGINE = 'voicevox-engine-poc';

const API_KEY_SECRET = '/englishlearn/poc/voicevox/api-key';
const SLACK_SECRET = '/englishlearn/poc/voicevox/slack-webhook-url';

function templateFor(stackEnv: string): Template {
  const app = new cdk.App();
  return Template.fromStack(
    new VoicevoxStack(app, `VoicevoxStack-${stackEnv}`, { env: ENV, stackEnv }),
  );
}

/** A function's `Environment.Variables`, keyed by its FunctionName. */
function environmentOf(template: Template, functionName: string): Record<string, unknown> {
  return functionProperties(template, functionName).Environment?.Variables ?? {};
}

function functionProperties(template: Template, functionName: string): any {
  const found = Object.values(template.findResources('AWS::Lambda::Function')).find(
    (r: any) => r.Properties.FunctionName === functionName,
  ) as any;
  if (!found) throw new Error(`No Lambda function named ${functionName} in the template`);
  return found.Properties;
}

/**
 * Statements from every IAM::Policy attached to the role of `functionName`.
 * Scoping matters more than the grant itself here — a single policy that let
 * both functions read both secrets would pass an "is it granted?" assertion.
 */
function roleStatements(template: Template, functionName: string): Statement[] {
  const role = functionProperties(template, functionName).Role;
  const roleLogicalId = role?.['Fn::GetAtt']?.[0];
  if (!roleLogicalId) throw new Error(`${functionName} has no role reference`);

  return Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((policy: any) =>
      (policy.Properties.Roles ?? []).some((r: any) => r?.Ref === roleLogicalId),
    )
    .flatMap((policy: any) => policy.Properties.PolicyDocument.Statement as Statement[]);
}

const secretReads = (statements: Statement[]): Statement[] =>
  statements.filter(
    (s) =>
      s.Effect === 'Allow' &&
      asArray(s.Action).some((a) => a.startsWith('secretsmanager:')),
  );

describe('Lambda secrets are fetched at runtime, not baked into the deployment', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const [key, value] of Object.entries(SENTINELS)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const key of Object.keys(SENTINELS)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  // 成功系: 環境変数が指すのは値ではなく「場所」であること。
  describe('environment variables carry a secret id, never a secret value', () => {
    it('points the authorizer at the API key secret', () => {
      expect(environmentOf(templateFor('poc'), AUTHORIZER)).toEqual({
        API_KEY_SECRET_ID: API_KEY_SECRET,
      });
    });

    it('points the Slack forwarder at the webhook secret', () => {
      expect(environmentOf(templateFor('poc'), SLACK_ALERT)).toEqual({
        SLACK_WEBHOOK_SECRET_ID: SLACK_SECRET,
      });
    });

    // 失敗系: 旧実装の変数名が残っていないこと。
    // lambda:GetFunctionConfiguration はこのブロックをそのまま返すため、
    // ここに値が入っている限り readonly から平文で読めてしまう (#173)。
    it.each([
      [AUTHORIZER, 'API_KEY'],
      [SLACK_ALERT, 'SLACK_WEBHOOK_URL'],
    ])('%s no longer exposes %s', (functionName, variable) => {
      expect(environmentOf(templateFor('poc'), functionName)).not.toHaveProperty(variable);
    });

    // 境界値: engine 関数の非機密な設定は今のまま残っていること。
    it('leaves the engine function configuration untouched', () => {
      expect(environmentOf(templateFor('poc'), ENGINE)).toEqual({
        PORT: '50021',
        ASYNC_INIT: 'true',
        READINESS_CHECK_PATH: '/version',
      });
    });

    it.each(['poc', 'dev', 'pro'])('scopes the secret ids to env=%s', (stackEnv) => {
      const template = templateFor(stackEnv);

      expect(environmentOf(template, `voicevox-authorizer-${stackEnv}`)).toEqual({
        API_KEY_SECRET_ID: `/englishlearn/${stackEnv}/voicevox/api-key`,
      });
      expect(environmentOf(template, `voicevox-slack-alert-${stackEnv}`)).toEqual({
        SLACK_WEBHOOK_SECRET_ID: `/englishlearn/${stackEnv}/voicevox/slack-webhook-url`,
      });
    });
  });

  // 失敗系の本体: テンプレートと cdk.out も秘密の流出経路である。
  // deny-secret-reads は Lambda API を塞ぐが、CloudFormation は塞がない。
  describe('the synthesized template holds no secret material', () => {
    it.each(Object.entries(SENTINELS))(
      'does not contain the value of %s',
      (_key, value) => {
        expect(JSON.stringify(templateFor('poc').toJSON())).not.toContain(value);
      },
    );
  });

  // 成功系: 読めるのは自分の秘密だけ。
  describe('each function may read only its own secret', () => {
    it.each([
      [AUTHORIZER, API_KEY_SECRET, SLACK_SECRET],
      [SLACK_ALERT, SLACK_SECRET, API_KEY_SECRET],
    ])('%s reads %s and nothing else', (functionName, own, other) => {
      const statements = secretReads(roleStatements(templateFor('poc'), functionName));
      expect(statements).toHaveLength(1);

      const [statement] = statements;
      expect(asArray(statement.Action)).toContain('secretsmanager:GetSecretValue');

      const resources = renderArns(statement.Resource);
      expect(resources.every((arn) => arn.includes(`secret:${own}`))).toBe(true);
      expect(resources.some((arn) => arn.includes(other))).toBe(false);
    });

    // 境界値: ワイルドカードで全シークレットを読めるようになっていないこと。
    it.each([AUTHORIZER, SLACK_ALERT])('%s is not granted secretsmanager:* on *', (functionName) => {
      for (const statement of secretReads(roleStatements(templateFor('poc'), functionName))) {
        expect(renderArns(statement.Resource)).not.toContain('*');
        expect(asArray(statement.Action)).not.toContain('secretsmanager:*');
      }
    });

    // 境界値: 秘密を持たない engine 関数には Secrets Manager 権限を与えない。
    it('grants the engine function no secret access at all', () => {
      expect(secretReads(roleStatements(templateFor('poc'), ENGINE))).toHaveLength(0);
    });
  });

  // 失敗系→成功系: デプロイする人の手元に秘密が無くても合成できること。
  // 以前は VOICEVOX_API_KEY_{ENV} 未設定で constructor が throw していた。
  describe('deployment no longer needs the secret in the operator environment', () => {
    const cleared: Record<string, string | undefined> = {};
    const KEYS = [
      'VOICEVOX_API_KEY_POC',
      'VOICEVOX_API_KEY_DEV',
      'VOICEVOX_API_KEY_PRO',
      'VOICEVOX_SLACK_WEBHOOK_POC',
      'VOICEVOX_SLACK_WEBHOOK_DEV',
      'VOICEVOX_SLACK_WEBHOOK_PRO',
    ];

    beforeEach(() => {
      for (const key of KEYS) {
        cleared[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of KEYS) {
        if (cleared[key] === undefined) delete process.env[key];
        else process.env[key] = cleared[key];
      }
    });

    it.each(['poc', 'dev', 'pro'])('synthesizes env=%s with nothing set', (stackEnv) => {
      expect(() => templateFor(stackEnv)).not.toThrow();
    });

    // 境界値: Slack の未設定を警告する必要も無くなった（値を受け取らないので）。
    it('emits no synthesis warning about a missing webhook', () => {
      const app = new cdk.App();
      const stack = new VoicevoxStack(app, 'VoicevoxStack-poc', { env: ENV, stackEnv: 'poc' });
      Template.fromStack(stack);

      Annotations.fromStack(stack).hasNoWarning('*', Match.stringLikeRegexp('SLACK'));
    });
  });
});
