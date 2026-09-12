import * as fs from 'fs';
import * as path from 'path';

/**
 * CloudFormation stack policy for `VoicevoxStack-pro` (#186).
 *
 * #174 established that production cannot be protected by an IAM deny: after
 * `sts:AssumeRole` on a CDK bootstrap role the caller's identity policy is no
 * longer evaluated, and that role is shared across poc/dev/pro. Termination
 * protection (shipped in #174) blocks deletion but not updates, so the update
 * half is this policy.
 *
 * It cannot live in the CDK app — `cdk.StackProps` has no `stackPolicy`, and
 * there is no L1 construct either; CloudFormation takes it through a separate
 * `SetStackPolicy` call. So the document is a committed file plus the wiring
 * that re-applies it, and this suite is what keeps the two in step.
 *
 * **Stack policies are deny-by-default.** Once one is attached, every update
 * action on an existing resource is refused unless a statement allows it — so
 * the `Allow` below is load-bearing, and widening it is how this protection
 * would be lost.
 */
const AWS_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '../..');
const POLICY_DIR = path.join(AWS_DIR, 'stack-policies');
const POLICY = path.join(POLICY_DIR, 'voicevox-pro.json');
const SCRIPT = path.join(REPO_ROOT, 'scripts/apply-stack-policy.sh');
const DOC = path.join(REPO_ROOT, 'docs/05.iam_group_design.md');

type Statement = {
  Sid?: string;
  Effect: string;
  Action: string | string[];
  Principal: string | string[];
  Resource: string | string[];
};

const asArray = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v]);

const statements = (): Statement[] =>
  JSON.parse(fs.readFileSync(POLICY, 'utf8')).Statement;

const actionsWith = (effect: string): string[] =>
  statements()
    .filter((s) => s.Effect === effect)
    .flatMap((s) => asArray(s.Action));

const scriptText = (): string => fs.readFileSync(SCRIPT, 'utf8');

const packageScripts = (): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(AWS_DIR, 'package.json'), 'utf8')).scripts;

describe('VoicevoxStack-pro stack policy', () => {
  describe('the policy document', () => {
    it('is committed under aws/, not applied by hand from a console', () => {
      expect(fs.existsSync(POLICY)).toBe(true);
    });

    // 成功系: 設定値の変更は通ること。これが通らないなら pro は凍結であって保護ではない。
    it('allows in-place modification', () => {
      expect(actionsWith('Allow')).toContain('Update:Modify');
    });

    // 失敗系: 置換と削除は拒否する。termination protection はスタックの削除しか止めない。
    it.each(['Update:Replace', 'Update:Delete'])('denies %s', (action) => {
      expect(actionsWith('Deny')).toContain(action);
    });

    // 失敗系: Allow 側が広がると deny-by-default ごと無効になる。
    // `Update:*` は Replace と Delete を含むので、これを許すと保護が消える。
    it.each(['Update:*', 'Update:Replace', 'Update:Delete'])(
      'never allows %s',
      (action) => {
        expect(actionsWith('Allow')).not.toContain(action);
      },
    );

    // 境界値: スタックポリシーは Principal が必須で、値は "*" しか意味を持たない
    // （IAM と違い、誰が呼んだかでは分岐できない — それが #174 の結論の要）。
    it('applies to every principal', () => {
      for (const statement of statements()) {
        expect(asArray(statement.Principal)).toEqual(['*']);
      }
    });

    // 境界値: 資源を絞ると、絞り忘れた資源が無防備になる。ここは全資源が対象。
    it('covers every resource', () => {
      for (const statement of statements()) {
        expect(asArray(statement.Resource)).toEqual(['*']);
      }
    });

    it('uses no effect other than Allow and Deny', () => {
      for (const statement of statements()) {
        expect(['Allow', 'Deny']).toContain(statement.Effect);
      }
    });

    // 境界値: poc / dev は日常的に作り直す環境なので、ポリシーを置いてはいけない。
    // 置くと開発中の置換がいちいち拒否される。
    it('exists for pro only', () => {
      const documents = fs
        .readdirSync(POLICY_DIR)
        .filter((name) => name.endsWith('.json'))
        .sort();

      expect(documents).toEqual(['voicevox-pro.json']);
    });
  });

  describe('re-application', () => {
    // 成功系: 「覚えておく」ではなく、pro デプロイの後に必ず走ること。
    // スタックポリシーは更新では消えないが、スタックを作り直すと消える。
    it('runs automatically after a pro deploy', () => {
      expect(packageScripts()['postdeploy:pro']).toContain('apply-stack-policy.sh');
    });

    it('is a committed, executable script', () => {
      expect(fs.existsSync(SCRIPT)).toBe(true);
      // eslint-disable-next-line no-bitwise
      expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
    });

    // 失敗系: ファイル名を変えただけでスクリプトが黙って何も適用しなくなるのを防ぐ。
    it('points at the policy file that exists', () => {
      expect(scriptText()).toContain('voicevox-${STACK_ENV}.json');
    });

    // 失敗系: 本番安全用スクリプトの env を既定値にしない。
    // `${1:-pro}` だと、引数を渡し忘れた将来の postdeploy:dev が
    // dev デプロイの最中に pro のポリシーを pro に貼り直してしまう。
    it('requires the environment to be named explicitly', () => {
      expect(scriptText()).not.toMatch(/STACK_ENV="\$\{1:-/);
    });

    // 失敗系: describe-stacks の stderr を捨てると、AccessDenied も
    // MFA 期限切れも「スタックが無い」と同じ扱いになる。#174 の経路で
    // pro がポリシー無しで動いている状態が、その誤報の裏に隠れる。
    it('does not discard the stderr of its describe-stacks probe', () => {
      expect(scriptText()).toMatch(/describe-stacks[\s\S]{0,200}?2>&1 >\/dev\/null/);
      expect(scriptText()).toContain('AccessDenied');
    });

    // 境界値: リージョンは CLI の既定解決に任せず、aws/bin/app.ts と同じ順で
    // 解決して明示的に渡す。未設定プロファイルだと CDK は ap-northeast-1 に
    // 作る一方、フックは別を見て「スタックが無い」と誤報告する。
    it('pins the region the way the CDK app resolves it', () => {
      expect(scriptText()).toContain('ap-northeast-1');
      expect(scriptText()).toContain('aws configure get region');
      for (const call of ['describe-stacks', 'set-stack-policy', 'get-stack-policy']) {
        const index = scriptText().indexOf(call);
        expect(index).toBeGreaterThan(-1);
        expect(scriptText().slice(index, index + 200)).toContain('--region "$REGION"');
      }
    });

    // 境界値: poc / dev の deploy に紛れ込んでいないこと。
    it.each(['postdeploy:poc', 'postdeploy:dev'])('does not hook %s', (script) => {
      expect(packageScripts()[script]).toBeUndefined();
    });
  });

  // 意図的な本番変更の手順が書かれていること。
  // 手順が無いと、最初に困った人がポリシーを外して終わる。
  describe('documentation', () => {
    const doc = () => fs.readFileSync(DOC, 'utf8');

    it.each([
      'aws cloudformation set-stack-policy',
      'aws cloudformation get-stack-policy',
      '--stack-policy-during-update-body',
    ])('documents %s', (command) => {
      expect(doc()).toContain(command);
    });

    // 失敗系: 緩和の解除を postdeploy:pro フックに任せる手順を書かないこと。
    // npm はデプロイが失敗すると postdeploy を走らせないので、置換デプロイが
    // 転んだ瞬間に Update:* が本番に貼られたまま残る。
    it('restores the policy from a trap, not from the postdeploy hook', () => {
      expect(doc()).toContain("trap 'scripts/apply-stack-policy.sh pro' EXIT INT TERM");
    });

    // 失敗系: --use-previous-template はデプロイ済みテンプレートの再適用なので、
    // 「置換を伴う変更」を運べない。地の文で仕組みを説明するのは良いが、
    // コピペできる手順として置くと、動かないものを案内することになる。
    it('offers no update-stack recipe that cannot carry the change', () => {
      const fenced = doc().match(/```[\s\S]*?```/g) ?? [];
      for (const block of fenced) {
        expect(block).not.toContain('update-stack');
      }
    });
  });
});
