import { asArray, groups, managedPolicies, renderArns, synth } from './support/synth';

const READONLY = 'readonly';
const AUDIT = 'audit';
const DENY_SECRET_READS = 'deny-secret-reads';

const BASELINE = ['self-service-credentials', 'deny-without-mfa'];

/** Managed policy ARNs attached to a group, flattened to plain strings. */
const attachedTo = (groupName: string): string[] =>
  renderArns(groups()[groupName]?.ManagedPolicyArns ?? []);

describe('readonly and audit groups', () => {
  it.each([READONLY, AUDIT])('creates the %s group', (name) => {
    expect(Object.keys(groups())).toContain(name);
  });

  // 決定事項 (#173): ope は作らない。readonly と同等になるため。
  // 運用担当には readonly + 必要最小の書き込みを別途足す。
  it('does not create an ope group', () => {
    expect(Object.keys(groups())).not.toContain('ope');
  });

  // 既存の手動グループと名前が衝突すると CloudFormation が AlreadyExists で落ちる (#178)
  it.each(['dev_readonly', 'dev_user'])('does not collide with the existing %s group', (name) => {
    expect(Object.keys(groups())).not.toContain(name);
  });

  it('attaches ReadOnlyAccess to readonly', () => {
    expect(attachedTo(READONLY)).toContain('arn:${AWS::Partition}:iam::aws:policy/ReadOnlyAccess');
  });

  it('attaches SecurityAudit to audit', () => {
    expect(attachedTo(AUDIT)).toContain('arn:${AWS::Partition}:iam::aws:policy/SecurityAudit');
  });

  // 失敗系: readonly は「破壊的操作ができない権限」でなければならない
  it.each([READONLY, AUDIT])(
    '%s carries no write-capable AWS managed policy',
    (name) => {
      const forbidden = ['AdministratorAccess', 'PowerUserAccess', 'IAMFullAccess'];
      for (const policy of forbidden) {
        expect(attachedTo(name).join('|')).not.toContain(`policy/${policy}`);
      }
    },
  );

  // #172 のベースラインは全グループに付く。付け忘れは静かな穴になる。
  it.each([READONLY, AUDIT])('attaches both MFA baseline policies to %s', (name) => {
    const ids = Object.entries(synth().findResources('AWS::IAM::ManagedPolicy'))
      .filter(([, r]) => BASELINE.includes((r as any).Properties.ManagedPolicyName))
      .map(([logicalId]) => logicalId);

    expect(ids).toHaveLength(BASELINE.length);
    for (const id of ids) {
      expect(JSON.stringify(groups()[name].ManagedPolicyArns)).toContain(id);
    }
  });
});

describe(DENY_SECRET_READS, () => {
  const statements = () => managedPolicies()[DENY_SECRET_READS];

  it('is attached to both groups', () => {
    const [logicalId] = Object.entries(synth().findResources('AWS::IAM::ManagedPolicy'))
      .filter(([, r]) => (r as any).Properties.ManagedPolicyName === DENY_SECRET_READS)
      .map(([id]) => id);

    for (const name of [READONLY, AUDIT]) {
      expect(JSON.stringify(groups()[name].ManagedPolicyArns)).toContain(logicalId);
    }
  });

  it('denies, never allows', () => {
    for (const statement of statements()) {
      expect(statement.Effect).toBe('Deny');
    }
  });

  // ReadOnlyAccess は Secrets Manager の値そのものと KMS 復号を含む。
  // kms:Decrypt を止めることで SSM SecureString の復号読み出しも塞がる。
  it.each(['secretsmanager:GetSecretValue', 'kms:Decrypt'])(
    'denies %s',
    (action) => {
      expect(statements().flatMap((s) => asArray(s.Action))).toContain(action);
    },
  );

  // このリポジトリ固有の実害:
  // ReadOnlyAccess の lambda:GetFunctionConfiguration で環境変数が平文で読める。
  // voicevox-authorizer は API_KEY を、voicevox-slack-alert は SLACK_WEBHOOK_URL を持つ。
  describe('lambda environment variables holding secrets', () => {
    const lambdaDeny = () =>
      statements().find((s) =>
        asArray(s.Action).includes('lambda:GetFunctionConfiguration'),
      )!;

    it.each(['lambda:GetFunction', 'lambda:GetFunctionConfiguration'])(
      'denies %s on the functions that carry secrets',
      (action) => {
        expect(asArray(lambdaDeny().Action)).toContain(action);
      },
    );

    it.each(['voicevox-authorizer-', 'voicevox-slack-alert-'])(
      'covers %s across every environment',
      (prefix) => {
        const covered = renderArns(lambdaDeny().Resource).some(
          (arn) => arn.includes(`function:${prefix}`) && arn.endsWith('*'),
        );
        expect(covered).toBe(true);
      },
    );

    // 境界値: 調査対象そのものである engine 関数まで塞いだら readonly の意味がない。
    // ここが `*` になっていないことを確認する。
    it('does not block the engine function, which holds no secret', () => {
      const arns = renderArns(lambdaDeny().Resource);

      expect(arns).not.toContain('*');
      for (const arn of arns) {
        expect(arn).not.toMatch(/function:voicevox-engine/);
      }
    });
  });
});
