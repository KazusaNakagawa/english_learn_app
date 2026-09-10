import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IamStack } from '../lib/iam-stack';

const ACCOUNT = '123456789012';
const ENV = { account: ACCOUNT, region: 'ap-northeast-1' };

type Statement = {
  NotResource?: unknown;
  Sid?: string;
  Effect: string;
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: unknown;
  Condition?: Record<string, Record<string, unknown>>;
};

function synth() {
  const app = new cdk.App();
  return Template.fromStack(new IamStack(app, 'IamStack', { env: ENV }));
}

/** Managed policy documents keyed by their ManagedPolicyName. */
function managedPolicies(): Record<string, Statement[]> {
  const found = synth().findResources('AWS::IAM::ManagedPolicy');
  const byName: Record<string, Statement[]> = {};
  for (const resource of Object.values(found) as any[]) {
    byName[resource.Properties.ManagedPolicyName] =
      resource.Properties.PolicyDocument.Statement;
  }
  return byName;
}

const SELF_SERVICE = 'self-service-credentials';
const DENY_WITHOUT_MFA = 'deny-without-mfa';

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * ARNs come back as `Fn::Join` with a `Ref: AWS::Partition`, because
 * Stack.formatArn resolves the partition at deploy time rather than assuming
 * "aws". Flatten that to a plain string so assertions stay readable.
 */
function renderArn(value: unknown): string {
  if (typeof value === 'string') return value;
  const join = (value as any)?.['Fn::Join'];
  if (!join) return JSON.stringify(value);

  const [delimiter, parts] = join as [string, unknown[]];
  return parts
    .map((part) =>
      typeof part === 'string' ? part : `\${${(part as any).Ref}}`,
    )
    .join(delimiter);
}

describe('MFA baseline policies', () => {
  it('creates exactly the two baseline managed policies', () => {
    expect(Object.keys(managedPolicies()).sort()).toEqual(
      [DENY_WITHOUT_MFA, SELF_SERVICE].sort(),
    );
  });

  describe(SELF_SERVICE, () => {
    const statements = () => managedPolicies()[SELF_SERVICE];
    const allActions = () =>
      statements().flatMap((s) => asArray(s.Action));

    // 成功系: MFA 未登録でも自分で登録を完了できる
    it.each([
      'iam:ChangePassword',
      'iam:CreateVirtualMFADevice',
      'iam:EnableMFADevice',
      'iam:ResyncMFADevice',
      'iam:ListMFADevices',
    ])('allows %s', (action) => {
      expect(allActions()).toContain(action);
    });

    // 決定事項 (#172): アクセスキーを自分でローテーションできるようにする。
    // dev_user1 のキーは 2026-02-14 作成から未交換だった。
    it.each([
      'iam:CreateAccessKey',
      'iam:UpdateAccessKey',
      'iam:DeleteAccessKey',
      'iam:ListAccessKeys',
    ])('allows %s so users can rotate their own key', (action) => {
      expect(allActions()).toContain(action);
    });

    // MFA デバイスの機種変更には Deactivate が要る。
    // Allow には入れるが、後述のとおり Deny の NotAction には入れない。
    it('allows iam:DeactivateMFADevice so an enrolled user can replace a device', () => {
      expect(allActions()).toContain('iam:DeactivateMFADevice');
    });

    // 境界値: 資格情報を書き換えるアクションは、必ず自分自身の ARN に限定されていること。
    // ここが `*` だと「自己管理」の名目で他人の MFA やキーを操作できてしまう。
    it.each([
      'iam:ChangePassword',
      'iam:CreateVirtualMFADevice',
      'iam:DeleteVirtualMFADevice',
      'iam:EnableMFADevice',
      'iam:DeactivateMFADevice',
      'iam:ResyncMFADevice',
      'iam:CreateAccessKey',
      'iam:UpdateAccessKey',
      'iam:DeleteAccessKey',
    ])('scopes %s to the caller only', (action) => {
      const granting = statements().filter((s) =>
        asArray(s.Action).includes(action),
      );

      expect(granting.length).toBeGreaterThan(0);
      for (const statement of granting) {
        const resources = (
          Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource]
        ).map(renderArn);

        for (const resource of resources) {
          expect(resource).toMatch(/\$\{aws:username\}$/);
        }
      }
    });

    // #171 の目的はテンプレ化。アカウント ID をベタ書きしない。
    // パーティションもリテラルではなく Ref にしておく（aws-cn / aws-us-gov 対応）。
    it('builds ARNs from the stack account and the partition ref', () => {
      const resources = statements()
        .flatMap((s) => (Array.isArray(s.Resource) ? s.Resource : [s.Resource]))
        .map(renderArn);

      expect(resources).toEqual(
        expect.arrayContaining([
          `arn:\${AWS::Partition}:iam::${ACCOUNT}:user/\${aws:username}`,
          `arn:\${AWS::Partition}:iam::${ACCOUNT}:mfa/\${aws:username}`,
        ]),
      );
    });

    // 失敗系: 自己管理の名目で他人や広域の権限を持たせない
    it('grants nothing on a bare wildcard resource except read-only account info', () => {
      for (const statement of statements()) {
        if (statement.Resource !== '*') continue;
        expect(asArray(statement.Action).sort()).toEqual([
          'iam:GetAccountPasswordPolicy',
          'iam:ListVirtualMFADevices',
        ]);
      }
    });
  });

  describe(DENY_WITHOUT_MFA, () => {
    const statements = () => managedPolicies()[DENY_WITHOUT_MFA];
    const statement = () => statements()[0];
    const scopedDeny = () =>
      statements().find((s) => s.NotResource !== undefined)!;

    // アカウント全体が対象で、リソース単位の絞り込みができないアクション。
    // これらをリソーススコープの Deny に含めると MFA 登録自体が回らなくなる。
    const ACCOUNT_LEVEL = [
      'iam:ListVirtualMFADevices',
      'iam:GetAccountPasswordPolicy',
      'sts:GetSessionToken',
    ];

    it('denies on a wildcard resource when MFA is absent', () => {
      expect(statement().Effect).toBe('Deny');
      expect(statement().Resource).toBe('*');
      expect(statement().Condition).toEqual({
        BoolIfExists: { 'aws:MultiFactorAuthPresent': 'false' },
      });
    });

    // 境界値: これが抜けると MFA セッション自体を取得できず全員締め出される
    it('exempts sts:GetSessionToken, without which nobody could ever authenticate', () => {
      expect(asArray(statement().NotAction)).toContain('sts:GetSessionToken');
    });

    // 決定事項 (#172): 登録途中で詰まないよう、未割り当てデバイスの削除を許す
    it('exempts iam:DeleteVirtualMFADevice so a stalled enrollment can be retried', () => {
      expect(asArray(statement().NotAction)).toContain('iam:DeleteVirtualMFADevice');
    });

    // 失敗系: パスワードだけ盗んだ相手が有効な MFA を外せてはいけない。
    // AWS は有効なデバイスの削除前に Deactivate を要求するので、
    // Deactivate を除外しない限り DeleteVirtualMFADevice の解放は安全に保たれる。
    it('does NOT exempt iam:DeactivateMFADevice', () => {
      expect(asArray(statement().NotAction)).not.toContain('iam:DeactivateMFADevice');
    });

    // 失敗系: キーのローテーションには MFA セッションを要求する
    it('does NOT exempt any access key action', () => {
      const exempted = asArray(statement().NotAction);
      expect(exempted.filter((a) => a.includes('AccessKey'))).toEqual([]);
    });

    // --- リソーススコープの Deny (#181 レビュー指摘) -------------------
    // NotAction による除外はリソース非スコープなので、それ単体では
    // 「MFA なしで *自分の* 登録だけができる」を表現できていない。
    // IAMFullAccess のような広い許可を併せ持つと、MFA なしのセッションで
    // 他人のパスワードや MFA デバイスを操作できてしまう。
    describe('resource-scoped deny for the exempted actions', () => {
      it('exists, with the same MFA condition', () => {
        expect(scopedDeny()).toBeDefined();
        expect(scopedDeny().Effect).toBe('Deny');
        expect(scopedDeny().Condition).toEqual({
          BoolIfExists: { 'aws:MultiFactorAuthPresent': 'false' },
        });
      });

      it('limits the exemption to the caller own user and MFA device', () => {
        const raw = scopedDeny().NotResource;
        const notResource = (Array.isArray(raw) ? raw : [raw]).map(renderArn);

        expect(notResource.sort()).toEqual([
          `arn:\${AWS::Partition}:iam::${ACCOUNT}:mfa/\${aws:username}`,
          `arn:\${AWS::Partition}:iam::${ACCOUNT}:user/\${aws:username}`,
        ]);
      });

      // 中核の不変条件: グローバルに除外したアクションは、
      // アカウントレベルで絞りようがないものを除き、
      // すべてリソーススコープの Deny 側で拾われていなければならない。
      // どちらからも漏れたアクションは「誰に対してでも MFA なしで実行可能」になる。
      it('covers every globally exempted action that can target another user', () => {
        const globallyExempt = asArray(statement().NotAction);
        const scoped = asArray(scopedDeny().Action);

        const uncovered = globallyExempt.filter(
          (action) => !ACCOUNT_LEVEL.includes(action) && !scoped.includes(action),
        );

        expect(uncovered).toEqual([]);
      });

      // 失敗系: 逆にアカウントレベルのアクションを含めてしまうと、
      // リソースが一致しようがないので MFA 登録の入口が塞がる。
      it.each(ACCOUNT_LEVEL)('does NOT scope %s, which has no resource to match', (action) => {
        expect(asArray(scopedDeny().Action)).not.toContain(action);
      });
    });
  });

  // #173-#175 で追加されるグループへの不変条件。
  // グループが 0 件の現時点では自明に通るが、
  // ベースライン未付与のグループが足された瞬間に落ちる。
  it('attaches both baseline policies to every group in the stack', () => {
    const template = synth();

    // 論理 ID → ManagedPolicyName。グループは Ref で参照するので逆引きが要る。
    const policyIds: Record<string, string> = {};
    for (const [logicalId, resource] of Object.entries(
      template.findResources('AWS::IAM::ManagedPolicy'),
    ) as [string, any][]) {
      policyIds[resource.Properties.ManagedPolicyName] = logicalId;
    }

    for (const [groupId, group] of Object.entries(
      template.findResources('AWS::IAM::Group'),
    ) as [string, any][]) {
      const attached = JSON.stringify(group.Properties?.ManagedPolicyArns ?? []);

      for (const name of [SELF_SERVICE, DENY_WITHOUT_MFA]) {
        expect({
          group: groupId,
          missing: name,
          attachedRefs: attached,
        }).toEqual({
          group: groupId,
          missing: name,
          attachedRefs: expect.stringContaining(policyIds[name]),
        });
      }
    }
  });
});
