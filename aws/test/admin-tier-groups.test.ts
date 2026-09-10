import { asArray, groups, managedPolicies, renderArns } from './support/synth';

const arnsOn = (groupName: string) => renderArns(groups()[groupName]?.ManagedPolicyArns ?? []);
const awsManaged = (name: string) => `arn:\${AWS::Partition}:iam::aws:policy/${name}`;

/**
 * Groups a person belongs to *instead of* another — their permission tier.
 * Each one's deny statements reach every other group the same user is in,
 * so these cannot be combined. See the composition tests below.
 */
const TIER_GROUPS = ['readonly', 'develop', 'infra', 'admin'];

/** Groups layered on top of a tier. Nothing may deny what these need. */
const ADDITIVE_GROUPS = ['audit', 'billing'];

describe('infra group', () => {
  it('exists with PowerUserAccess', () => {
    expect(arnsOn('infra')).toContain(awsManaged('PowerUserAccess'));
  });

  // PowerUserAccess は IAM を含まないので、グループ運用には別途 IAM 権限が要る
  it('can administer the groups this stack defines', () => {
    const statements = managedPolicies()['infra-administration'];
    const actions = statements.flatMap((s) => asArray(s.Action));

    expect(actions).toEqual(
      expect.arrayContaining([
        'iam:AddUserToGroup',
        'iam:RemoveUserFromGroup',
        'iam:CreateUser',
        'iam:CreateRole',
      ]),
    );
  });

  // 失敗系: infra は管理者ではない。組織レベルの操作は admin/root の領域。
  it('is denied organizations control', () => {
    const denied = managedPolicies()['infra-administration']
      .filter((s) => s.Effect === 'Deny')
      .flatMap((s) => asArray(s.Action));

    expect(denied).toContain('organizations:*');
  });

  it('does not carry AdministratorAccess', () => {
    expect(arnsOn('infra')).not.toContain(awsManaged('AdministratorAccess'));
  });
});

describe('billing group', () => {
  // Issue には `Billing` と書いていたが、その ARN は存在しない。
  // フルアクセスは job-function/Billing 配下。ここは閲覧のみで足りる。
  it('uses AWSBillingReadOnlyAccess', () => {
    expect(arnsOn('billing')).toContain(awsManaged('AWSBillingReadOnlyAccess'));
  });

  // 失敗系: コスト確認のために PowerUser を配らない、が billing を分けた理由
  it.each(['PowerUserAccess', 'AdministratorAccess', 'ReadOnlyAccess'])(
    'does not carry %s',
    (policy) => {
      expect(arnsOn('billing')).not.toContain(awsManaged(policy));
    },
  );
});

describe('admin group (break-glass)', () => {
  it('exists with AdministratorAccess', () => {
    expect(arnsOn('admin')).toContain(awsManaged('AdministratorAccess'));
  });

  // 受け入れ条件 (#175): 平時のメンバーは 0 人。
  // CloudFormation 側でメンバーを持たせない = Users を宣言しない。
  it('declares no members', () => {
    expect(groups()['admin'].Users).toBeUndefined();
  });

  // 境界値: break-glass は専用ユーザ用。既存の開発者を admin に足しても
  // 効かない（下の composition テスト参照）ので、ベースライン以外は付けない。
  it('carries nothing beyond AdministratorAccess and the MFA baseline', () => {
    const extras = arnsOn('admin').filter(
      (arn) => !arn.includes('AdministratorAccess') && arn.startsWith('arn:'),
    );

    expect(extras).toEqual([]);
  });
});

describe('group composition', () => {
  /** Deny actions across every customer-managed policy in the stack. */
  const allDeniedActions = () =>
    Object.values(managedPolicies())
      .flat()
      .filter((s) => s.Effect === 'Deny')
      .flatMap((s) => asArray(s.Action));

  it('creates every tier and additive group', () => {
    for (const name of [...TIER_GROUPS, ...ADDITIVE_GROUPS]) {
      expect(Object.keys(groups())).toContain(name);
    }
  });

  // 中核の不変条件:
  // グループポリシーの Deny は、そのユーザが所属する *全* グループに効く。
  // 追加グループ (billing/audit) は任意のティアと組み合わせる前提なので、
  // どのポリシーもこれらが必要とするアクションを Deny してはいけない。
  //
  // 実際 develop は当初 account:* / aws-portal:* / ce:* を Deny しており、
  // AWSBillingReadOnlyAccess はその 3 つすべてを必要とする。
  // つまり develop + billing で billing が死んでいた (#175 で発見)。
  it.each([
    'account:GetAccountInformation',
    'aws-portal:ViewBilling',
    'ce:GetCostAndUsage',
    'ce:GetCostForecast',
    'budgets:ViewBudget',
  ])('never denies %s, which the billing group needs', (action) => {
    const denied = allDeniedActions();

    expect(denied).not.toContain(action);
    // ワイルドカードでの巻き込みも防ぐ
    const service = action.split(':')[0];
    expect(denied).not.toContain(`${service}:*`);
  });

  // 追加グループ audit(SecurityAudit) は設定読み取りが本体。
  // 秘密の読み取り Deny は意図的なので、そこは対象外。
  it.each(['iam:GenerateCredentialReport', 'iam:GetAccountAuthorizationDetails'])(
    'never denies %s, which the audit group needs',
    (action) => {
      expect(allDeniedActions()).not.toContain(action);
    },
  );
});
