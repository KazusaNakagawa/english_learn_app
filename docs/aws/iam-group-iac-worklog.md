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

ポリシー ARN とバージョン ID は固定値ではないので、まず解決する:

```console
$ POLICY_ARN=$(aws iam list-policies --scope Local \
    --query "Policies[?PolicyName=='deny-without-mfa'].Arn | [0]" --output text)
$ VERSION_ID=$(aws iam get-policy --policy-arn "$POLICY_ARN" \
    --query 'Policy.DefaultVersionId' --output text)
$ echo "$VERSION_ID"
v1

$ aws iam get-policy-version --policy-arn "$POLICY_ARN" --version-id "$VERSION_ID" \
    --query 'PolicyVersion.Document.Statement[?Sid==`DenyOtherPeoplesCredentialsUnlessMfaAuthenticated`]'
[
  {
    ...
    "NotResource": [
      "arn:aws:iam::460*******:user/${aws:username}",
      "arn:aws:iam::460*******:mfa/${aws:username}"
    ]
  }
]
```

> **補足**: IAM API そのものは `PolicyVersion.Document` を **URL エンコードして返す**。
> ただし AWS CLI v2 はこれを自動でデコードするので、上のように
> `Document.Statement[...]` と構造で辿れる（確認: aws-cli/2.27.2）。
> SDK を直接使う場合はデコードが要る。
> PR #185 のレビューで「デコード手順が抜けている」と指摘されたが、
> CLI 経由なら不要 — レイヤの違いによる。

アカウント ID は解決され、ポリシー変数は残っている。これが逆になっていたら、
「自分のリソースだけ」という限定が効かない。**synth の確認だけでは分からない層**なので、
初回デプロイ時に実物を読んでおく価値があった。

---

## 2026-09-10 — #174 develop グループ

### やったこと

- `develop` グループと `develop-workload` ポリシーを追加
- `VoicevoxStack` の `pro` にだけ削除保護（`terminationProtection`）を有効化
- スタックポリシーは CDK が非対応のため #186 に分離

### 最大の罠: `Deny iam:*` を書くと MFA ベースラインが壊れる

Issue には「`iam:*` の書き込みを全部 Deny、ただし `iam:PassRole` は除く」と書いていた。
これを素直に書くと**壊れる**。

**明示的 Deny はあらゆる Allow に優先する。** `develop` に `Deny iam:*` を置くと、
同じユーザに付いている `self-service-credentials`（#172）の Allow を上書きし、
**develop の全員が MFA 登録もパスワード変更もアクセスキー交換もできなくなる**。

しかも既存メンバーは MFA 登録済みなので気づかない。
**新しく入った人が登録できずに詰んで初めて発覚する**タイプの障害になる。

「`iam:*` から一部を除く」は IAM では書けない:

| 書き方 | 結果 |
| --- | --- |
| `Action: "iam:*"` | 除外を表現できない |
| `NotAction: [除外したいもの]` | **IAM 以外の全アクション**まで Deny される |

そこで**危険な IAM 書き込みアクションを明示列挙**する方式にした（34 個）。
列挙漏れのリスクはあるが、ベースラインを巻き込む事故よりはるかに軽い。

回帰防止として、自己管理系 9 アクションが **Deny されていないこと**を個別にテストしている:

> `does NOT deny iam:ChangePassword, which would break the MFA baseline`

### 気づいたこと: 同じ性質が逆方向に働く

`iam:CreateRole` などを Deny すると `cdk deploy` が壊れるのでは、と思ったが**壊れない**。

理由は #179 で踏んだのと同じ性質。CloudFormation はロールを
**assume した bootstrap ロール経由**で作るので、呼び出し元ユーザの identity policy は
そのセッションでは評価されない。

- `*-pro` の Deny が効かなかったのも同じ理由（守れない側）
- `iam:*` の Deny がデプロイを壊さないのも同じ理由（助かる側）

同じ挙動が、片方では穴になり、片方では救いになる。

### 名前でスコープできないリソースがある

`lambda` / `ecr` / `logs` / `sns` は ARN に名前が入るので `-poc` / `-dev` に限定できた。
一方で**限定できないものが 2 つ**ある:

| サービス | 理由 |
| --- | --- |
| API Gateway v2 | ARN が `/apis/<生成 ID>` 形式。名前も環境も入らない |
| CloudWatch アラーム | CDK 生成のサフィックスが付き、環境名で一意に切れない |

この 2 つはアカウント全体（= pro を含む）に対する許可になっている。
`develop` が「信頼済みグループ」である以上は許容範囲だが、
**環境分離に実在する穴**なので、糊塗せずコメントとテストに残した。

### pro の保護

削除保護は `VoicevoxStack` 側に置いた。`bin/app.ts` に書くとテストしづらいため。

```ts
terminationProtection: props.terminationProtection ?? props.stackEnv === 'pro',
```

`poc` / `dev` は日常的に作り直すので保護しない。ここを一律 `true` にすると
`npm run destroy:poc` が落ちるようになる（境界値テストで固定した）。

**ただし削除保護だけでは足りない。** 防げるのは*削除*であって*更新*ではないので、
誤った `deploy:pro` によるリソース置換は依然として通る。
それを止めるのがスタックポリシーだが:

- **CDK が非対応**。`cdk.StackProps` に `terminationProtection` はあるが `stackPolicy` はなく、
  L1 構成も存在しない。CloudFormation の `SetStackPolicy` API 経由でしか設定できない
- **`VoicevoxStack-pro` が未デプロイ**。貼る対象がまだない

→ #186 に分離した。

なお `terminationProtection` はスタックのマニフェスト側の属性なので、
**テンプレート本体は変わらない**。`VoicevoxStack-poc` のテンプレートが
`develop` 時点とバイト一致することを確認済み。

### レビュー指摘への対応（#187）

3 件のうち **2 件が妥当、1 件は誤り**だった。判定は推測ではなく合成結果で行った。

#### 妥当 1: `iam:PassRole` が実在のロールに一致していなかった

`role/VoicevoxStack-*` に限定していたが、`VoicevoxStack` は Lambda 実行ロールに
**名前を明示指定**している:

```console
$ grep -n "roleName" lib/voicevox-stack.ts
84:      roleName: `voicevox-engine-role-${stackEnv}`,
```

合成テンプレート上の実際のロール名:

| 論理 ID | RoleName |
| --- | --- |
| `VoicevoxFunctionRole...` | **`voicevox-engine-role-poc`** |
| `ApiKeyAuthorizerServiceRole...` | (CDK 生成 = `VoicevoxStack-poc-...`) |

つまり CDK 生成名は拾えるが、**肝心の実行ロールだけ渡せない**状態だった。
`voicevox-*-role-*` を追加。「Lambda を直接更新できる」という触れ込みが
実際には成立していなかったので、これは実害のあるバグ。

#### 妥当 2: IAM 書き込みの列挙漏れ

`iam:CreateRole` / `DeleteRole` / `UpdateRole`、権限境界、タグ操作が抜けていた。
**ロールを作れれば任意の権限を持つプリンシパルを用意できる**ので、
ユーザ・グループ系だけ塞いでも意味が薄い。11 個追加した。

denylist 方式を採った時点で列挙漏れは織り込み済みのリスクだったが、
「ロールを作れる」は最も大きい穴なので見落としは痛い。

なお `iam:CreateServiceLinkedRole` は**意図的に Deny しない**。
AWS が定義済みポリシーで作る限定的なロールで、初回利用時の自動作成が要る場面がある。
これも「抜けている」と誤読されないようコメントとテストに明記した。

#### 誤り: 「`sts:AssumeRole` の account が `*`」

合成結果を見れば `*` ではない:

```json
"Resource": [{"Fn::Join": ["", ["arn:", {"Ref": "AWS::Partition"},
  ":iam::", {"Ref": "AWS::AccountId"}, ":role/cdk-*-deploy-role-*"]]}, ...]
```

`formatArn` に `account` を渡さなければ**スタックのアカウントが既定で入る**。
ソースに `account:` の記述がないことを「`*`」と読んだ誤りと思われる。

ただし**指摘の周辺には本当の緩さがあった**。`lambda` / `ecr` / `logs` / `sns` /
`cloudformation` の Allow 側では明示的に `account: '*'` と書いていた。これは外した。

ここで **Allow と Deny で扱いを変えている**点を記録しておく:

| | account | 理由 |
| --- | --- | --- |
| Allow | 当アカウント | 他アカウントの同名リソースまで許す理由がない |
| Deny（pro 保護） | `*` のまま | Deny は広いほど安全。絞ると防御が外れる |

### ハマった点: テストヘルパが ARN を誤って分解した

account セグメントを `arn.split(':')[4]` で取ろうとしたら全部落ちた。
**`${AWS::Partition}` 自体がコロンを含む**ため、区切り位置がずれる。

さらに、テストではスタックに明示アカウントを渡しているので、
ARN に入るのは `${AWS::AccountId}` ではなく**リテラルのアカウント ID**。
実アカウントに対する synth 結果とテスト時の synth 結果で、
同じコードでも ARN の見え方が変わる。

### 検証コマンドと結果

```console
$ npm test
Tests:       142 passed, 142 total

$ npm run diff:iam
[+] AWS::IAM::ManagedPolicy DevelopWorkload
[+] AWS::IAM::Group DevelopGroup
```

追加のみ。デプロイ済みの `readonly` / `audit` / ベースライン 3 本には変更なし。

---

## 2026-09-10 — #175 infra / billing / admin グループ

### やったこと

- `infra`（`PowerUserAccess` + `infra-administration`）、`billing`、`admin` を追加
- **`develop` の Deny を訂正**（下記が本題）
- CI/CD の OIDC ロールは**見送り**（判断を記録）

### 最大の発見: グループの Deny は他のグループに波及する

`billing` を作ろうとしてテストを書いたら、`develop` の既存 Deny に引っかかった。

```console
develop の Deny: ["account:*","aws-portal:*","ce:*","organizations:*"]
```

`AWSBillingReadOnlyAccess` が必要とするもの:

```
account:GetAccountInformation / aws-portal:ViewBilling / ce:GetCostAndUsage ...
```

**3 つとも重なっている。** つまり `develop` と `billing` の両方に所属するユーザは、
**billing の権限が丸ごと効かない**状態だった。

原因は IAM の基本的な性質:

> **Deny はグループではなくユーザに対して評価される。**
> あるグループのポリシーに書いた Deny は、そのユーザが所属する
> **他のすべてのグループ**の Allow を打ち消す。

つまり **グループポリシーの Deny は事実上そのユーザにとってアカウント全体の Deny**。
「このグループでは使わせない」つもりで書いた Deny が、
別グループの機能を殺す。

#### 一般則として

**Deny に書いてよいのは「どのグループも与えるべきでないもの」だけ。**
「このグループには不要」程度のものを Deny すると、必ず組み合わせで壊れる。

この観点で develop の Deny を見直した:

| Deny していたもの | 判定 |
| --- | --- |
| `organizations:*` | 残す。どのグループも与えない |
| `account:*` | **狭める**。読み取りは billing が必要。危険な書き込み 6 個の列挙に変更 |
| `ce:*` | **削除**。billing の本体 |
| `aws-portal:*` | **削除**。billing の本体 |
| IAM 書き込み | 残す（ただし下記の制約が付く） |

回帰防止として、追加グループが必要とするアクションを
**どのポリシーも Deny していないこと**を不変条件テストにした:

> `never denies ce:GetCostAndUsage, which the billing group needs`

ワイルドカード（`ce:*`）での巻き込みも同時に検査している。

### 帰結: グループは「ティア」と「追加」に分かれる

Deny が波及する以上、**すべてのグループを自由に組み合わせられるわけではない**。

| 種別 | グループ | 性質 |
| --- | --- | --- |
| ティア（排他） | `readonly` / `develop` / `infra` / `admin` | 互いの Deny が衝突する。1 人 1 つ |
| 追加（併用可） | `audit` / `billing` | 何も Deny しない。任意のティアに重ねられる |

具体的な衝突:

- `develop` の IAM 書き込み Deny は `infra` の IAM 権限を殺す
- `develop` の Deny は `admin` の `AdministratorAccess` すら殺す

#### break-glass admin は専用ユーザでなければ機能しない

これが実務上いちばん危ない。**既存の開発者を `admin` グループに追加しても管理者にならない。**
その人が `develop` にも属していれば、`develop-workload` の Deny が
`AdministratorAccess` を上書きするため。

しかも**緊急時にそれが発覚する**。破られ方として最悪の部類。

対策として `admin` は「他のどのグループにも属さない専用ユーザ」用と明記した
（コードコメント + テスト + #176 の手順書）。
これは break-glass の一般的な作法そのものでもある。

### 判明した誤り: `arn:aws:iam::aws:policy/Billing` は存在しない

Issue には「`Billing` + `AWSBillingReadOnlyAccess`」と書いていたが、
前者の ARN は存在しない:

```console
$ aws iam get-policy --policy-arn arn:aws:iam::aws:policy/Billing
An error occurred (NoSuchEntity) ... was not found.

$ aws iam get-policy --policy-arn arn:aws:iam::aws:policy/job-function/Billing
Billing
```

フルアクセス版は **`job-function/` 配下**にある。
今回はコスト閲覧が目的なので `AWSBillingReadOnlyAccess` のみを採用した。
支払い情報の変更は root 相当の関心事で、日常の閲覧者に配るものではない。

### 判断: CI/CD の OIDC ロールは見送り

推測で決めず、実際のワークフローを見た:

```console
$ ls .github/workflows/
cdk-ci.yml.bk   ios-build.yml.bk      # どちらも .bk で無効化済み
```

```yaml
      - name: CDK synth (dry-run)
        run: npx cdk synth
        env:
          # CDK synth does not require real AWS credentials
          AWS_ACCESS_KEY_ID: dummy
          AWS_SECRET_ACCESS_KEY: dummy
```

**AWS に触れる CI は存在しない。** ダミー認証情報で synth するだけ。
使われていない OIDC ロールを今作るのは、`ops-actions` を作らなかったのと同じ理由で見送る。

発動条件だけ記録しておく:

> CI から AWS へデプロイする必要が生じたら、**IAM ユーザのアクセスキーではなく
> GitHub Actions OIDC ロール**を使う。長期キーを GitHub Secrets に置かない。

なお `cdk-ci.yml.bk` を**そのまま復活させると落ちる**。
`npx cdk synth` はスタックセレクタなしで `bin/app.ts` を合成するため、
`VOICEVOX_API_KEY_POC` 未設定で `VoicevoxStack` の constructor が throw する（#171 参照）。
復活させるときは `npm run synth:iam` を足すか、ダミーの API キーを env に足す必要がある。

### レビュー指摘への対応（#188）

Sourcery が**レビュー予算上限**（7 日で 25 万 diff 文字）に到達したため、
ローカルの `/code-review` で代替した。9 件（high 4 件）の指摘。

#### 訂正 1: `audit` は「追加グループ」ではなかった

自分で「Deny を持たないグループは任意のティアに重ねられる」と定義しておきながら、
`audit` に `deny-secret-reads` を貼っていた（#173）。デプロイ済みの実物で確認:

```console
$ aws iam list-attached-group-policies --group-name audit
["SecurityAudit","deny-without-mfa","deny-secret-reads","self-service-credentials"]
```

`infra` + `audit` のユーザは、PowerUserAccess を持ちながら
`secretsmanager:GetSecretValue` も `kms:Decrypt` も通らなくなる。
**billing で直したのと同じ欠陥が、audit で再発していた。**

`audit` の `deny-secret-reads` は必要（SecurityAudit は `lambda:GetFunctionConfiguration` を含む =
API キーが読める）なので、**`audit` をティアに分類し直した**。

| 種別 | グループ |
| --- | --- |
| ティア（排他） | `readonly` / **`audit`** / `develop` / `infra` / `admin` |
| 追加（併用可） | `billing` のみ |

#### 訂正 2: `organizations:*` の Deny が SecurityAudit を潰す

同じ根から出たもう 1 件。実物を読んで確認した:

```console
$ aws iam get-policy-version --policy-arn arn:aws:iam::aws:policy/SecurityAudit ...
organizations:Describe*
organizations:List*
```

`SecurityAudit` は組織の読み取りを含む。`organizations:*` を丸ごと Deny すると
これを打ち消す。書き込み 24 個の列挙に変更した。

**同じ過ちを 3 回繰り返している**（`iam:*` → `account:*`/`ce:*` → `organizations:*`）。
ワイルドカードでの Deny は、書いた瞬間は簡潔で正しく見えるが、
**そのサービスの読み取りを必要とする他グループを必ず巻き込む**。

#### 決定: infra の昇格経路は許容し、明文化する

`infra` は `iam:CreateRole` + `iam:AttachRolePolicy` を `*` に持つ。
つまり自分を信頼するロールを作り `AdministratorAccess` を付けて assume すれば、
**自身にかかった Deny をすべて回避できる**。
assume 後は呼び出し元の identity policy が評価されないため（#179 と同じ性質）。

したがって `DenyOrganizationAndAccountControl` は**境界ではなく速度抑制**。

選択肢は Permissions Boundary で実際に縛るか、許容して明文化するか。
**bootstrap ロールと同じ判断で後者を採った。** 境界ポリシーの維持コストが、
infra という「管理するためのグループ」の目的と釣り合わない。

帰結として **`infra` と `admin` の差は、防止ではなく CloudTrail での可視性**になる。
これをコメント・worklog・#176 に明記した。

#### 対応: ベースライン書き換えだけは塞ぐ

一方で `iam:CreatePolicyVersion --set-as-default` を `deny-without-mfa` に対して撃つと、
**アカウント全体の MFA 強制が 1 コマンドで無効化できる**。
昇格経路が残る以上これも迂回可能だが、事故とカジュアルな変更は止まるし、
CloudTrail に目立つ 1 手が増える。自スタックのポリシー 5 本を Deny 対象にした。

名前のハードコード一覧はドリフトするので、
**実際に生成されるポリシー集合と一致すること**をテストで固定している。

#### その他の対応

| 指摘 | 対応 |
| --- | --- |
| `ACCOUNT_LEVEL_WRITES` にアカウント乗っ取り経路が欠落 | `StartPrimaryEmailUpdate` / `AcceptPrimaryEmailUpdate` / `PutAccountName` を追加。プライマリメール変更 → root パスワードリセットで乗っ取りが成立する |
| infra がオフボーディングできない | `DeleteAccessKey` 等を追加。自己管理で全員が自分のキーを作れるため、`DeleteUser` が `DeleteConflict` で落ちて**退職者のキーが生き残る**状態だった |
| infra がポリシーを作れても貼れない | `CreateGroup` / `AttachGroupPolicy` / `AttachUserPolicy` 等を追加 |
| admin の「余計なものが付いていない」テストが空振り | customer-managed policy は `{"Ref":...}` で出るため `startsWith('arn:')` が全部落としていた。件数と中身の厳密一致に変更 |
| 不変条件テストの盲点 | `NotAction` 形式の Deny を見ていなかった。また `ce:*` の完全一致しか見ておらず `ce:Get*` を素通りさせた。glob 一致に変更し、MFA 条件付き Deny は除外 |

### 人によるレビュー指摘（#188、P1 × 2）

自動レビューが拾えなかった 2 件。どちらも infra の自己昇格経路。

#### 1. infra は自分を `admin` グループに追加できた

`iam:AddUserToGroup` が `Resource: '*'` だったため、
**1 コマンドで `AdministratorAccess` を取得できる**状態だった。

一般的な昇格経路（自前ロールを作って assume）は上で許容したのに、
なぜこれは塞ぐのか — 性質が違うため:

| 経路 | 性質 |
| --- | --- |
| ロール作成 → assume | セッション限り。CloudTrail に `AssumeRole` が目立って残る |
| **admin に自分を追加** | **永続。しかも「admin はメンバー 0 人」という前提そのものを崩す** |

`admin` のメンバーが 0 人であることは break-glass 設計の土台で、
「使われたら通知する」という監視もそれに依存している。
静かに join できると監視ごと無効化される。

運用対象グループ（`readonly` / `audit` / `develop` / `infra` / `billing`）に限定し、
**`admin` を除外**した。

**ただしグループ経路だけ塞ぐのは張りぼて**だった。
`iam:AttachUserPolicy` で自分のユーザに `AdministratorAccess` を直接貼れば同じ結果になる。
`AttachUserPolicy` の Resource は「ユーザ」なので ARN では絞れず、
**どのポリシーを貼るかは `iam:PolicyARN` 条件でしか制限できない**:

```json
{
  "Sid": "DenyGrantingAdministratorAccess",
  "Effect": "Deny",
  "Action": ["iam:AttachUserPolicy", "iam:AttachGroupPolicy", "iam:AttachRolePolicy"],
  "Condition": { "ArnEquals": { "iam:PolicyARN": "arn:aws:iam::aws:policy/AdministratorAccess" } }
}
```

#### 2. `iam:PassRole` が全ロール対象だった

強い権限のロールを自分が起動できるサービスに渡せば、そのロールとしてコードが動く。
AWS の推奨どおり ARN で限定した（`VoicevoxStack-*` / `voicevox-*-role-*` / `cdk-*`）。

この命名から外れるロールを作ったときは一覧の拡張が必要になるが、
**明示的な `AccessDenied` として現れる稀な作業**であり、
bootstrap ロールを絞ったときのような継続的コストにはならない。

#### 一覧のハードコードにはドリフト検査を付けた

`INFRA_MANAGEABLE_GROUPS` も `MANAGED_POLICY_NAMES` も手書きの一覧なので、
グループやポリシーを足したときに入れ忘れる。

- 入れ忘れ → infra が運用できない
- `admin` が紛れ込む → 上のガードが無意味になる

「このスタックが作るグループから `admin` を除いた集合と厳密に一致すること」を
テストにし、グループを一時的に足して実際に落ちることも確認した。

### 検証コマンドと結果

```console
$ npm test
Tests:       198 passed, 198 total

$ npm run diff:iam
[+] AWS::IAM::ManagedPolicy InfraAdministration
[+] AWS::IAM::Group InfraGroup
[+] AWS::IAM::Group BillingGroup
[+] AWS::IAM::Group AdminGroup
```

---

## 2026-09-10 — #178 移行の準備（実移行の手前で停止）

### やったこと

- `IamStack` を再デプロイ。6 グループすべてがアカウントに存在する状態に
- `scripts/aws-mfa-session.sh` の MFA デバイス選択を修正
- #178 の手順の**順序が誤っていた**ので訂正
- **メンバーシップ変更の手前で停止**（理由は下記）

### 訂正: 「重複所属は無害」は誤りだった

#178 に当初こう書いていた:

> 2. `dev_user1` を新グループに追加する。**旧グループに残したまま**でよい —
>    重複所属は問題ない。IAM は権限を union する
> 3. MFA セッションプロファイルを先に用意する

**順序が逆で、しかも 2 の説明が誤っている。**

union が成り立つのは *Allow* の話。新グループに入った瞬間 `deny-without-mfa` も
付いてくる。そして**長期アクセスキーは MFA コンテキストを持たない**ので、
`BoolIfExists` の条件に合致して Deny される。

つまり `dev_user1` を新グループに追加した瞬間、
**現在使っている `dev_user1` プロファイルが即座に死ぬ**。
しかも `dev_user1` はアカウント内で唯一 `IAMFullAccess` を持つ ID。

救いは設計どおり効いている。`sts:GetSessionToken` と `iam:ListMFADevices` は
除外リストに入れてあるので、**その状態からでも MFA セッションは取得できる**（#172）。
逃げ道を残した判断がここで効く。

正しい順序:

1. デプロイ（済）
2. **MFA セッションプロファイルを作って検証**（← 人の手が要る）
3. `infra` に追加（この時点で平プロファイルは死ぬ）
4. MFA プロファイル経由で検証
5. 旧グループから外す

### 見つけた地雷: MFA デバイスの選択が運任せだった

`scripts/aws-mfa-session.sh` は `MFADevices[0].SerialNumber` を使っていた。
`dev_user1` には 2 種類登録されている:

```console
$ aws iam list-mfa-devices --user-name dev_user1 --query 'MFADevices[].SerialNumber'
[
    "arn:aws:iam::460*******:mfa/dev_user1",                    # 仮想 MFA (TOTP)
    "arn:aws:iam::460*******:u2f/user/dev_user1/dev_user1-..."  # FIDO セキュリティキー
]
```

`sts:GetSessionToken` は 6 桁の TOTP を要求するので、**FIDO キーでは通らない**。
`[0]` が今たまたま仮想 MFA を返しているだけで、**API は順序を保証していない**。

ARN に `:mfa/` を含むものを明示的に選ぶよう変更した:

```bash
--query 'MFADevices[?contains(SerialNumber, `:mfa/`)].SerialNumber | [0]'
```

仮想 MFA が 1 台も無い場合は、登録済みデバイス一覧を出して落ちるようにした
（「セキュリティキーだけでは CLI 用のセッションは取れない」と分かるように）。

`dev_readonly1` は仮想 MFA 1 台のみなので、こちらは元から問題なかった。

### 停止した理由

次の一手（`dev_user1` を `infra` に追加）は:

- **人の手が必要** — TOTP コードは代行できない
- **後戻りしにくい** — 実行順を誤ると、唯一の管理者 ID が締め出される

前提となる MFA プロファイルの検証が済むまで、メンバーシップには触れない。

### 移行の実行（Phase 1 完了）

MFA プロファイルの検証が済んだので実移行した。**Phase 2（旧グループの削除）は未実施。**

#### MFA ベースラインが実アカウントで効くことの確認

`dev_user1` を `infra` に追加した直後、平プロファイルはこうなった:

```console
$ aws s3 ls --profile dev_user1
An error occurred (AccessDenied) when calling the ListBuckets operation:
User: arn:aws:iam::460*******:user/dev_user1 is not authorized to perform:
s3:ListAllMyBuckets with an explicit deny in an identity-based policy:
arn:aws:iam::460*******:policy/deny-without-mfa
```

**長期アクセスキーが `BoolIfExists` で正しく Deny される**ことの実証。
`dev_user1-mfa` は同じ操作が通る。#172 の設計が意図どおり機能している。

なお最初の確認スクリプトでは「まだ通る」と誤判定した。
**AWS CLI はエラー出力の前に空行を出す**ため、`2>&1 | head -1` が空行を拾っていた。
エラー検出をパイプの先頭行に頼らないこと。

#### 順序を間違えた: `dev_user` から抜ける前にポリシーを剥がしてしまった

`infra` の `RemoveUserFromGroup` は**新グループ 5 つにスコープされている**（#188）。
`dev_user` は含まれない。したがって旧グループからの離脱には
`dev_user` 側の `IAMFullAccess` が要る。

自分でそう分析していたのに、**先に `IAMFullAccess` をデタッチしてしまい**、
自分を `dev_user` から外せなくなった:

```console
$ aws iam remove-user-from-group --group-name dev_user --user-name dev_user1
An error occurred (AccessDenied) ... because no identity-based policy allows
the iam:RemoveUserFromGroup action
```

権限上の実害はない（`dev_user` は既に空の器）が、宙ぶらりんの所属が残る。

回復は `iam:AttachUserPolicy` で `IAMFullAccess` を**自分に一時的に直付け**して実行し、
直後に剥がした。これは #188 で「許容する」と決めた昇格経路そのもの
（`AdministratorAccess` だけは条件で Deny されている）。

**正しい順序**: メンバーシップを外す → ポリシーを剥がす。逆にすると詰む。

#### もう一つの落とし穴: IAM の伝播遅延

一時付与した `IAMFullAccess` は、5 秒後の実行では**まだ効かなかった**。
10 秒待って成功。IAM のポリシー変更は即時反映されない。
移行スクリプトを書くならリトライ前提にする必要がある。

#### 境界テスト（`dev_user1` が `infra` のみになってから実施）

`dev_user` に在籍しているうちは `IAMFullAccess` が全部通してしまうので、
これらのテストは**旧グループを離れて初めて意味を持つ**:

| 試行 | 結果 |
| --- | --- |
| `admin` グループへの自己追加 | ✅ 拒否 |
| `AdministratorAccess` の直付け | ✅ 明示的 Deny |
| `deny-without-mfa` の書き換え | ✅ 明示的 Deny |
| `organizations:LeaveOrganization` | ✅ 拒否 |

#188 で入れたガードが実環境で機能している。

#### 移行後の状態

| グループ | メンバー | ポリシー |
| --- | --- | --- |
| `dev_readonly` | なし | なし（空の器） |
| `dev_user` | なし | なし（空の器） |
| `readonly` | `dev_readonly1` | ReadOnlyAccess + ベースライン + deny-secret-reads |
| `infra` | `dev_user1` | PowerUserAccess + ベースライン + infra-administration |
| `audit` / `develop` / `billing` / `admin` | なし | 定義済み |

実務が回ることも確認:

```console
$ npm run diff:iam    # ✨ Number of stacks with differences: 0
$ npm run diff:poc    # Stack VoicevoxStack-poc / differences: 1
```

`infra` 単独（`IAMFullAccess` なし）で CDK 運用が成立している。

### Phase 2 実行: 旧グループを削除

soak を置かずに削除した（理由は次節）。削除前に空であることを再確認:

```console
dev_readonly: メンバー=0 アタッチ=0 インライン=0
dev_user:     メンバー=0 アタッチ=0 インライン=0
```

```console
$ aws iam delete-group --group-name dev_readonly
$ aws iam delete-group --group-name dev_user

$ aws iam list-groups --query 'Groups[].GroupName'
["admin","audit","billing","develop","infra","readonly"]
```

**アカウント内のグループはすべて IaC 管理下**になった（`dev_` プレフィックスは 0 件）。

削除は CloudFormation のドリフトを生まない — 旧グループは元から
`IamStack` の管理外だったため:

```console
$ npm run diff:iam
✨  Number of stacks with differences: 0
```

削除後も `infra` 単独で実務が回ることを再確認（lambda 一覧 / IAM 読み取り /
グループ運用の往復、いずれも成功）。

### 追加検証: #184 の棚卸し（移行後に実施）

移行が終わって実ユーザとグループが揃ったので、
#184 に残していた項目のうち**人手が要らないものを潰した**。

#### リソーススコープ Deny（#181）— `dev_user1` の平プロファイルで検証

`dev_user1` の平プロファイルは MFA なしセッションそのものなので、
テストユーザを作らなくても検証できた:

| 操作 | 結果 |
| --- | --- |
| `list-mfa-devices --user-name dev_user1`（自分） | ✅ 成功（2 件） |
| `list-mfa-devices --user-name dev_readonly1`（他人） | ✅ 明示的 Deny |
| `get-user --user-name dev_readonly1`（他人） | ✅ 拒否 |

`iam:ListMFADevices` は `NotAction` でグローバルに除外されているにもかかわらず、
他人の ARN では拒否される。#181 のレビュー指摘に対する修正が実環境で効いている。

**この 3 行が示すのは `ListMFADevices` の除外範囲だけ**であって、
登録の逃げ道（`CreateVirtualMFADevice` / `EnableMFADevice`）の証明にはならない。
`dev_user1` は既に 2 台登録済みなので、そもそも登録経路を通っていない。
そちらは #184 に残っている（後述）。

#### `deny-secret-reads`（#183）— audit に一時所属して検証

`infra` は `deny-secret-reads` を持たないため、そのままでは検証できない。
`audit` に一時的に所属させて確認し、直後に外した（`infra` の権限で可能・可逆）:

| 操作 | 結果 |
| --- | --- |
| `/cdk-bootstrap/hnb659fds/version` | ✅ 読めた（値 `30`）— 除外が効いている |
| それ以外の SSM パス | ✅ 明示的 Deny |
| `secretsmanager:GetSecretValue` | ✅ 拒否 |

**この結論は SSM と Secrets Manager に限る。**
`deny-secret-reads` は `kms:Decrypt` も `*` に対して Deny しているが、
そちらは検証できていない:

```console
$ aws kms decrypt --ciphertext-blob fileb:///dev/null
An error occurred (ValidationException) when calling the Decrypt operation: ...
```

**入力検証が認可より先に走る**ため、拒否されたのか単に引数が不正なのかを区別できない。
正しく検証するには実際の KMS 鍵と暗号文が要る。

これは机上の話ではない。`kms:Decrypt` の Deny は影響範囲が秘密の読み取りより広く、
**SSE-KMS の S3 オブジェクトを読むだけでも `readonly` / `audit` は失敗する**。
最初に踏んだ人が「未検証だった」と分かるよう、ここに残す。

#### 検証できなかったもの

**Lambda 環境変数の Deny は対象が存在しない。**

```console
$ aws lambda list-functions --query 'length(Functions)'
0
```

`VoicevoxStack-poc` が未デプロイで、そもそも関数が 1 つも無い
（`list-functions` はリージョン単位だが、このアカウントは `ap-northeast-1` 単一）。

**Deny 対象を取り違えないこと。** 実際の対象は 2 つ:

```ts
const SECRET_BEARING_FUNCTIONS = ['voicevox-authorizer-*', 'voicevox-slack-alert-*'];
```

`voicevox-engine-*` は**意図的に対象外**（秘密を持たず、障害調査で最も見たい関数）。
検証時は「authorizer と slack-alert が Deny され、engine は読める」を確認する。
`slack-alert` を落とすと、Deny を入れる動機だった `SLACK_WEBHOOK_URL` の露出が
未検証のまま残る。

#182（環境変数から秘密を外す）で前提が変わるため、**#182 の受け入れ条件に追加した**。
prose で「そちらで見る」と書くだけでは、どちらの Issue も緑で閉じて
誰も確認しないまま終わる。

#### #184 に残ったもの

**「MFA デバイスを 1 つも持たないユーザが、自力で登録を完了できるか」だけ。**

既存 2 ユーザはベースライン導入前から MFA 登録済みで、
**この経路を一度も通っていない**。ここが壊れていると、
以降のすべての新規ユーザがオンボーディング時に詰む。
QR 読み取りと TOTP は代替手段がないため、人の手が要る。

> 棚卸しの効果: 当初 8 項目あった受け入れ条件が 6 項目に減り、
> **人手が要るのは 1 経路だけ**と分かった。
> 「人手が要る」で一括りにしていたが、実際には大半が自動で確認できた。

### soak を置かなかった理由

#178 には「2 週間空グループのまま置いて切り戻し可能にする」と書いた。
実際に移行してみると、**その切り戻し経路は成立しない**:

- `infra` は `AddUserToGroup` を新グループ 5 つにしか持たない → `dev_user` に戻せない
- 空の器にはポリシーも無いので、器が残っていること自体に価値がない

現実的な切り戻しは「`IAMFullAccess` をユーザに直付けする」で、
**これは旧グループの有無と無関係**に可能（実際に今回使った）。

つまり soak 期間は安心材料として機能していない。
**存在しない安全策のために不可逆な操作を先送りしても、得られるものがない。**
判断を仰いだ上で即削除した。

> 教訓: 「切り戻せるようにしておく」と書いたときは、
> **その切り戻し手順を実際に通せるか**を確認する。
> 今回は移行を実行して初めて、書いた手順が通らないことが分かった。

### 検証コマンドと結果

```console
$ npm run deploy:iam -- --require-approval never
✨  Deployment time: 74.37s

$ for g in dev_readonly dev_user readonly audit develop infra billing admin; do ... done
dev_readonly: ["dev_readonly1"]
dev_user    : ["dev_user1"]
readonly    : []      audit  : []      develop : []
infra       : []      billing: []      admin   : []
```

既存グループは無傷:

```console
dev_readonly: ["ReadOnlyAccess"]
dev_user:     ["IAMFullAccess","PowerUserAccess"]
```

新グループはメンバー 0 人なので、**この時点で誰の実効権限も変わっていない。**

---

## 2026-09-10 — #176 設計書と運用手順

### やったこと

- `docs/05.iam_group_design.md` を作成
- `CLAUDE.md` に IAM スタックの位置づけと npm スクリプトを追記
- **設計書が腐らないようにテストで固定**

### ドキュメントをテストで縛った

この Epic では**ドキュメントとコメントの腐りを何度も踏んだ**:

- `SELF_TARGETED_WITHOUT_MFA` の docstring が別定数の上に取り残された（2 回）
- 「Scaffold only」が groups 追加後も残っていた
- `arn:aws:iam::aws:policy/Billing` という**存在しない ARN** を Issue に書いた
- worklog の検証コマンドがそのままでは実行できない形だった

設計書は「アクセスを申請する前に読むもの」なので、
**腐ると存在しないより悪い**（自信を持って間違ったことを言う）。

そこで `aws/test/design-doc.test.ts` を置き、グループ表を合成結果に固定した:

| テスト | 防ぐ腐り方 |
| --- | --- |
| `documents exactly the groups the stack creates` | グループを足して表に書き忘れる |
| `lists the right policies for <group>` | ポリシー構成が変わって表がずれる |
| `never names a policy that does not exist` | `Billing` のような実在しない名前を書く |
| `includes the runbook command <cmd>` | 手順から必要なコマンドが消える |

3 パターンすべて、意図的に壊して落ちることを確認した:

```console
# 表のポリシー名を実体からずらす
✕ lists the right policies for readonly
# 存在しないポリシー名を書く（#175 の Billing 誤記の再現）
✕ never names a policy that does not exist
# 新グループを足して表に書き忘れる
✕ documents exactly the groups the stack creates
```

**Markdown の表をパースしてテンプレートと突き合わせる**という素朴な方法だが、
今回の腐り方はすべてこれで捕まる。

### 設計書に何を書き、何を書かなかったか

「グループ一覧」「オンボーディング」「オフボーディング」「デプロイ」は手順。
その後ろに**「設計上の制約」**を置き、**知らずに触ると静かに壊れる 6 点**を書いた:

1. Deny はグループではなくユーザに効く（3 回踏んだ）
2. `admin` は専用ユーザにしか効かない（緊急時に発覚する）
3. `infra` は実質管理者に近い（許容した判断とその帰結）
4. pro の保護はスタック側（identity policy では止まらない）
5. 名前でスコープできないリソースがある（API GW / CloudWatch）
6. IAM は即時反映されない

経緯や失敗の詳細はこの worklog に置き、設計書からリンクした。
**設計書は現在形の手順書、worklog は過去形の記録**という #176 で決めた分担どおり。

### オフボーディング手順は実際の失敗から書いた

#188 のレビューで「infra がオフボーディングできない」と指摘され、
`iam:DeleteAccessKey` 等を追加した経緯がある。
手順書にも**なぜ子リソースから消すのか**を書いた:

> IAM はアクセスキーや MFA デバイスが残っているユーザを削除できない（`DeleteConflict`）。
> 全員が自分でキーを作れるので、必ず子リソースから消す。

理由を書かないと、次に `DeleteConflict` を見た人がまた同じところで止まる。

### レビュー指摘への対応（#191）

Sourcery が予算上限だったのでローカルレビュー。6 件、すべて妥当だった。
**うち 4 件は「手順どおりにやると失敗する」もの**で、書いた本人には見えていなかった。

#### 1. パスワードを生成して捨てていた

```bash
--password "$(openssl rand -base64 24)"   # ← 誰も知らない
```

`create-login-profile` はパスワードを返さない。しかも `--password-reset-required` は
**現在のパスワード入力を要求する**ので、本人はログインすらできない。
変数に取って出力するよう修正。

#### 2. 疎通確認の手順が成立しない

```bash
AWS_MFA_BASE_PROFILE=alice ./scripts/aws-mfa-session.sh
```

このスクリプトは**長期キーを持つ CLI プロファイル**を前提にしている
（最初の呼び出しが `aws iam list-mfa-devices --profile "$BASE_PROFILE"`）。
オンボーディング手順はコンソールログインしか作っていないので、
`The config profile (alice) could not be found` で止まる。

抜けていたのは 2 手:

1. **MFA でサインインし直してから**アクセスキーを発行する
   （`iam:CreateAccessKey` は MFA 免除リストに無いので、MFA セッションが要る）
2. `aws configure --profile alice`

`AWS_MFA_BASE_PROFILE` が**プロファイル名であってユーザ名ではない**点も明記した。
今回はたまたま同名にしただけで、スクリプト自身のヘッダも
「例からプロファイル名をコピーするな」と警告している。

#### 3. オフボーディングが `admin` に効かない

`iam:RemoveUserFromGroup` は新グループ 5 つにスコープしてあり、
`admin` は自己昇格防止のため意図的に除外されている（#188）。

つまり**「専用ユーザを作れ」と書いた当の break-glass ユーザを、
その手順では削除できない**。しかもループに `set -e` が無いので
`admin` の行だけ素通りし、最後の `delete-user` が
「グループに所属したまま」で失敗する — 前書きで説明した
`DeleteConflict`（キー / MFA）とは別原因なので、混乱する。

#### 4. テスト名が実際の検証内容と食い違っていた

`never names a policy that does not exist` は、
**正解をテンプレート自身から作っていた**ので実在確認になっていなかった。

`fromAwsManagedPolicyName('Billing')` と書いて表もそう直せば 16 件すべて通り、
落ちるのは `cdk deploy` 時の `NoSuchEntity`。
つまり「#175 の再現を防げる」という主張が成立していなかった。

分割した:

| テスト | 何を見るか |
| --- | --- |
| `names only policies the stack actually references` | ドキュメント ↔ テンプレートの一致 |
| `attaches only AWS managed policies verified to exist` | **実在確認済みの ARN 一覧に固定**（パス込み） |

後者は `job-function/Billing` と `Billing` を別物として扱う
（元の実装は `split('/').pop()` で潰していた）。
実際に `Billing` を仕込んで落ちることを確認した。

#### 5. 表のパーサが黙って行を落としていた

ポリシー欄を「バッククォート付きの名前が並ぶ最初のセル」で探していたため、
想定利用者欄にバッククォートが入ると別の列を掴む。
文字クラスも `[A-Za-z-]` で、数字やアンダースコアを含む名前
（`AmazonS3ReadOnlyAccess`、`AWSLambda_ReadOnlyAccess`）を弾いていた。

列インデックス指定に変え、**パースできない行では例外を投げる**ようにした。
黙って落とすと「グループが未記載」という**誤った失敗**として現れる。

この修正は即座に役に立った。列番号を間違えて置いたところ、
エラーがどのセルを掴んだかまで教えてくれた:

```
matrix row for `readonly` has an unparsable policy cell: "全リソースの参照"
```

#### 6. MFA 免除リストの説明が過小だった

「MFA 未登録でも通るのは**自分自身の資格情報管理だけ**」と書いたが、
`iam:ListVirtualMFADevices` と `iam:GetAccountPasswordPolicy` は
リソース単位で絞れないため対象外になっている。
つまり MFA 未登録のユーザでも**アカウント内の仮想 MFA デバイスを列挙できる**。

絞ると登録の入口ごと塞がるための意図的な妥協なので、
「だけ」を消して表に分け、絞れない 2 つを明示した。

> ドキュメントを「腐らないようテストで固定した」PR で、
> **テスト自身が検証していないことを検証していると名乗り、
> 手順自身が通らなかった**。固定した対象が正しいとは限らない。

### 検証コマンドと結果

```console
$ npm test
Tests:       215 passed, 215 total
```

設計書内のリンク、`CLAUDE.md` からのリンクともに切れなし。

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
