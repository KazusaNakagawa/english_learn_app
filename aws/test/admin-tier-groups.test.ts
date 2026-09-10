import { asArray, groups, managedPolicies, renderArns, synth } from './support/synth';

const arnsOn = (groupName: string) => renderArns(groups()[groupName]?.ManagedPolicyArns ?? []);
const awsManaged = (name: string) => `arn:\${AWS::Partition}:iam::aws:policy/${name}`;

/**
 * Groups a person belongs to *instead of* another — their permission tier.
 * Each one's deny statements reach every other group the same user is in,
 * so these cannot be combined. See the composition tests below.
 *
 * `audit` is a tier, not an add-on: it carries `deny-secret-reads`, which is
 * exactly the kind of deny that propagates. Classifying it as additive would
 * have repeated the billing defect one level up (#188 review).
 */
const TIER_GROUPS = ['readonly', 'audit', 'develop', 'infra', 'admin'];

/** Groups layered on top of a tier. These must deny nothing at all. */
const ADDITIVE_GROUPS = ['billing'];

describe('infra group', () => {
  it('exists with PowerUserAccess', () => {
    expect(arnsOn('infra')).toContain(awsManaged('PowerUserAccess'));
  });

  // PowerUserAccess は IAM を含まないので、グループ運用には別途 IAM 権限が要る
  it('can administer the groups this stack defines', () => {
    const actions = managedPolicies()['infra-administration']
      .filter((s) => s.Effect === 'Allow')
      .flatMap((s) => asArray(s.Action));

    expect(actions).toEqual(
      expect.arrayContaining([
        'iam:AddUserToGroup',
        'iam:RemoveUserFromGroup',
        'iam:CreateUser',
        'iam:CreateRole',
        // ポリシーを作れても貼れなければ意味がない
        'iam:CreateGroup',
        'iam:AttachGroupPolicy',
        'iam:AttachUserPolicy',
      ]),
    );
  });

  // 失敗系 (#188 レビュー): オフボーディングが成立すること。
  // self-service-credentials により全ユーザが自分でアクセスキーを作れるので、
  // 退職者を消そうとすると IAM が DeleteConflict を返す:
  //   "Cannot delete entity, must delete access keys first"
  // 子エンティティを消す権限がないと infra はユーザを削除できない。
  it.each([
    'iam:DeleteAccessKey',
    'iam:DeactivateMFADevice',
    'iam:DeleteVirtualMFADevice',
    'iam:DetachUserPolicy',
    'iam:DeleteUserPolicy',
  ])('can offboard a user by removing %s', (action) => {
    const actions = managedPolicies()['infra-administration']
      .filter((s) => s.Effect === 'Allow')
      .flatMap((s) => asArray(s.Action));

    expect(actions).toContain(action);
  });

  // 失敗系: infra は管理者ではない。組織レベルの操作は admin/root の領域。
  it('is denied organization control', () => {
    const denied = managedPolicies()['infra-administration']
      .filter((s) => s.Effect === 'Deny')
      .flatMap((s) => asArray(s.Action));

    expect(denied).toEqual(expect.arrayContaining(['organizations:LeaveOrganization']));
  });

  it('does not carry AdministratorAccess', () => {
    expect(arnsOn('infra')).not.toContain(awsManaged('AdministratorAccess'));
  });

  // #188 レビュー指摘 2 への対応。
  // infra は iam:CreatePolicyVersion / SetDefaultPolicyVersion を持つので、
  // deny-without-mfa を空の文書に差し替えれば
  // アカウント全体の MFA 強制を 1 コマンドで無効化できてしまう。
  // 昇格経路（自前ロールを作って assume）は許容した上で、
  // 事故とカジュアルな変更は塞ぐ。
  it.each([
    'iam:CreatePolicyVersion',
    'iam:SetDefaultPolicyVersion',
    'iam:DeletePolicy',
    'iam:DeletePolicyVersion',
  ])('cannot rewrite this stack own policies via %s', (action) => {
    const guard = managedPolicies()['infra-administration'].find(
      (st) => st.Effect === 'Deny' && asArray(st.Action).includes(action),
    );

    expect(guard).toBeDefined();
    const guarded = renderArns(guard!.Resource);
    for (const name of ['self-service-credentials', 'deny-without-mfa', 'deny-secret-reads']) {
      expect(guarded.some((arn) => arn.endsWith(`:policy/${name}`))).toBe(true);
    }
  });
});

describe('policy self-protection', () => {
  // 上の Deny は名前のハードコード一覧に依存している。
  // 新しいポリシーを足して一覧に入れ忘れると、静かに無防備になる。
  it('guards every customer-managed policy this stack creates', () => {
    const created = Object.values(synth().findResources('AWS::IAM::ManagedPolicy'))
      .map((r: any) => r.Properties.ManagedPolicyName)
      .sort();

    const guard = managedPolicies()['infra-administration'].find(
      (st) => st.Sid === 'DenyRewritingThisStackPolicies',
    )!;
    const guarded = renderArns(guard.Resource)
      .map((arn) => arn.replace(/^.*:policy\//, ''))
      .sort();

    expect(guarded).toEqual(created);
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
  // 当初 `arn.startsWith('arn:')` で絞っていたが、customer-managed policy は
  // `{"Ref":"..."}` として出てくるため全部フィルタで落ち、
  // develop-workload を admin に貼っても通ってしまう空振りテストだった (#188 レビュー)。
  // 件数と中身を厳密に見る。
  it('carries nothing beyond AdministratorAccess and the MFA baseline', () => {
    const attached = arnsOn('admin');
    const baselineIds = Object.entries(
      synth().findResources('AWS::IAM::ManagedPolicy'),
    )
      .filter(([, r]) =>
        ['self-service-credentials', 'deny-without-mfa'].includes(
          (r as any).Properties.ManagedPolicyName,
        ),
      )
      .map(([logicalId]) => logicalId);

    expect(baselineIds).toHaveLength(2);
    expect(attached).toHaveLength(3);

    const expected = [
      ...baselineIds.map((id) => JSON.stringify({ Ref: id })),
      awsManaged('AdministratorAccess'),
    ];
    expect(attached.sort()).toEqual(expected.sort());
  });
});

describe('group composition', () => {
  /** IAM wildcard match: `ce:Get*` covers `ce:GetCostAndUsage`. */
  const matches = (pattern: string, action: string) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(
      action,
    );

  /**
   * Whether any policy in the stack denies `action` unconditionally.
   *
   * Two traps this has to avoid, both found in the #188 review:
   *  - `NotAction` denies everything *outside* its list, so a statement using
   *    it denies far more than `asArray(s.Action)` would ever report.
   *  - a deny of `ce:Get*` breaks billing exactly as `ce:*` did, so patterns
   *    must be glob-matched rather than compared as strings.
   *
   * Statements conditioned on MFA being absent are skipped: deny-without-mfa
   * denies nearly everything by design, and that is not a composition problem.
   */
  const deniedBy = (action: string): string[] =>
    Object.entries(managedPolicies()).flatMap(([policyName, statements]) =>
      statements
        .filter((s) => s.Effect === 'Deny')
        .filter((s) => !JSON.stringify(s.Condition ?? {}).includes('MultiFactorAuthPresent'))
        .filter((s) => {
          const allowed = asArray(s.NotAction);
          if (allowed.length > 0) return !allowed.some((p) => matches(p, action));
          return asArray(s.Action).some((p) => matches(p, action));
        })
        .map(() => policyName),
    );

  it('creates every tier and additive group', () => {
    for (const name of [...TIER_GROUPS, ...ADDITIVE_GROUPS]) {
      expect(Object.keys(groups())).toContain(name);
    }
  });

  // 中核の不変条件:
  // グループポリシーの Deny は、そのユーザが所属する *全* グループに効く。
  // 追加グループはどのティアとも組み合わせる前提なので、
  // どのポリシーもそれが必要とするアクションを Deny してはいけない。
  //
  // 実際 develop は当初 account:* / aws-portal:* / ce:* を Deny しており、
  // AWSBillingReadOnlyAccess はその 3 つすべてを必要とする。
  // つまり develop + billing で billing が死んでいた。
  it.each([
    'account:GetAccountInformation',
    'aws-portal:ViewBilling',
    'ce:GetCostAndUsage',
    'ce:GetCostForecast',
    'ce:DescribeCostCategoryDefinition',
    'budgets:ViewBudget',
    'billing:GetBillingData',
  ])('never denies %s, which the billing group needs', (action) => {
    expect(deniedBy(action)).toEqual([]);
  });

  // audit はティアなので他と組み合わさらないが、
  // SecurityAudit が organizations:Describe*/List* を含むことは変わらない。
  // organizations:* を丸ごと Deny すると、将来 audit を併用可能にした瞬間に壊れる。
  it.each([
    'organizations:DescribeOrganization',
    'organizations:ListAccounts',
    'iam:GenerateCredentialReport',
    'iam:GetAccountAuthorizationDetails',
  ])('never denies %s, which SecurityAudit grants', (action) => {
    expect(deniedBy(action)).toEqual([]);
  });

  // 逆側の確認: 本当に塞ぎたいものは塞げていること。
  // 上のマッチャが常に空配列を返すだけの張りぼてでないことも兼ねる。
  it.each([
    'organizations:LeaveOrganization',
    'account:CloseAccount',
    'account:StartPrimaryEmailUpdate',
    'secretsmanager:GetSecretValue',
  ])('still denies %s', (action) => {
    expect(deniedBy(action).length).toBeGreaterThan(0);
  });
});
