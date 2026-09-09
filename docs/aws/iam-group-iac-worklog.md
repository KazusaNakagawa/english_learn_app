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
