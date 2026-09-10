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

## 2026-09-10 — #172 MFA ベースライン

### やったこと

既存の `dev_readonly` にインラインで付いていた `EnforceMFA` を読み、
customer-managed policy 2 本として `IamStack` に実装した。

| ポリシー | 役割 |
| --- | --- |
| `self-service-credentials` | 自分のパスワード / MFA デバイス / アクセスキーを管理できる |
| `deny-without-mfa` | MFA セッションでなければ、上記以外のすべてを拒否 |

既存ポリシーからの変更点は 3 つ。いずれも #172 で意識的に決めた。

#### 1. アクセスキーの自己管理を追加

既存ポリシーには `*AccessKey*` が一切なく、**ユーザは自分のキーをローテーションできなかった**。
実際 `dev_user1` のキーは 2026-02-14 作成から一度も交換されていない。
`Create` / `Update` / `Delete` / `ListAccessKeys` を Allow に追加した。

ただし Deny の `NotAction` には**入れない**。ローテーションには MFA セッションを要求する。

#### 2. `iam:DeleteVirtualMFADevice` を Deny の除外対象に追加

既存ポリシー（= AWS 公式サンプル）には登録中の詰み経路があった:

```console
$ aws iam create-virtual-mfa-device --virtual-mfa-device-name alice   # 通る
# QR 読み込みに失敗 / 画面を閉じる

$ aws iam create-virtual-mfa-device --virtual-mfa-device-name alice   # EntityAlreadyExists
$ aws iam delete-virtual-mfa-device --serial-number arn:...:mfa/alice  # AccessDenied
```

作りかけのデバイスを消せず、自力で回復できない。

除外に加えても安全な理由: **AWS は有効化済みの仮想 MFA デバイスの削除前に
`iam:DeactivateMFADevice` を要求する**。この Deactivate は `NotAction` に入れていないので、
パスワードだけを盗んだ相手が有効な MFA を外すことはできない。
解放されるのは「未割り当てデバイスの削除」だけ。

現状維持案を採らなかったのは、このアカウントで `IAMFullAccess` を持つのが `dev_user1` 
だけだから。それが詰むと root でしか復旧できない。

#### 3. `iam:DeactivateMFADevice` を Allow に追加

MFA デバイスの機種変更に必要。Allow には入れるが Deny の除外には入れない、
という 1 と同じ構造にした。

### ハマった点

#### テストの期待値のほうが間違っていた

「アカウント ID をベタ書きしない」ことを確認するテストで、
`arn:aws:iam::<account>:user/${aws:username}` という**平坦な文字列**を期待したら落ちた。
実際に `Stack.formatArn` が生成するのはこれ:

```json
{"Fn::Join": ["", ["arn:", {"Ref": "AWS::Partition"}, ":iam::<account>:user/${aws:username}"]]}
```

パーティションを `aws` 固定にせず deploy 時に解決している。
`aws-cn` / `aws-us-gov` でも動くので**実装のほうが正しい**。
`Fn::Join` を平坦化するヘルパをテストに足して対応した。

#### スコープ確認テストのフィルタが雑で `*` を拾った

「資格情報系のアクションは自分の ARN に限定されていること」を検証するのに、
`iam:` で始まるアクションを含む文を全部集めていたら、
`Resource: "*"` の `AllowViewAccountInfo`（`ListVirtualMFADevices` 等）まで拾って落ちた。

対象アクションを明示列挙し、それぞれを許可している文だけを見る形に直した。
`it.each` で 9 アクション分に分かれるので、どれが `*` になったかも一目で分かる。

#### `${aws:username}` を TS のテンプレートリテラルに置かない

IAM のポリシー変数であって CDK トークンではない。
バッククォート内に書くと TypeScript が展開してしまう。定数に切り出した:

```ts
const OWN_USERNAME = '${aws:username}';
```

### 判断が分かれた点

#### `all-users` グループを作るか、各グループに貼るか

Issue には「どちらか選べ」と書いていた。**各グループに貼る**方を採った。

`all-users` 方式は DRY だが、**ユーザを追加し忘れると MFA 強制が丸ごと抜ける**
という静かな失敗をする。各グループに貼る方式なら、貼り忘れたグループは
テストで落とせる。実際に不変条件テストを置いた:

> `attaches both baseline policies to every group in the stack`

グループ 0 件の現時点では自明に通るが、#173-#175 でベースライン未付与のグループが
足された瞬間に落ちる。

### 検証コマンドと結果

```console
$ npm test
Tests:       46 passed, 46 total

$ env -u VOICEVOX_API_KEY_POC -u VOICEVOX_API_KEY_DEV -u VOICEVOX_API_KEY_PRO \
    DOTENV_CONFIG_PATH=/dev/null npm run synth:iam   # OK
```

実アカウントに対する diff（読み取りのみ、未デプロイ）:

```console
$ npm run diff:iam
Resources
[+] AWS::IAM::ManagedPolicy SelfServiceCredentials SelfServiceCredentials5BE643D3
[+] AWS::IAM::ManagedPolicy DenyWithoutMfa DenyWithoutMfa0B185844
```

追加のみ。既存グループ・ユーザへの変更はなし。
この 2 本はどのグループにも未アタッチなので、デプロイしても**現時点では誰の実効権限も変わらない**。

### 訂正: `NotAction` の除外はリソース非スコープだった

PR #181 のレビューで指摘され、Deny 文を 2 本立てに直した。

`NotAction` は「このアクションは（このステートメントでは）拒否しない」という意味で、
**リソースを問わない**。つまり最初の実装は

> MFA なしでも「MFA 登録に必要なアクション」は誰に対してでも実行できる

という状態だった。単独なら害はない（Allow 側が自分の ARN に限定されているため）。
問題は**同じプリンシパルに広い IAM 許可が併存する場合**で、
既存の `dev_user` はまさに `IAMFullAccess` を持っている。この組み合わせだと
パスワードだけのセッションで他人のパスワード変更や MFA デバイス付け替えが通ってしまい、
ベースラインの意味が消える。

対処として、除外したアクションを**もう一度 `NotResource` 付きで Deny** する:

```json
{
  "Sid": "DenyOtherPeoplesCredentialsUnlessMfaAuthenticated",
  "Effect": "Deny",
  "Action": ["iam:ChangePassword", "iam:CreateVirtualMFADevice", "iam:DeleteVirtualMFADevice",
             "iam:EnableMFADevice", "iam:GetUser", "iam:ListMFADevices", "iam:ResyncMFADevice"],
  "NotResource": ["arn:...:user/${aws:username}", "arn:...:mfa/${aws:username}"],
  "Condition": {"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}}
}
```

これで除外の意味が「自分の資格情報を管理できる」に狭まる。

**アカウントレベルのアクションは意図的に含めない。**
`iam:ListVirtualMFADevices` / `iam:GetAccountPasswordPolicy` / `sts:GetSessionToken` は
リソース単位で絞れず、含めると `NotResource` に一致しようがないので必ず Deny になり、
MFA 登録の入口そのものが塞がる。

回帰防止として、この対応関係を不変条件テストにした:

> `covers every globally exempted action that can target another user`

グローバル除外リストからアクションを増やしたとき、
アカウントレベルでもリソーススコープ Deny でもないものが残っていれば落ちる。

**教訓**: `NotAction` は「除外」であって「限定」ではない。
自己管理系のポリシーで `NotAction` を使うときは、
同じプリンシパルに他の Allow が乗る前提で読み直す必要がある。

なお `iam:CreateVirtualMFADevice` のリソースは `mfa/<デバイス名>` なので、
**仮想 MFA デバイスの名前はユーザ名と一致させる必要がある**（`mfa/${aws:username}` に一致しないと拒否される）。
これは #176 の手順書に書く。

### 未完了（デプロイが必要な受け入れ条件）

#172 の受け入れ条件のうち 2 つは、実際にデプロイしてテストユーザを作らないと確認できない:

- MFA 未登録のユーザが仮想 MFA デバイスを登録でき、かつ `s3:ListAllMyBuckets` で `AccessDenied` になること
- MFA サインイン後は所属グループの権限が使えること

グループがまだ存在しない（#173-#175）ため、後者は #173 以降とまとめて検証するのが自然。
デプロイの判断とあわせて持ち越す。

---

## 2026-09-10 — #173 readonly / audit グループ

### やったこと

- `readonly` グループ（`ReadOnlyAccess`）と `audit` グループ（`SecurityAudit`）を作成
- `deny-secret-reads` ポリシーを新設し、両グループに付与
- グループ生成を `addGroup()` 経由に限定し、MFA ベースラインの付け忘れを構造的に防止
- **`ope` は作らない**（決定）

### 見つけたこと: `ReadOnlyAccess` は Lambda の環境変数を平文で返す

Issue には「秘密が漏れるデータプレーン読み取り」の例として
`secretsmanager:GetSecretValue` / `ssm:GetParameter*` / `kms:Decrypt` を挙げていたが、
**このプロジェクトは Secrets Manager も SSM も使っていない**。
実際の漏洩経路は別にあった。

`ReadOnlyAccess` は `lambda:GetFunctionConfiguration` を含む。
これは環境変数ブロックをそのまま返す。そして `VoicevoxStack` は:

| 関数 | 環境変数 | 中身 |
| --- | --- | --- |
| `voicevox-authorizer-{env}` | `API_KEY` | VOICEVOX API の認証キーそのもの |
| `voicevox-slack-alert-{env}` | `SLACK_WEBHOOK_URL` | Slack へ投稿できる URL |

つまり `readonly` に入れた「破壊的操作ができないはずの開発者」が、
**API キーと Slack Webhook を読める**状態だった。

対処として `deny-secret-reads` で該当関数に限定して
`lambda:GetFunction` / `lambda:GetFunctionConfiguration` を Deny した。
`voicevox-engine-{env}` は対象外にしている — 秘密を持たず、
かつ障害調査で最も見たい関数なので、ここまで塞ぐと `readonly` の意味がなくなる。

```ts
const SECRET_BEARING_FUNCTIONS = ['voicevox-authorizer-*', 'voicevox-slack-alert-*'];
```

**ただしこれは対症療法**。本来は Lambda の環境変数に秘密を置くのをやめるべきで、
それは `VoicevoxStack` 側の変更になるため別 Issue にした（#182）。

`secretsmanager:GetSecretValue` と `kms:Decrypt` の Deny も入れてある。
現時点では対象が存在しないが、将来 Secrets Manager を使い始めたときに
`readonly` が自動的に緩まないようにするため。
`kms:Decrypt` を止めておくと SSM SecureString の復号読み出しも同時に塞がる
（復号なしの読み出しは暗号文しか返さないので害がない）。

### 判断が分かれた点

#### `ope` は作らない（確定）

要件自体に「readonly と同等であれば作成不要」とあり、そのとおりにした。

ただし Issue に書いていた代替案「`ops-actions` ポリシーを別途用意する」も**今回は作らない**。
理由は、運用担当が実在しない（ユーザは 2 人ともに開発者）ため、
必要なアクションが推測になるから。使われないポリシーが残ると、
後から誰かが中身を検証せずに貼るリスクのほうが大きい。
必要になった時点で、実際に落ちたコマンドを見てから作る。

#### グループ生成をメソッド経由に限定した

`addGroup(id, groupName, policies)` を private メソッドにして、
中で必ず `this.baselinePolicies` を先頭に足すようにした。

`new iam.Group(...)` を直接書けてしまうと、#174-#175 で
MFA ベースラインを付け忘れたグループが静かに生まれる。
不変条件テストでも落とせるが、**そもそも書けないほうが良い**。

実際にテストが効くことは、ベースライン無しのグループを一時的に足して確認した:

```console
$ npx jest -t "attaches both baseline policies to every group"
Tests:       1 failed, 70 skipped, 71 total
```

### ハマった点

#### 前の Issue のテストが実態と合わなくなった

#171 / #172 時点で「まだ 0 件」を主張していたテストが 3 件落ちた。

```
Expected 0 resources of type AWS::IAM::Group but found 2
Expected 2 resources of type AWS::IAM::ManagedPolicy but found 3
```

スキャフォールド段階の「まだ無いこと」を固定するテストは、
次の Issue で必ず落ちる。落ちたら書き換える前提で置くのは構わないが、
**意図（何を守りたいのか）が残っていないと、単に数字を書き換えて通してしまう**。
今回は「ユーザに直接ポリシーを貼らない」「ユーザ/ロールを作らない」という
本来の意図に書き直した。

#### テストヘルパの重複

`renderArn` などを `mfa-baseline.test.ts` に書いていたが、
`groups.test.ts` でも必要になったので `test/support/synth.ts` に切り出した。

### 検証コマンドと結果

```console
$ npm test
Tests:       71 passed, 71 total

$ env -u VOICEVOX_API_KEY_POC -u VOICEVOX_API_KEY_DEV -u VOICEVOX_API_KEY_PRO \
    DOTENV_CONFIG_PATH=/dev/null npm run synth:iam   # OK

$ npm run diff:iam
Resources
[+] AWS::IAM::ManagedPolicy SelfServiceCredentials
[+] AWS::IAM::ManagedPolicy DenyWithoutMfa
[+] AWS::IAM::ManagedPolicy DenySecretReads
[+] AWS::IAM::Group ReadonlyGroup
[+] AWS::IAM::Group AuditGroup
```

すべて追加のみ。既存の `dev_readonly` / `dev_user` への変更はなし。

### 追加対応: SSM の String パラメータ（#183 レビュー指摘）

`kms:Decrypt` を止めたことで「SSM も塞いだ」と書いていたが、
**それは SecureString の話でしかなかった**。プレーンな `String` パラメータに
秘密を置かれた場合は `ssm:GetParameter` で素通りする。

指摘のうち半分は正しく、半分は誤っていた:

| 指摘された経路 | 判定 |
| --- | --- |
| String パラメータに秘密を置いた場合 | **正しい**。素通りする |
| SecureString を復号せずに読む場合 | **誤り**。暗号文しか返らない |

対応方針を決めるために、まず実際に何があるか確認した:

```console
$ aws ssm describe-parameters --query 'Parameters[].{Name:Name,Type:Type}'
[{"Name": "/cdk-bootstrap/hnb659fds/version", "Type": "String"}]

$ aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --query 'Parameter.Value'
"30"
```

アカウント内のパラメータは CDK bootstrap のバージョン 1 件だけで、値は整数。秘密ではない。

そこで **`NotResource` で `/cdk-bootstrap/*` だけを除外し、それ以外のパラメータ読み取りを Deny** した。
fail-closed にしても**今日のコストがゼロ**だと実データで確認できたのが決め手。

```ts
notResources: [/* arn:...:ssm:*:*:parameter/cdk-bootstrap/* */]
```

後から正当な非秘密パラメータを足すときは、この例外を意識的に広げることになる。
それが狙いで、**うっかり SSM に置かれた秘密が黙って `readonly` から読める状態にはしない**。

> 教訓: 「A を塞げば B も塞がる」と書くときは、B の全経路を数えたか確認する。
> `kms:Decrypt` は SecureString の復号経路だけを塞ぐのであって、SSM を塞ぐわけではない。

### 未完了（実機検証）

#172 から持ち越した実機検証は #184 に切り出した。
MFA デバイスの登録は QR 読み取りと TOTP 入力を伴い、**人の手が要る**ため、
コード側の作業（#174 / #175）の前段に置くとそこがボトルネックになる。
独立した Issue にしておけば、空き時間にいつでもでき、何もブロックしない。

---

## 2026-09-10 — IamStack 初回デプロイ

コードは #171-#173 で揃ったので、実アカウントへ初めてデプロイした。

```console
$ npm run deploy:iam -- --require-approval never
IamStack | 7/7 | CREATE_COMPLETE | AWS::CloudFormation::Stack | IamStack
 ✅  IamStack
✨  Deployment time: 53.33s
```

デプロイ前に「追加のみ・既存リソースへの変更なし」を `cdk diff` で確認している。
作られたのは managed policy 3 本とグループ 2 つ。

### デプロイ後の実測

```console
$ aws iam list-groups --query 'Groups[].GroupName'
["audit", "dev_readonly", "dev_user", "readonly"]
```

新旧が並んで存在する状態。旧グループは #178 で廃止する。

| グループ | アタッチ済みポリシー | メンバー |
| --- | --- | --- |
| `readonly` | `ReadOnlyAccess`, `deny-without-mfa`, `deny-secret-reads`, `self-service-credentials` | **0 人** |
| `audit` | `SecurityAudit`, `deny-without-mfa`, `deny-secret-reads`, `self-service-credentials` | **0 人** |

既存グループが無傷であることも確認:

```console
$ aws iam list-attached-group-policies --group-name dev_readonly
["ReadOnlyAccess"]
$ aws iam list-attached-group-policies --group-name dev_user
["IAMFullAccess","PowerUserAccess"]
```

**メンバーが 0 人なので、この時点で誰の実効権限も変わっていない。**
デプロイの安全性はここに依存していた — グループにポリシーを貼るだけなら、
所属者がいない限り無害。

### 確認できたこと: `${aws:username}` がリテラルのまま保存されている

CDK 経由で IAM ポリシー変数を通すのは、TypeScript のテンプレートリテラルに
巻き込まれる危険があった（#172 で定数に切り出した理由）。
デプロイ後の実物を読んで、意図どおり展開されずに残っていることを確認した:

```console
$ aws iam get-policy-version --policy-arn <deny-without-mfa> --version-id <default>
...
"NotResource": [
  "arn:aws:iam::460*******:user/${aws:username}",
  "arn:aws:iam::460*******:mfa/${aws:username}"
]
```

アカウント ID は解決され、ポリシー変数は残っている。これが逆になっていたら、
「自分のリソースだけ」という限定が効かない。**synth の確認だけでは分からない層**なので、
初回デプロイ時に実物を読んでおく価値があった。

---

<!--
以降、PR ごとに追記する。テンプレート:

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
