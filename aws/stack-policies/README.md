# Stack policies

CloudFormation stack policies for the `VoicevoxStack-{env}` stacks. Applied with
[`scripts/apply-stack-policy.sh`](../../scripts/apply-stack-policy.sh), which runs
automatically as the `postdeploy:pro` hook of `npm run deploy:pro`.

## Why these are not in the CDK app

`cdk.StackProps` exposes `terminationProtection` but no `stackPolicy`, and there is
no L1 construct for one either. CloudFormation takes the document through a separate
`SetStackPolicy` call, so it cannot ride along in the synthesized template. See #186.

## Why only pro

`poc` and `dev` are re-created routinely. A policy there would refuse the resource
replacements that implies, for no benefit — those stacks are meant to be disposable.

## Two things that are easy to get wrong

**Stack policies are deny-by-default.** Once a policy is attached, every update
action on an existing resource is refused unless a statement allows it. The `Allow`
in `voicevox-pro.json` is therefore load-bearing: widening it to `Update:*` would
silently remove the protection, because `Update:*` includes `Update:Replace` and
`Update:Delete`.

**They do not apply to new resources.** Adding a resource to the stack is always
permitted; the policy governs updates to resources that already exist. Deletion of
the stack itself is a different control — `terminationProtection`, set in
`lib/voicevox-stack.ts` for `pro`.

## Making a deliberate production change

A change that must replace or delete a resource needs a one-off override at update
time. See the procedure in
[docs/05.iam_group_design.md](../../docs/05.iam_group_design.md) — §4 of 設計上の制約.
If it turns out to be needed often, narrow the deny list rather than dropping the
policy.
