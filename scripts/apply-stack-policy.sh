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
# npm runs `postdeploy:pro` only when `deploy:pro` SUCCEEDS. A deploy that fails
# or rolls back leaves whatever policy is currently attached in place — which is
# why the "relax once" procedure in docs/05 restores it from a trap rather than
# relying on this hook.
#
# Pass credentials through the environment, not as flags:
#
#   AWS_PROFILE=infra-user-mfa npm run deploy:pro
#
# `npm run deploy:pro -- --profile x` passes the flag to `cdk deploy` only, and
# this hook would then run against whatever the default profile is.
#
# Usage:
#   scripts/apply-stack-policy.sh <env> [extra aws-cli args...]
#
set -euo pipefail

# The environment is required rather than defaulted. A default of `pro` on a
# production-safety script means a future `postdeploy:dev` wired without its
# argument would re-apply pro's policy to pro in the middle of a dev deploy.
if [ $# -eq 0 ]; then
  echo "usage: scripts/apply-stack-policy.sh <env> [extra aws-cli args...]" >&2
  exit 1
fi

STACK_ENV="$1"
shift

case "$STACK_ENV" in
  -*)
    echo "First argument must be the environment name (e.g. 'pro'), got '${STACK_ENV}'." >&2
    echo "usage: scripts/apply-stack-policy.sh <env> [extra aws-cli args...]" >&2
    exit 1
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY="${REPO_ROOT}/aws/stack-policies/voicevox-${STACK_ENV}.json"
STACK="VoicevoxStack-${STACK_ENV}"

# Mirror how the CDK app resolves a region (aws/bin/app.ts): the environment
# first, then the profile's configured region, then the same hardcoded default.
# Left to the CLI's own resolution this drifts — a profile with no region has
# CDK create the stack in ap-northeast-1 while the calls below error out or
# target somewhere else, and the deploy still reports success.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-${CDK_DEFAULT_REGION:-}}}"
if [ -z "$REGION" ]; then
  REGION="$(aws configure get region 2>/dev/null || true)"
fi
REGION="${REGION:-ap-northeast-1}"

if [ ! -f "$POLICY" ]; then
  echo "No stack policy for '${STACK_ENV}': ${POLICY} does not exist." >&2
  echo "poc and dev are deliberately unprotected — they are re-created routinely," >&2
  echo "and a policy there would refuse the resource replacements that implies." >&2
  exit 1
fi

# Every call below takes `--region` before "$@", so a caller-supplied --region
# still wins (the AWS CLI takes the last occurrence).
#
# Keep stderr instead of discarding it. "Cannot read the stack" and "the stack is
# not there" are different situations, and only one of them is benign.
if ! DESCRIBE_ERROR="$(aws cloudformation describe-stacks \
      --stack-name "$STACK" --region "$REGION" "$@" 2>&1 >/dev/null)"; then
  case "$DESCRIBE_ERROR" in
    *ValidationError*|*"does not exist"*)
      echo "Stack ${STACK} does not exist in ${REGION}." >&2
      echo "A stack policy attaches to an existing stack; deploy it first." >&2
      ;;
    *)
      echo "Could not read ${STACK} in ${REGION}, and this is not 'no such stack':" >&2
      echo "  ${DESCRIBE_ERROR}" >&2
      echo >&2
      echo "AccessDenied here is the #174 case: a develop-group member CAN deploy" >&2
      echo "pro through the shared CDK bootstrap role, but their identity policy" >&2
      echo "denies cloudformation:* on VoicevoxStack-pro — so the deploy succeeded" >&2
      echo "and ${STACK} may now be running with NO stack policy attached." >&2
      echo "Re-run this script with infra/admin credentials." >&2
      ;;
  esac
  exit 1
fi

echo "Applying ${POLICY#"${REPO_ROOT}/"} to ${STACK} in ${REGION}"
aws cloudformation set-stack-policy \
  --stack-name "$STACK" \
  --region "$REGION" \
  --stack-policy-body "file://${POLICY}" \
  "$@"

# Read it back rather than trusting the call. A stack policy is silent once set,
# so a wrong or missing document would only surface as an update that should have
# been refused and went through.
ATTACHED="$(mktemp)"
trap 'rm -f "$ATTACHED"' EXIT
aws cloudformation get-stack-policy \
  --stack-name "$STACK" \
  --region "$REGION" \
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
