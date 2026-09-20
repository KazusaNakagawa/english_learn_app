# `PowerUserAccess` があるのに、踏み台 EC2 を SSM に登録できなかった

> **この文書の位置づけ**
> Zenn 記事「1 ユーザで運用していた RDS for MySQL に、ロールを切って admin を封印する」の
> 検証中に踏んだ、IAM 権限設計の副作用の記録。記事は別リポジトリ（`zenn-docs`）にある。
>
> 内容は MySQL ではなくこのアカウントの IAM 設計の話なので、記事側ではなくこちらに置いた。
> [IAM グループを IaC 管理に移行する — 作業ログ](./iam-group-iac-worklog.md) の続きにあたる。
>
> 発生日: 2026-09-20
>
> アカウント ID は `123456789012` にマスクしています。

---

## 1. 何が起きたか

RDS 上で MySQL のロール設計を検証するため、**RDS をパブリック公開せずに接続する**構成を組もうとした。

```text
ローカル → SSM ポートフォワーディング → EC2 踏み台 → RDS（プライベート）
```

現場で使っている経路と同じで、セキュリティの記事の検証環境としても筋が通る。作業ユーザ `dev_user1` は `infra` グループに所属し、**`PowerUserAccess` を持っている**。EC2 も RDS も作れるはずだった。

**EC2 の起動自体は許可されている**（`ec2:RunInstances` の dry-run は権限ではなく AMI 検証で落ちた）。
断念した理由は、**EC2 を SSM に登録するためのインスタンスプロファイルが作れなかった**ことだ。
SSM エージェントが登録されない EC2 は、ポートフォワーディングの踏み台として使えない。

```bash
$ aws iam create-instance-profile --instance-profile-name tmp-permcheck-delete-me
An error occurred (AccessDenied) when calling the CreateInstanceProfile operation:
User: arn:aws:iam::123456789012:user/dev_user1 is not authorized to perform:
iam:CreateInstanceProfile on resource: .../tmp-permcheck-delete-me
because no identity-based policy allows the iam:CreateInstanceProfile action
```

## 2. 背景 — なぜこの権限設計になっているか

`infra` グループは、IAM グループを CDK 管理へ移行したときに作ったもので、「IAM を含むインフラ全体を管理する」役割を持つ。アタッチされているポリシーは 4 つ。

| ポリシー | 役割 |
| --- | --- |
| `PowerUserAccess` | AWS 管理ポリシー。IAM / Organizations / Account 以外の全サービス |
| `infra-administration` | 自前。IAM の操作を**列挙で**許可する |
| `deny-without-mfa` | MFA なしのセッションを全拒否 |
| `self-service-credentials` | 自分の認証情報の管理 |

重要なのは、**`PowerUserAccess` が `iam:*` を含まない**ことだ。IAM の操作は `infra-administration` が列挙した分しか持たない。つまり `infra` の IAM 権限は「許可リスト方式」になっている。

### `iam:PassRole` を絞ったのは意図的

CDK のソースに、判断理由がそのまま残っていた。

```ts
/**
 * Roles `infra` may hand to an AWS service.
 *
 * Unrestricted `iam:PassRole` is an escalation path in its own right: pass a
 * highly privileged role to a service you can invoke, and you run as that role.
 * AWS's own guidance is to restrict it by ARN or by iam:PassedToService.
 * Adding a role outside these patterns means extending this list on purpose,
 * which is a visible, rare piece of friction rather than an ongoing tax.
 */
const INFRA_PASSABLE_ROLES = ['VoicevoxStack-*', 'voicevox-*-role-*', 'cdk-*'];
```

> 訳: 無制限の `PassRole` はそれ自体が権限昇格の経路である。強い権限を持つロールを、自分が起動できるサービスに渡せば、そのロールとして動ける。**このパターン外のロールを追加するには、意図してリストを広げる必要がある。それは継続的な負担ではなく、目に見える稀な摩擦である。**

つまり今回踏んだ摩擦は、**設計時に予期され、受け入れられていたもの**だった。設計が壊れていたのではなく、設計どおりに動いた。今回がその「稀な摩擦」の第 1 号にあたる。

## 3. 調査の記録

`iam:SimulatePrincipalPolicy` 自体が許可されていなかったため、シミュレートは使えなかった。ポリシー本文の読解と、実際に叩いてみる方法で判定した。

```bash
$ aws iam simulate-principal-policy ...
AccessDenied: ... not authorized to perform: iam:SimulatePrincipalPolicy
```

| 操作 | 可否 | 判定方法 |
| --- | --- | --- |
| `rds:*` | ✅ | `describe-db-instances` が通った |
| `ec2:RunInstances` | ✅ | `--dry-run` が権限ではなく AMI 検証で落ちた |
| `iam:CreateRole` / `AttachRolePolicy` | ✅ | `infra-administration` に列挙あり |
| `iam:CreateInstanceProfile` | ⛔ | 実際に叩いて `AccessDenied` |
| `iam:PassRole` | ⛔（限定） | ポリシー本文。3 パターンのみ |
| 既存インスタンスプロファイルの流用 | ⛔ | アカウントに 1 つも存在しない |

## 4. 2 つの制約は、性質が違う

ここが今回の要点。同じ「権限がない」でも、中身が違う。

| 制約 | 性質 | 根拠 |
| --- | --- | --- |
| `iam:PassRole` が 3 パターンに限定 | **意図的**。設計コメントに理由と受容が明記 | `INFRA_PASSABLE_ROLES` |
| `iam:CreateInstanceProfile` がない | **おそらく漏れ**。インスタンスプロファイル系の動詞が 1 つも列挙されていない | `infra-administration` |

`infra-administration` の許可リストには、ロール・ユーザ・グループ・ポリシーの動詞が丁寧に並んでいる。一方で `CreateInstanceProfile` / `AddRoleToInstanceProfile` / `DeleteInstanceProfile` といった**インスタンスプロファイル系は一つも入っていない**。「EC2 にロールを持たせる」というユースケースが、設計時の視野に入っていなかったと見るのが自然だ。

`PassRole` のほうは、仮に `CreateInstanceProfile` があっても、`voicevox-*-role-*` などの命名に合わせない限り通らない。**2 段構えで塞がっている。**

## 5. 既存ポリシーの書き換えは塞がれている（ただし実効権限の昇格経路は残る）

`infra` は `iam:CreatePolicyVersion` を持っているので、自分でポリシーを書き換えられそうに見える。しかし `infra-administration` の末尾に、これがある。

```json
{
  "Action": [
    "iam:CreatePolicyVersion", "iam:DeletePolicy",
    "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"
  ],
  "Resource": [
    ".../policy/deny-secret-reads",
    ".../policy/deny-without-mfa",
    ".../policy/develop-workload",
    ".../policy/infra-administration",
    ".../policy/self-service-credentials"
  ],
  "Effect": "Deny",
  "Sid": "DenyRewritingThisStackPolicies"
}
```

**このスタックが管理するポリシーを、実行時に書き換えることを明示的に拒否している。** これらを変えたければ CDK のコードを直してデプロイするしかない。「ガードレールの変更はコードレビューを通す」という方針の実装にあたる。

### ただし「権限を増やせない」わけではない

ここは正確に書いておく。塞がれているのは**このスタックが持つ既存ポリシーを書き換える経路**だけで、**実効権限を上げる経路は別に残っている**。

`infra` は `iam:CreateRole` / `iam:CreatePolicy` / `iam:PutRolePolicy` / `iam:AttachRolePolicy` / `iam:UpdateAssumeRolePolicy` を持ち、`PowerUserAccess` 側で `sts:AssumeRole` も通る。つまり**自分を信頼する新しいロールを作り、任意の権限を載せて引き受けられる**。`DenyGrantingAdministratorAccess` が止めるのは AWS 管理の `AdministratorAccess` を「貼る」ことだけで、同等の内容を独自ポリシーやインラインポリシーで書く分には条件に当たらない。

これも設計側は把握していた。

```ts
/**
 * Groups whose membership `infra` may change.
 *
 * `admin` is absent on purpose. Its emptiness in steady state is the whole
 * break-glass design — alerting on use assumes nobody is quietly a member — and
 * `iam:AddUserToGroup` on '*' let any infra member join it in one call.
 * The broader escalation (mint a role, assume it) is accepted and documented,
 * but that one is loud in CloudTrail; silently joining `admin` is not.
 */
```

> 訳: より広い昇格（ロールを作って引き受ける）は**受容され、文書化されている**。ただしそれは CloudTrail で目立つ。`admin` にこっそり参加するほうは目立たない。

つまり `infra` は**信頼された役割**であって、権限を増やせない存在ではない。設計が守っているのは「増やすなら CloudTrail に残る形で」という点で、そこが `admin` グループへの参加を許していない理由でもある。この区別を落として「CDK を通さないと権限は変えられない」と読むと、実態より強く見積もることになる。

## 6. どうしたか

検証したかったのは **MySQL レイヤの挙動 4 点**であって、接続経路ではない。経路のために IAM 設計を変えるのは本末転倒なので、次のように判断した。

| 案 | 判断 |
| --- | --- |
| A: RDS をパブリック公開し、SG を作業端末のグローバル IP `/32` に限定。検証後すぐ削除 | **採用** |
| B: `infra-administration` に権限を追加して SSM ルートを通す | 却下。CDK デプロイが必要で、記事検証のスコープを超える |
| C: 検証せず、公式ドキュメントの引用のまま記事を出す | 却下。実測に置き換えたかった |

案 A は「RDS をパブリック公開しない」という当初方針を覆す判断なので、独断では進めず承認を取った。

## 7. 今後どうするか

**すぐに直す必要はない。** 今回は回避できたし、`PassRole` の制限は設計どおりに機能している。

ただし次のどちらかが起きたら、`infra-administration` の見直しを検討する。

- EC2 にロールを持たせるユースケースが**恒常的に**発生したとき（`CreateInstanceProfile` 系の追加）
- 踏み台や SSM 経由のアクセスを常用するようになったとき（あわせて `PassRole` に踏み台ロールの命名パターンを追加）

そのときは、設計コメントが言うとおり「意図してリストを広げる」作業として、CDK に手を入れて PR を出す。

## 8. 記事にするなら

IAM 記事の続編、または追記として成立する材料だと思う。切り口は次のあたり。

- **「`PowerUserAccess` を付けたのに踏み台が SSM に載らない」という見出しの引きの強さ**。原因が `PowerUserAccess` の `NotAction: iam:*` にあると分かるまでの過程がそのまま読み物になる
- **意図的な制限と、単なる列挙漏れの見分け方**。設計コメントとテストコードが残っていたから区別できた、という話
- **権限設計の「摩擦」は、コストとして事前に受容しておくと迷わない**。`INFRA_PASSABLE_ROLES` のコメントが、まさにその受容を宣言していた
- 自分のポリシーを自分で書き換えられないようにする `DenyRewritingThisStackPolicies` の効用と、**その限界**。既存ポリシーは守れても、ロールを作って引き受ける昇格までは止まらない。「止める」のではなく「CloudTrail に残る形に寄せる」という設計判断だった
- **この文書自体がレビューで直った話**。当初「CDK を通さないと権限は変えられない」と書いていたが、自動レビューに `CreateRole` + `AssumeRole` の経路を指摘されて修正した。ポリシーを読んだつもりで、Deny の条件（`AdministratorAccess` の ARN 限定）を読み落としていた
