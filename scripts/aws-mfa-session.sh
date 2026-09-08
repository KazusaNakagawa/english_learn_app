#!/bin/bash
set -euo pipefail
# Obtain an MFA-authenticated session for the read-only investigation profile.
#
# The group `dev_readonly` denies every action unless MFA is present, except for
# a small allowlist that keeps the user from locking itself out. That allowlist
# includes sts:GetSessionToken (otherwise no session could ever be obtained) and
# iam:ListMFADevices (so the device serial below can be resolved). Everything
# else requires the session this script produces.
#
# Usage:
#   ./scripts/aws-mfa-session.sh            # prompts for the 6-digit code
#   ./scripts/aws-mfa-session.sh 123456     # non-interactive
#   aws s3 ls --profile dev_readonly1-mfa   # then use the session profile

BASE_PROFILE="${AWS_MFA_BASE_PROFILE:-dev_readonly1}"
SESSION_PROFILE="${AWS_MFA_SESSION_PROFILE:-${BASE_PROFILE}-mfa}"
DURATION="${AWS_MFA_DURATION:-43200}"  # 12h (IAM user range: 900-129600s)
CREDENTIALS_FILE="${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}"

MFA_SERIAL="$(aws iam list-mfa-devices --profile "$BASE_PROFILE" \
  --query 'MFADevices[0].SerialNumber' --output text)"

if [ -z "$MFA_SERIAL" ] || [ "$MFA_SERIAL" = "None" ]; then
  echo "❌ No MFA device registered for profile $BASE_PROFILE" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  CODE="$1"
else
  read -r -s -p "MFA code for ${MFA_SERIAL##*/}: " CODE
  echo
fi

# `aws configure get region` can exit 0 with an empty value, so `||` alone is not
# enough — fall back whenever the result is empty.
REGION="$(aws configure get region --profile "$BASE_PROFILE" || true)"
REGION="${REGION:-${AWS_MFA_REGION:-ap-northeast-1}}"

STS_JSON="$(aws sts get-session-token \
  --profile "$BASE_PROFILE" \
  --serial-number "$MFA_SERIAL" \
  --token-code "$CODE" \
  --duration-seconds "$DURATION" \
  --output json)"

# The credentials are handed to python through the environment rather than argv,
# and written to the credentials file directly, so they never appear in `ps`
# output the way `aws configure set <secret>` would. A parse failure exits
# non-zero here, which `set -e` turns into an abort — the existing session
# profile is left untouched rather than being overwritten with empty values.
EXPIRATION="$(
  STS_JSON="$STS_JSON" \
  TARGET_FILE="$CREDENTIALS_FILE" \
  TARGET_PROFILE="$SESSION_PROFILE" \
  TARGET_REGION="$REGION" \
  python3 -c '
import json, os, re, sys, tempfile

try:
    creds = json.loads(os.environ["STS_JSON"])["Credentials"]
    values = {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
        "region": os.environ["TARGET_REGION"],
    }
    expiration = creds["Expiration"]
except (ValueError, KeyError) as exc:
    sys.exit("Failed to parse STS response: %s" % exc)

if not all(values.values()):
    sys.exit("STS response contained empty credentials")

path = os.environ["TARGET_FILE"]
profile = os.environ["TARGET_PROFILE"]

try:
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
except FileNotFoundError:
    lines = []

# Replace just this profile block, leaving every other section (and any
# comments in it) byte-for-byte intact.
block = ["[%s]" % profile] + ["%s = %s" % kv for kv in values.items()]
start = next((i for i, line in enumerate(lines)
              if line.strip() == "[%s]" % profile), None)
if start is None:
    if lines and lines[-1].strip():
        lines.append("")
    lines.extend(block)
else:
    end = next((i for i in range(start + 1, len(lines))
                if re.match(r"\s*\[", lines[i])), len(lines))
    lines[start:end] = block + [""]

directory = os.path.dirname(path) or "."
os.makedirs(directory, exist_ok=True)
fd, tmp = tempfile.mkstemp(dir=directory)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines).rstrip("\n") + "\n")
    os.replace(tmp, path)
except BaseException:
    os.path.exists(tmp) and os.unlink(tmp)
    raise

print(expiration)
'
)"

echo "✅ Session profile '$SESSION_PROFILE' updated (expires $EXPIRATION)"
echo "   export AWS_PROFILE=$SESSION_PROFILE"
