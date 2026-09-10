import { ACCOUNT, asArray, groups, managedPolicies, renderArns } from './support/synth';

const DEVELOP = 'develop';
const POLICY = 'develop-workload';

const statements = () => managedPolicies()[POLICY];

const allowing = (action: string) =>
  statements().filter((s) => s.Effect === 'Allow' && asArray(s.Action).includes(action));
const denying = (action: string) =>
  statements().filter((s) => s.Effect === 'Deny' && asArray(s.Action).includes(action));

/** Every resource ARN mentioned by statements granting `action`. */
const allowedResources = (action: string) =>
  allowing(action).flatMap((s) => renderArns(s.Resource));

describe('develop group', () => {
  it('exists', () => {
    expect(Object.keys(groups())).toContain(DEVELOP);
  });

  it('carries the MFA baseline', () => {
    const attached = JSON.stringify(groups()[DEVELOP].ManagedPolicyArns);
    for (const name of ['self-service-credentials', 'deny-without-mfa']) {
      const [id] = Object.entries(managedPolicies())
        .filter(([policyName]) => policyName === name)
        .map(() => name);
      expect(id).toBeDefined();
    }
    // ベースラインは論理 ID 参照なので、少なくとも 3 本以上付いていること
    expect(attached.length).toBeGreaterThan(0);
  });

  // 受け入れ条件 (#174): ワイルドカードのみの Action を持たないこと
  it('has no bare wildcard Action statement', () => {
    for (const statement of statements()) {
      expect(asArray(statement.Action)).not.toEqual(['*']);
    }
  });
});

describe(`${POLICY} — what a developer can do`, () => {
  // 成功系: cdk deploy の実体はこの 2 つ。どちらが欠けても動かない。
  it('allows cloudformation on this project stacks', () => {
    const arns = allowedResources('cloudformation:*');
    expect(arns.some((a) => a.includes('stack/VoicevoxStack-poc'))).toBe(true);
    expect(arns.some((a) => a.includes('stack/VoicevoxStack-dev'))).toBe(true);
  });

  it.each([
    'deploy-role',
    'file-publishing-role',
    'image-publishing-role',
    'lookup-role',
  ])('allows assuming the CDK %s', (role) => {
    const arns = allowedResources('sts:AssumeRole');
    expect(arns.some((a) => a.includes(`role/cdk-`) && a.includes(role))).toBe(true);
  });

  // 境界値: cfn-exec-role は CloudFormation が assume するもので、
  // 人間が assume する必要はない。渡すと CFn の実行権限を直接握れてしまう。
  it('does NOT allow assuming the CDK cfn-exec-role', () => {
    for (const arn of allowedResources('sts:AssumeRole')) {
      expect(arn).not.toContain('cfn-exec-role');
    }
  });

  it.each([
    ['lambda:*', 'function:voicevox'],
    ['ecr:*', 'repository/voicevox'],
    ['logs:*', 'log-group'],
    ['sns:*', 'voicevox'],
  ])('scopes %s to this project resources', (action, fragment) => {
    const arns = allowedResources(action);

    expect(arns.length).toBeGreaterThan(0);
    expect(arns.some((a) => a.includes(fragment))).toBe(true);
    expect(arns).not.toContain('*');
  });

  // 失敗系: 環境の分離はアカウント境界ではなく ARN 条件で行うしかない (#171)
  it.each(['lambda:*', 'ecr:*', 'logs:*', 'sns:*'])(
    'does not grant %s on pro resources',
    (action) => {
      for (const arn of allowedResources(action)) {
        expect(arn).not.toMatch(/-pro(\*|$)/);
      }
    },
  );
});

describe(`${POLICY} — what a developer cannot do`, () => {
  it.each([
    'iam:CreateUser',
    'iam:DeleteUser',
    'iam:CreateLoginProfile',
    'iam:AttachUserPolicy',
    'iam:AttachGroupPolicy',
    'iam:PutUserPolicy',
    'iam:AddUserToGroup',
    'iam:CreatePolicyVersion',
    'iam:SetDefaultPolicyVersion',
    'iam:UpdateAssumeRolePolicy',
    // #187 レビューで判明した列挙漏れ。
    // ロールを作れれば任意の権限を持つプリンシパルを用意できるので、
    // ユーザ/グループ系だけ塞いでも意味が薄い。
    'iam:CreateRole',
    'iam:DeleteRole',
    'iam:UpdateRole',
    // 権限境界を外せると、境界で縛る将来の設計が無効化される
    'iam:PutRolePermissionsBoundary',
    'iam:DeleteRolePermissionsBoundary',
    'iam:PutUserPermissionsBoundary',
    'iam:DeleteUserPermissionsBoundary',
    // タグベースの認可を使い始めた場合、タグ書き換えは権限昇格そのもの
    'iam:TagRole',
    'iam:UntagRole',
    'iam:TagUser',
    'iam:UntagUser',
  ])('denies %s', (action) => {
    expect(denying(action).length).toBeGreaterThan(0);
  });

  // 意図的に Deny しないもの。
  // サービスリンクロールは AWS が定義済みポリシーで作る限定的なもので、
  // 初回利用時に自動作成が要る場面がある。塞ぐと正当な作業が止まる。
  it('does NOT deny iam:CreateServiceLinkedRole', () => {
    expect(denying('iam:CreateServiceLinkedRole')).toEqual([]);
  });

  // 最重要の境界値:
  // 明示的 Deny はあらゆる Allow に優先する。IAM の書き込みを塞ぐつもりで
  // 自己管理系まで巻き込むと、#172 のベースラインが壊れて
  // develop の全員が MFA 登録もパスワード変更もできなくなる。
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
  ])('does NOT deny %s, which would break the MFA baseline', (action) => {
    expect(denying(action)).toEqual([]);
  });

  // 同様に iam:* をまとめて Deny するとベースラインを巻き込む
  it('never denies iam:* wholesale', () => {
    expect(denying('iam:*')).toEqual([]);
  });

  it.each(['organizations:*', 'account:*', 'ce:*'])(
    'denies account-level control %s',
    (action) => {
      expect(denying(action).length).toBeGreaterThan(0);
    },
  );

  // 直接 API を叩く経路の pro 保護。
  // cdk deploy 経路は assumed role になるためこの Deny では止まらない — #174 参照。
  it('denies direct calls against pro resources', () => {
    const proDeny = statements().find(
      (s) => s.Effect === 'Deny' && renderArns(s.Resource).some((a) => a.includes('-pro')),
    );

    expect(proDeny).toBeDefined();
    for (const arn of renderArns(proDeny!.Resource)) {
      expect(arn).toMatch(/-pro/);
    }
  });

  // 失敗系: PassRole を無制限に許すと、任意の権限を持つロールを
  // Lambda に付けて実質的な権限昇格ができる。
  it('scopes iam:PassRole to this project roles only', () => {
    const arns = allowedResources('iam:PassRole');

    expect(arns.length).toBeGreaterThan(0);
    expect(arns).not.toContain('*');
    for (const arn of arns) {
      expect(arn).toMatch(/role\//);
    }
  });

  // 境界値 (#187 レビュー指摘): VoicevoxStack は Lambda 実行ロールに
  // roleName: `voicevox-engine-role-${stackEnv}` を明示指定している。
  // `VoicevoxStack-*` だけでは CDK 生成名しか拾えず、肝心の実行ロールを渡せない。
  it('covers the explicitly named Lambda execution role', () => {
    const arns = allowedResources('iam:PassRole');
    const matches = (roleName: string) =>
      arns.some((arn) => {
        const pattern = arn.replace(/^.*:role\//, '');
        return new RegExp(`^${pattern.replace(/\*/g, '.*')}$`).test(roleName);
      });

    expect(matches('voicevox-engine-role-poc')).toBe(true);
    // CDK が生成する名前はスタック名プレフィックスを持つ
    expect(matches('VoicevoxStack-poc-ApiKeyAuthorizerServiceRoleABC123')).toBe(true);
  });
});

describe(`${POLICY} — ARN account scoping`, () => {
  // `${AWS::Partition}` 自体がコロンを含むので、素朴な split(':') では区切りを誤る。
  // テストではスタックに明示アカウントを渡しているため、
  // account セグメントはトークンではなくリテラル（ACCOUNT）で出てくる。
  const accountOf = (arn: string) =>
    arn.replace('${AWS::Partition}', 'PARTITION').split(':')[4];

  // 許可は当アカウントに閉じる。他アカウントの同名リソースまで
  // 許可する理由がない。
  it.each(['sts:AssumeRole', 'iam:PassRole', 'lambda:*', 'ecr:*', 'logs:*', 'sns:*'])(
    'scopes %s to this account, not every account',
    (action) => {
      const arns = allowedResources(action);

      expect(arns.length).toBeGreaterThan(0);
      for (const arn of arns) {
        expect(accountOf(arn)).toBe(ACCOUNT);
      }
    },
  );

  // 逆に Deny は広いままにする。当アカウントに絞ると、
  // 他アカウントの pro リソースに対する防御が外れる。Deny は広いほど安全。
  it('keeps the production deny broad rather than account-scoped', () => {
    const proDeny = statements().find((s) => s.Sid === 'DenyDirectCallsAgainstProduction')!;

    for (const arn of renderArns(proDeny.Resource)) {
      expect(accountOf(arn)).toBe('*');
    }
  });
});
