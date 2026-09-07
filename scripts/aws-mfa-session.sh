#!/bin/bash
set -euo pipefail
# Obtain an MFA-authenticated session for the read-only investigation profile.
#
# The group `dev_readonly` denies every action unless MFA is present, so the
# long-term key profile can only call sts:GetSessionToken. This script exchanges
# it for a temporary session and writes the result to a second profile.
#
# Usage:
#   ./scripts/aws-mfa-session.sh            # prompts for the 6-digit code
#   ./scripts/aws-mfa-session.sh 123456     # non-interactive
#   aws s3 ls --profile dev_readonly1-mfa   # then use the session profile

BASE_PROFILE="${AWS_MFA_BASE_PROFILE:-dev_readonly1}"
SESSION_PROFILE="${AWS_MFA_SESSION_PROFILE:-${BASE_PROFILE}-mfa}"
DURATION="${AWS_MFA_DURATION:-43200}"  # 12h (IAM user range: 900-129600s)

MFA_SERIAL="$(aws iam list-mfa-devices --profile "$BASE_PROFILE" \
  --query 'MFADevices[0].SerialNumber' --output text)"

if [ -z "$MFA_SERIAL" ] || [ "$MFA_SERIAL" = "None" ]; then
  echo "❌ No MFA device registered for profile $BASE_PROFILE" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  CODE="$1"
else
  read -r -p "MFA code for ${MFA_SERIAL##*/}: " CODE
fi

CREDS="$(aws sts get-session-token \
  --profile "$BASE_PROFILE" \
  --serial-number "$MFA_SERIAL" \
  --token-code "$CODE" \
  --duration-seconds "$DURATION" \
  --output json)"

read -r ACCESS_KEY SECRET_KEY SESSION_TOKEN EXPIRATION <<EOF
$(printf '%s' "$CREDS" | python3 -c '
import sys, json
c = json.load(sys.stdin)["Credentials"]
print(c["AccessKeyId"], c["SecretAccessKey"], c["SessionToken"], c["Expiration"])
')
EOF

REGION="$(aws configure get region --profile "$BASE_PROFILE" || echo ap-northeast-1)"

aws configure set aws_access_key_id "$ACCESS_KEY" --profile "$SESSION_PROFILE"
aws configure set aws_secret_access_key "$SECRET_KEY" --profile "$SESSION_PROFILE"
aws configure set aws_session_token "$SESSION_TOKEN" --profile "$SESSION_PROFILE"
aws configure set region "$REGION" --profile "$SESSION_PROFILE"
aws configure set output json --profile "$SESSION_PROFILE"

echo "✅ Session profile '$SESSION_PROFILE' updated (expires $EXPIRATION)"
echo "   export AWS_PROFILE=$SESSION_PROFILE"
