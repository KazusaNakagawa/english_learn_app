# IAM グループを IaC 管理に移行する — 作業ログ

> **この文書の目的**
> 記事化の一次情報として、IAM グループを手動管理から CDK 管理へ移行する過程を時系列で残す。
> 結論だけでなく、**迷った点・判断理由・実際に踏んだ地雷**を書くこと。記事の価値はそこにしかない。
>
> **運用ルール**: 本件の PR を出すたびに、対応する日付セクションへ追記してから PR を出す。
> 追記なしで PR をマージしない（記憶が新しいうちしか書けない情報が失われるため）。

---

## 記事の想定構成（暫定）

| 章 | 内容 | 主なソース |
| --- | --- | --- |
| 1. なぜやるか | 個人 AWS アカウントでもグループ分割が要る理由 | 2026-09-10 §背景 |
| 2. 現状把握 | 既存 IAM の棚卸し。CLI での調べ方 | 2026-09-10 §現状調査 |
| 3. グループ構成の設計 | 採用したグループと、採用しなかったもの（`ope`） | 2026-09-10 §設計 |
| 4. MFA ベースライン | deny-without-MFA の落とし穴（自分を締め出す） | #172 |
| 5. CDK 実装 | VoicevoxStack とスタックを分ける理由、env サフィックスなしの判断 | #171 |
| 6. CDK bootstrap ロールの権限問題 | **記事の山場**。絞らずに文書化を選んだ理由 | 2026-09-10 §決定事項 |
| 6.5 assumed role に Deny は効かない | identity policy の Deny が assume 後のセッションに引き継がれない件。実際に設計を間違えた | 2026-09-10 §訂正 |
| 7. 既存グループからの移行 | `AlreadyExists` 問題、ロックアウト回避、2 段階廃止 | #178 |
| 8. まとめ | やってよかったこと / やらなくてよかったこと | — |

---

## 2026-09-10 — 要件整理・現状調査・Issue 化

### 背景

個人開発の AWS アカウント（VOICEVOX TTS バックエンドを CDK で運用）で、IAM グループを整備したくなった。

出発点の要件は `.agents/skills/prompt/aws-ioc.md` に書いたもの。
**このファイルはローカルの作業用プロンプトで、リポジトリにはコミットしていない**
（`.agents/skills/` 配下の他のファイルは追跡下にあるが、これは未追跡）。
参照先を辿れないと意味がないので、全文を以下に引用する:

```markdown
## 要件
IAM ユーザグループを作成したい。
一般的に採用されているグループ構成

- readonly: 障害/リソース調査 etc 破壊的操作ができない権限 開発者が使う
- develop: 開発者用 / CDK / Lambda / API GW etc インフラに依頼しなくてもある程度作業できる権限
- infra: 管理する上で対応できる一般的な権限
- ope: 運用監視用: readonly と同等であれば作成不要
- あと、私が抜けているロールがあれば提案お願いします

## 構成
- テンプレ化したいので IoC 管理
- VoicevoxStack とは別ファイルで管理できれば問題ない
```

### 現状調査

read-only の CLI 呼び出しのみで棚卸しした。

```bash
aws sts get-caller-identity --profile dev_user1
aws iam list-groups --profile dev_user1 --query 'Groups[].GroupName'
aws iam list-users  --profile dev_user1 --query 'Users[].UserName'
aws iam list-policies --profile dev_user1 --scope Local --query 'Policies[].PolicyName'

# アタッチ済み管理ポリシーとインラインポリシーは両グループ分を取る
# （片方だけだと下の表の「dev_user に MFA 強制なし」が裏取りできない）
for g in dev_readonly dev_user; do
  aws iam list-attached-group-policies --profile dev_user1 --group-name "$g" \
    --query 'AttachedPolicies[].PolicyName'
  aws iam list-group-policies --profile dev_user1 --group-name "$g" \
    --query 'PolicyNames'
done

aws cloudformation list-stacks --profile dev_user1 \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[].StackName'
```

結果:

| 項目 | 実態 |
| --- | --- |
| Account / region | `460*******`（単一）/ `ap-northeast-1` |
| IAM グループ | `dev_readonly`（`ReadOnlyAccess` + インライン `EnforceMFA`）、`dev_user`（`IAMFullAccess` + `PowerUserAccess`、**MFA 強制なし**） |
| IAM ユーザ | `dev_readonly1`, `dev_user1` |
| カスタマー管理ポリシー | なし |
| ローカル profile | `dev_user1`, `dev_readonly1`, `dev_readonly1-mfa` |
| CFn スタック | `CDKToolkit` のみ（`VoicevoxStack-*` 未デプロイ） |

**記事にすべき発見**: `EnforceMFA` が `dev_readonly`（読み取り専用）にだけ付いていて、
`IAMFullAccess` を持つ `dev_user` には付いていなかった。リスクの所在と保護が逆になっている。
これは「とりあえず readonly から固めた」結果として起きやすい典型的なパターンだと思う。

### 設計

単一アカウントに poc / dev / pro が同居しているため:

- `IamStack` は **env サフィックスなしの 1 スタック**（IAM はアカウントグローバル）
- 環境の分離はアカウント境界ではなく、**ポリシー内の ARN 条件**でやるしかない
- グループ名は IAM コンソールで人間が手打ちするので、安定した読みやすい名前にする（`dev_` プレフィックスは廃止）

要件になかったが追加提案したもの:

| 追加 | 理由 |
| --- | --- |
| MFA ベースライン（deny-without-MFA + 自己 credential 管理） | グループを分けても、MFA なしで通る長期キーが漏れれば意味が薄い |
| `audit`（`SecurityAudit`） | 設定監査。`ReadOnlyAccess` と違いオブジェクトの中身は読まない |
| `billing` | コスト確認は infra とは別の読者層。`PowerUserAccess` を要求すべきでない |
| `admin`（break-glass） | 常用 ID に `AdministratorAccess` を付けっぱなしにしない。平時メンバー 0 |
| GitHub Actions OIDC ロール | CI/CD はアクセスキーではなく短期ロールを assume。グループではなくロール |

**`ope` は作らない**。要件の記載どおり `readonly` と同等になるため。
運用担当には `readonly` + 監視で実際に必要な少数の書き込み（`logs:StartQuery`、
アラーム状態リセット、スモークテスト用 `lambda:InvokeFunction`）だけの narrow policy を足す。

### 決定事項: CDK bootstrap ロールの権限を絞らない

`develop` グループで `cdk deploy` を成立させるには、`cloudformation:*` に加えて
CDK bootstrap ロール（`cdk-*-deploy-role-*` 等）への `sts:AssumeRole` が要る。
これは**実質的に、そのスタックが定義できる範囲の管理者権限**を渡すことになる。

選択肢:

1. bootstrap ロールの信頼・権限ポリシーを絞る
2. 権限を許容した上で明文化する

**採用したのは 2。** 理由は運用コスト。絞ると、スタックに新しいリソースタイプを追加するたびに
デプロイが落ちて infra に解除を依頼することになり、self-service な `develop` グループを
作った意味自体が消える。過去に同じ構成で管理コストが手間になった経験がある。

この判断の帰結として `develop` は**サンドボックスではなく信頼済みグループ**という位置づけになる。

### 訂正: `*-pro` の deny は `cdk deploy` を止めない

当初この節に「実効的な統制」として次の 3 つを挙げていた:

1. MFA 強制
2. CloudTrail での `cdk-*` ロールへの `sts:AssumeRole` 可視化
3. `*-pro` の deny — 事故に対するガードレール

**3 は誤り。** PR #179 のレビューで指摘され、訂正する。

理由は IAM のポリシー評価の仕組み。`sts:AssumeRole` の後、以降の API 呼び出しは
**assume したロールのプリンシパルとして評価される**。呼び出し元ユーザの identity policy は
そのセッションでは評価されない。したがって `develop` グループに書いた `*-pro` の Deny は、
bootstrap ロールを assume した後のセッションには**一切効かない**。

さらに悪いことに、CDK の bootstrap ロール（`cdk-hnb659fds-deploy-role-<account>-<region>`）は
**アカウント + リージョン単位で 1 つ**であり、poc / dev / pro で共通。ロール側から見て
「どの環境向けのデプロイか」は区別できない。つまり `npm run deploy:pro` は deny を素通りする。

`*-pro` の deny が効くのは、ユーザ自身の credential で直接叩く場合だけ:

```bash
aws lambda delete-function --function-name voicevox-engine-pro   # ← これは止まる
npm run deploy:pro                                                # ← これは止まらない
```

事故の主経路は後者なので、ガードレールとしてはほぼ機能していなかったことになる。

#### 単一アカウントで取れる代替案

| 案 | 効くか | コスト | 判断 |
| --- | --- | --- | --- |
| SCP で pro を保護 | ○ | AWS Organizations が必要 | 現状 Organizations なしのため**不可** |
| 環境ごとに AWS アカウントを分ける | ◎（本来の答え） | 大 | 今回は見送り。将来の検討事項 |
| bootstrap ロールを環境別 qualifier で分ける | ○ | 中〜大 | 「絞らない」判断と矛盾するため見送り |
| CFn の**削除保護 + スタックポリシー**を `VoicevoxStack-pro` に付ける | ○ | **小** | **採用**。プリンシパルに依存せずスタック側で効く |
| bootstrap ロールの信頼ポリシーに MFA 条件 | △（pro は止まらないが底上げ） | 小 | 採用 |

**採用: 削除保護 + スタックポリシー。** これはアイデンティティ側ではなく**リソース側**の防御なので、
誰がどのロールで来ても効く。ロールを絞る運用コストを払わずに事故だけ止められるという点で、
今回の「絞らない」判断と両立する。

> `develop` に対する pro の防御は、identity policy ではなく**スタック側**で行う。
> これを設計書（#176）に明記し、#174 の受け入れ条件からは
> 「`npm run deploy:pro` が `AccessDenied` になること」を削除する（**設計上そうならない**ため）。

> 記事では「絞れば安全」という素朴な結論に落とさず、
> **権限を絞ることの継続的コスト**と**明文化して受け入れる**という選択肢を対比させたい。
> あわせて、**identity policy の Deny が assumed role に引き継がれない**という
> 見落としやすい挙動も扱う（今回まさに踏んだ）。

### 移行の論点

既存グループが IaC 管理外にあるため、CDK は同名グループを作れない（`AlreadyExists` で失敗）。
新名称で作って移し替える方式を採用（`cdk import` は 2 グループ 2 ユーザには割に合わない）。

また **IAM グループには enable/disable のスイッチがない**。
「無効化」に相当するのは (1) 全メンバーを外す (2) 全ポリシーをデタッチ、で空の器にすること。
一方 IAM **ユーザ**はアクセスキーの `Inactive` 化という本物の無効化ができる。
この非対称性を利用して 2 段階で廃止する（詳細は #178）。

ロックアウト注意: `dev_user1` はアカウント内で唯一 `IAMFullAccess` を持つ。
新グループでの検証が済む前に旧グループから外すと、誰も直せなくなる。
また MFA ベースライン適用後は非 MFA の `dev_user1` profile が使えなくなるため、
`dev_user1-mfa` profile の整備が先。

### 起票した Issue

| # | Title |
| --- | --- |
| [#177](https://github.com/KazusaNakagawa/english_learn_app/issues/177) | **epic:** IAM user groups managed as IaC in a dedicated CDK stack |
| [#171](https://github.com/KazusaNakagawa/english_learn_app/issues/171) | chore(aws): scaffold IamStack separate from VoicevoxStack |
| [#172](https://github.com/KazusaNakagawa/english_learn_app/issues/172) | feat(aws): add MFA baseline policy and self-service credentials group |
| [#173](https://github.com/KazusaNakagawa/english_learn_app/issues/173) | feat(aws): add readonly and audit IAM groups |
| [#174](https://github.com/KazusaNakagawa/english_learn_app/issues/174) | feat(aws): add develop IAM group for CDK/Lambda/API GW work |
| [#175](https://github.com/KazusaNakagawa/english_learn_app/issues/175) | feat(aws): add infra, billing, and break-glass admin IAM groups |
| [#178](https://github.com/KazusaNakagawa/english_learn_app/issues/178) | chore(aws): migrate dev_readonly/dev_user groups to the new IAM groups |
| [#176](https://github.com/KazusaNakagawa/english_learn_app/issues/176) | docs(aws): document IAM group design and user onboarding runbook |

---

## 2026-09-10 — #171 IamStack のスキャフォールド

### やったこと

- `aws/lib/iam-stack.ts` を新規作成。リソースはまだ 0 件の器のみ（env サフィックスなし）
- `aws/bin/iam-app.ts` を新規作成。IAM 専用の CDK app エントリ
  （当初は `bin/app.ts` に相乗りさせたが、レビュー指摘を受けて分離。下記「訂正」参照）
- テスト基盤（jest + ts-jest）を導入し、`aws/test/` に 18 ケース
- `package.json` に `deploy:iam` / `diff:iam` / `synth:iam` / `destroy:iam` を追加。
  いずれも `--app` で `bin/iam-app.ts` を指す

### ハマった点

#### 1. スタックを 2 つにした瞬間、既存の npm script が全部壊れた

> 最終的に app エントリを分けたため、この PR ではスクリプトを元に戻している。
> ただし「1 つの app に 2 つ目のスタックを足すと起きること」として記録しておく。

`cdk deploy -c env=poc` のようにスタック名を省略した書き方をしていたため、
app に 2 つ目のスタックを足した時点でこうなる:

```
Since this app includes more than a single stack, specify which stacks to use (wildcards are supported) or specify `--all`
Stacks: VoicevoxStack-poc · IamStack
```

`deploy` / `diff` / `synth` / `destroy` × `poc` / `dev` / `pro` の 12 個すべてが対象。
**全スクリプトにスタック名を明示**して解決した:

```diff
-"deploy:poc": "cdk deploy -c env=poc",
+"deploy:poc": "cdk deploy VoicevoxStack-poc -c env=poc",
```

スタックが 1 つしかないうちは名前を省略できてしまうので、
**2 つ目を足すときに初めて顕在化する**。単一スタックの CDK プロジェクトに
共通の落とし穴だと思う。

#### 2. `jest.config.js` が `.gitignore` に消された

`aws/.gitignore` の 1 行目が `*.js`（tsc の出力を無視するため）。
新規作成した `jest.config.js` がこれに巻き込まれ、`git status` に出てこなかった。
気づかず PR を出していたら、他の環境で `npm test` が動かない。

```console
$ git check-ignore -v aws/jest.config.js
aws/.gitignore:1:*.js	aws/jest.config.js
```

既に `!lambda/**/*.js` という否定パターンの前例があったので、同じ書き方で例外にした:

```gitignore
# Jest config is hand-written, not tsc output
!jest.config.js
```

**教訓**: 生成物を無視するリポジトリで手書きの `.js` を足すときは
`git check-ignore` を通す。`git status` に出ないことをもって
「変更なし」と判断しない。

### 判断が分かれた点

#### app エントリを分けるか、1 つの app に相乗りさせるか

#171 の Goal は「`VoicevoxStack` から独立してデプロイできること」。
`bin/app.ts` に相乗りさせると、IAM をいじるだけでも VOICEVOX の
Docker イメージビルドが走るのでは、という懸念があった。

実測したところ Docker ビルドは**走らなかった**:

```console
$ time npx cdk synth IamStack -c env=poc
npx cdk synth IamStack -c env=poc  3.36s user 0.36s system 131% cpu 2.819 total
```

CDK v2 の `DockerImageAsset` は synth 時点ではアセットマニフェストを出すだけで、
実ビルドは deploy のアセット publish 段階。マニフェストはスタック単位でもある。

**この結果をもって「app エントリは分けない」と判断したが、これは誤りだった。**
見ていた依存が Docker だけで、環境変数の依存を見落としていた。次項で訂正する。

#### 訂正: 相乗りさせると VOICEVOX の API キーなしで IAM 操作ができない

PR #180 のレビューで指摘された。**CDK の app は、CLI がスタックセレクタを
適用する前に、宣言されている全スタックを構築する。** そして `VoicevoxStack` の
constructor は API キーが未設定だと throw する:

```ts
const apiKeyEnvVar = `VOICEVOX_API_KEY_${stackEnv.toUpperCase()}`;
const apiKeyValue = process.env[apiKeyEnvVar];
if (!apiKeyValue) {
  throw new Error(`API key not found. Set environment variable: ${apiKeyEnvVar}\n` + ...);
}
```

つまり `cdk synth IamStack` と書いても `VoicevoxStack` の構築は先に走り、落ちる:

```console
$ DOTENV_CONFIG_PATH=/dev/null npx cdk synth IamStack -c env=poc
Error: API key not found. Set environment variable: VOICEVOX_API_KEY_POC
    at new VoicevoxStack (.../lib/voicevox-stack.ts:131:13)
    at Object.<anonymous> (.../bin/app.ts:20:1)
```

IAM と何の関係もない VOICEVOX の資格情報が、IAM 操作の前提条件になっていた。
Goal の「独立してデプロイできる」を満たしていない。

**なぜ検証をすり抜けたか**: ローカルに `.env` があり、`bin/app.ts` の
`import 'dotenv/config'` がそれを読んでいたため、手元では常に成功していた。
**自分の環境で通ることは、独立性の証明にならない。**
以降 IAM 側の検証は `DOTENV_CONFIG_PATH=/dev/null` と `env -u` で
クリーン環境を再現して行う。

→ **app エントリを分ける**。`bin/iam-app.ts` を新設し、`:iam` 系スクリプトは
`--app` でそちらを指す。`bin/iam-app.ts` には `dotenv/config` を**入れない**
（`.env` を必要としないことを構造として担保する。`CDK_DEFAULT_ACCOUNT` /
`CDK_DEFAULT_REGION` は CDK CLI 自身が注入する）。

回帰防止として、誰かが `VoicevoxStack` をこのエントリに足したら落ちるテストを置いた。
なおこのテストは最初 `expect(source).not.toContain('VoicevoxStack')` と書いていて、
**「なぜ分けたか」を説明するコメント自体に反応して落ちた**。
import 文と生成箇所だけを見る正規表現に直している。

app を分けた結果、`bin/app.ts` のスタックは 1 つのままなので、
「ハマった点 1」で全スクリプトに付けたスタック名の明示は不要になり、元に戻した。
`bin/app.ts` への変更は説明コメントの追加のみ。

### 検証コマンドと結果

```console
$ npm run build          # AC1
$ npm test               # 18 passed
```

AC2 は**クリーン環境を再現して**確認する。手元の `.env` が読まれる状態では
独立性を検証したことにならない（上の訂正参照）:

```console
$ env -u VOICEVOX_API_KEY_POC -u VOICEVOX_API_KEY_DEV -u VOICEVOX_API_KEY_PRO \
    DOTENV_CONFIG_PATH=/dev/null npm run synth:iam
Resources:
  CDKMetadata:
    ...
```

AC3「`synth:poc` が従来どおり `VoicevoxStack-poc` を出す」は、
目視ではなく **develop 時点のテンプレートとバイト単位で比較**して確認した:

```console
$ npm run synth:poc && cp cdk.out/VoicevoxStack-poc.template.json /tmp/after.json
$ git stash push bin/app.ts package.json          # develop 相当に戻す
$ npx cdk synth -c env=poc && cp cdk.out/VoicevoxStack-poc.template.json /tmp/before.json
$ git stash pop
$ diff /tmp/before.json /tmp/after.json
（差分なし）
```

AC4（スタック間の分離）:

| 確認 | 結果 |
| --- | --- |
| `IamStack` のリソース種別 | `["AWS::CDK::Metadata"]` のみ |
| `VoicevoxStack-poc` 内の `AWS::IAM::Group` | 0 件 |
| `IamStack` 内の Lambda / ECR / ApiGateway / SNS / CloudWatch | 0 件 |

AC5（既存グループに影響しないこと）は実アカウントに対して確認:

```console
$ npm run diff:iam
Stack IamStack
Parameters
[+] Parameter BootstrapVersion BootstrapVersion: {...}

✨  Number of stacks with differences: 1
```

新規スタックの `BootstrapVersion` パラメータのみ。
既存グループへの変更・削除は一切出ていない。デプロイはしていないので現状も不変:

```console
$ aws iam list-groups --profile dev_user1 --query 'Groups[].GroupName'
["dev_readonly", "dev_user"]
```

---

<!--
以降、PR ごとに追記する。テンプレート:

## YYYY-MM-DD — #NNN <タイトル>

### やったこと

### ハマった点
<エラーメッセージは省略せず貼る。記事で一番読まれる部分>

### 判断が分かれた点

### 検証コマンドと結果
```bash
```
-->
