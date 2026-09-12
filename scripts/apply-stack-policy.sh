#!/usr/bin/env bash
#
# Applies the committed CloudFormation stack policy to VoicevoxStack-{env}.
#
# Why a script rather than the CDK app: `cdk.StackProps` has no `stackPolicy` and
# there is no L1 construct for one — CloudFormation takes the document through a
# separate SetStackPolicy call, outside the synthesized template (#186).
#
# Wired as the `postdeploy:pro` hook of `npm run deploy:pro`: a stack policy
# survives stack updates but not stack re-creation, so re-applying it every time
# is cheaper than remembering to.
#
# Pass credentials through the environment, not as flags:
#
#   AWS_PROFILE=infra-user-mfa npm run deploy:pro
#
# `npm run deploy:pro -- --profile x` passes the flag to `cdk deploy` only, and
# this hook would then run against whatever the default profile is.
#
# Usage:
#   scripts/apply-stack-policy.sh [env] [extra aws-cli args...]
#
set -euo pipefail

STACK_ENV="${1:-pro}"
if [ $# -gt 0 ]; then shift; fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY="${REPO_ROOT}/aws/stack-policies/voicevox-${STACK_ENV}.json"
STACK="VoicevoxStack-${STACK_ENV}"

if [ ! -f "$POLICY" ]; then
  echo "No stack policy for '${STACK_ENV}': ${POLICY} does not exist." >&2
  echo "poc and dev are deliberately unprotected — they are re-created routinely," >&2
  echo "and a policy there would refuse the resource replacements that implies." >&2
  exit 1
fi

if ! aws cloudformation describe-stacks --stack-name "$STACK" "$@" >/dev/null 2>&1; then
  echo "Stack ${STACK} does not exist, or is not visible with these credentials." >&2
  echo "A stack policy attaches to an existing stack; deploy it first." >&2
  exit 1
fi

echo "Applying ${POLICY#"${REPO_ROOT}/"} to ${STACK}"
aws cloudformation set-stack-policy \
  --stack-name "$STACK" \
  --stack-policy-body "file://${POLICY}" \
  "$@"

# Read it back rather than trusting the call. A stack policy is silent once set,
# so a wrong or missing document would only surface as an update that should have
# been refused and went through.
ATTACHED="$(mktemp)"
trap 'rm -f "$ATTACHED"' EXIT
aws cloudformation get-stack-policy \
  --stack-name "$STACK" \
  --query StackPolicyBody --output text "$@" > "$ATTACHED"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found; skipping the read-back comparison. Attached policy:"
  cat "$ATTACHED"
  exit 0
fi

if python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])) == json.load(open(sys.argv[2])) else 1)' \
     "$POLICY" "$ATTACHED"; then
  echo "Verified: ${STACK} carries exactly the committed policy."
else
  echo "MISMATCH: ${STACK} carries a policy that differs from ${POLICY}." >&2
  echo "--- attached ---" >&2
  cat "$ATTACHED" >&2
  exit 1
fi
