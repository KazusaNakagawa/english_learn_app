import * as fs from 'fs';
import * as path from 'path';
import { groups, renderArns, synth } from './support/synth';

const DOC = path.join(__dirname, '../../docs/05.iam_group_design.md');

/**
 * The design doc's group matrix is the thing people read before asking for
 * access, so it going stale is worse than it not existing — it would be
 * confidently wrong. This Epic already produced several comments that rotted
 * one issue after they were written, so the table is pinned to the template.
 *
 * Expected row shape (leading/trailing pipes, cells trimmed):
 *   | `readonly` | ... | `ReadOnlyAccess`, `deny-secret-reads` | ... |
 */
const readDoc = () => fs.readFileSync(DOC, 'utf8');

/** 0-indexed position of the policy column in the group matrix. */
const POLICY_COLUMN = 1;

/**
 * AWS managed policies this stack is allowed to attach, as they appear after
 * `:iam::aws:policy/`. Pinned as literals on purpose: the template cannot tell
 * you whether a name exists in AWS, and `arn:aws:iam::aws:policy/Billing` — a
 * name that does not exist, full access lives at `job-function/Billing` — was
 * written into an issue during #175 before anyone checked.
 *
 * Adding a policy means adding it here too, which is the moment to confirm the
 * ARN resolves: `aws iam get-policy --policy-arn arn:aws:iam::aws:policy/<name>`.
 */
const ALLOWED_AWS_MANAGED_POLICIES = [
  'AdministratorAccess',
  'AWSBillingReadOnlyAccess',
  'PowerUserAccess',
  'ReadOnlyAccess',
  'SecurityAudit',
];

/** Group name -> the policy names its row claims, from the matrix table. */
function documentedMatrix(): Record<string, string[]> {
  const rows: Record<string, string[]> = {};

  for (const line of readDoc().split('\n')) {
    const match = line.match(/^\|\s*`([a-z]+)`\s*\|(.+)\|\s*$/);
    if (!match) continue;

    const [, group, rest] = match;
    // 列位置で取る。`find` だと想定利用者欄にバッククォートが入った瞬間に
    // 別の列を掴んでしまい、しかも黙って通る。
    const cells = rest.split('|').map((c) => c.trim());
    const policyCell = cells[POLICY_COLUMN];

    // ポリシー名には数字もアンダースコアも入りうる（AWSLambda_ReadOnlyAccess 等）。
    // ベースラインのみのグループは `—` と書く。
    if (policyCell === '—') {
      rows[group] = [];
      continue;
    }
    if (!/^`[\w-]+`(,\s*`[\w-]+`)*$/.test(policyCell)) {
      throw new Error(
        `matrix row for \`${group}\` has an unparsable policy cell: ${JSON.stringify(policyCell)}. ` +
          'Expected backticked names separated by commas, or — for none. ' +
          'Silently skipping it would surface later as "group not documented", which is misleading.',
      );
    }

    rows[group] = policyCell.split(',').map((p) => p.trim().replace(/`/g, ''));
  }

  return rows;
}

/** Group name -> policy names actually attached, resolved from the template. */
function synthesizedMatrix(): Record<string, string[]> {
  const logicalToName: Record<string, string> = {};
  for (const [id, resource] of Object.entries(
    synth().findResources('AWS::IAM::ManagedPolicy'),
  ) as [string, any][]) {
    logicalToName[id] = resource.Properties.ManagedPolicyName;
  }

  const rows: Record<string, string[]> = {};
  for (const [name, properties] of Object.entries(groups()) as [string, any][]) {
    rows[name] = (properties.ManagedPolicyArns ?? []).map((arn: any) => {
      if (arn?.Ref) return logicalToName[arn.Ref] ?? arn.Ref;
      return renderArns(arn)[0].split('/').pop() as string;
    });
  }
  return rows;
}

describe('docs/05.iam_group_design.md', () => {
  it('exists', () => {
    expect(fs.existsSync(DOC)).toBe(true);
  });

  // 成功系: 表に載っているグループ = 実際に作られるグループ
  it('documents exactly the groups the stack creates', () => {
    expect(Object.keys(documentedMatrix()).sort()).toEqual(Object.keys(groups()).sort());
  });

  // 境界値: 各行のポリシー欄が実体と一致すること。
  // MFA ベースライン 2 本は全グループ共通なので表からは省き、本文で説明する。
  const BASELINE = ['self-service-credentials', 'deny-without-mfa'];

  it.each(['readonly', 'audit', 'develop', 'infra', 'billing', 'admin'])(
    'lists the right policies for %s',
    (group) => {
      const documented = documentedMatrix()[group] ?? [];
      const actual = (synthesizedMatrix()[group] ?? []).filter(
        (p) => !BASELINE.includes(p),
      );

      expect(documented.sort()).toEqual(actual.sort());
    },
  );

  // 失敗系: 表に載る名前がスタックのポリシー集合に含まれること。
  // これはドキュメントとテンプレートの一致確認であって、
  // AWS 側にその名前が実在するかは見ていない（下のテストがそれを担う）。
  it('names only policies the stack actually references', () => {
    const known = new Set([
      ...Object.values(synthesizedMatrix()).flat(),
      ...BASELINE,
    ]);

    for (const [group, policies] of Object.entries(documentedMatrix())) {
      for (const policy of policies) {
        expect({ group, policy, known: known.has(policy) }).toEqual({
          group,
          policy,
          known: true,
        });
      }
    }
  });

  // 失敗系: AWS 管理ポリシーの ARN が、実在すると確認済みのものだけであること。
  //
  // 上のテストはテンプレート自身を正解として使うので、
  // `fromAwsManagedPolicyName('Billing')` と書いて表もそう直せば両方通ってしまい、
  // 落ちるのは cdk deploy 時の NoSuchEntity になる。ここはパス込みで固定する。
  it('attaches only AWS managed policies verified to exist', () => {
    const attached = Object.values(synth().findResources('AWS::IAM::Group'))
      .flatMap((g: any) => g.Properties.ManagedPolicyArns ?? [])
      .filter((arn: any) => !arn?.Ref)
      .map((arn: any) => renderArns(arn)[0])
      .filter((arn: string) => arn.includes(':iam::aws:policy/'))
      // パスを潰さない: `job-function/Billing` と `Billing` は別物
      .map((arn: string) => arn.split(':iam::aws:policy/')[1]);

    // 定数は人が読む順で書き、比較時に同じ基準で並べ直す
    expect([...new Set(attached)].sort()).toEqual([...ALLOWED_AWS_MANAGED_POLICIES].sort());
  });

  // 運用手順が本文に含まれていること。
  // 受け入れ条件が「コピペできる aws CLI コマンド」なので、実際に載っているか見る。
  it.each([
    'aws iam create-user',
    'aws iam add-user-to-group',
    'aws iam remove-user-from-group',
    'aws iam delete-access-key',
    'aws iam delete-user',
    'npm run diff:iam',
    'npm run deploy:iam',
  ])('includes the runbook command %s', (command) => {
    expect(readDoc()).toContain(command);
  });
});
