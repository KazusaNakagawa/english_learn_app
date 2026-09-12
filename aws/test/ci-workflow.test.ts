import * as fs from 'fs';
import * as path from 'path';

/**
 * The CI workflow is what turns this suite from "protection on the machine of
 * whoever remembers to run it" into something that gates a merge (#192).
 *
 * So the workflow itself is pinned here. The two failures worth catching are
 * silent ones: a `paths:` filter that stops matching the files the tests guard,
 * and a step list that drops `npm test` while still looking like a CI run.
 *
 * Parsed as text rather than YAML on purpose — the repo has no YAML parser in
 * its dependency tree, and adding one to `aws/package.json` would mean CI's
 * `npm ci` depends on a package added solely to test CI.
 */
const REPO_ROOT = path.join(__dirname, '../..');
const WORKFLOW = path.join(REPO_ROOT, '.github/workflows/cdk-ci.yml');
const ARCHIVED = path.join(REPO_ROOT, '.github/workflows/cdk-ci.yml.bk');

const read = () => fs.readFileSync(WORKFLOW, 'utf8');

/** Single-line `run:` commands, in the order they appear. */
function runCommands(): string[] {
  return read()
    .split('\n')
    .map((line) => line.match(/^\s*(?:-\s+)?run:\s*(.+?)\s*$/)?.[1])
    .filter((command): command is string => Boolean(command));
}

/** Each `paths:` block, as the list of globs under it. */
function pathFilters(): string[][] {
  const lines = read().split('\n');
  const blocks: string[][] = [];

  lines.forEach((line, index) => {
    if (!/^\s*paths:\s*$/.test(line)) return;

    const indent = line.search(/\S/);
    const globs: string[] = [];
    for (let i = index + 1; i < lines.length; i++) {
      // A comment between globs is normal, and explaining why a path is in the
      // filter is exactly where a comment belongs.
      if (/^\s*(#|$)/.test(lines[i])) continue;

      const entry = lines[i].match(/^(\s*)-\s*['"]?([^'"]+?)['"]?\s*$/);
      if (!entry || entry[1].length < indent) break;
      globs.push(entry[2]);
    }
    blocks.push(globs);
  });

  return blocks;
}

describe('CDK CI workflow', () => {
  it('exists as a live workflow, not an archived one', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
  });

  // 失敗系: .bk が残っていると「どちらが本物か」が分からなくなる。
  it('leaves no archived copy behind', () => {
    expect(fs.existsSync(ARCHIVED)).toBe(false);
  });

  describe('trigger', () => {
    it('has a paths filter on both push and pull_request', () => {
      expect(pathFilters()).toHaveLength(2);
    });

    // 成功系: このスイート自体と、それが守る設計書の両方で発火すること。
    // docs/05 は design-doc.test.ts が守っている当のファイルで、
    // aws/** だけのフィルタでは doc だけの PR がすり抜ける (#192)。
    // scripts/apply-stack-policy.sh も同じ理由で必要 (#186)。
    // stack-policy.test.ts がこのスクリプトの実行ビットと参照先パスを固定しており、
    // スクリプトだけ触る PR は aws/** フィルタをすり抜ける。
    it.each([
      'aws/**',
      'docs/05.iam_group_design.md',
      'scripts/apply-stack-policy.sh',
      '.github/workflows/cdk-ci.yml',
    ])(
      'runs when %s changes',
      (target) => {
        for (const globs of pathFilters()) {
          expect(globs).toContain(target);
        }
      },
    );
  });

  describe('steps', () => {
    // 成功系: この Issue の本体。テストを走らせない CI は CI ではない。
    it('runs the Jest suite', () => {
      expect(runCommands().some((c) => /^npm (test|run test)\b/.test(c))).toBe(true);
    });

    // 成功系: CDK アプリは 2 つある。片方だけ synth しても IamStack は通らない。
    it.each(['npm run synth:iam', 'npm run synth:poc'])('synthesizes with %s', (script) => {
      expect(runCommands()).toContain(script);
    });

    // 境界値: 素の `cdk synth` は bin/app.ts しか見ないので IamStack を取りこぼす。
    // アーカイブされていた cdk-ci.yml.bk がまさにこれだった。
    it('never calls cdk synth without going through an npm script', () => {
      for (const command of runCommands()) {
        expect(command).not.toMatch(/^(npx )?cdk synth/);
      }
    });

    // 失敗系: デプロイは MFA セッション越しの手動運用のまま (#192 non-goals)。
    it('deploys nothing', () => {
      for (const command of runCommands()) {
        expect(command).not.toMatch(/\bcdk (deploy|destroy)\b/);
        expect(command).not.toMatch(/\bdeploy:(poc|dev|pro|iam)\b/);
      }
    });
  });

  // 境界値: シークレットを参照した瞬間、fork からの PR で動かなくなる。
  // 合成にもテストにも本物の資格情報は要らない。
  it('needs no repository secrets', () => {
    expect(read()).not.toMatch(/\$\{\{\s*secrets\./);
  });
});
