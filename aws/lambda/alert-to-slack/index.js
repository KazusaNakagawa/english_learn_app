'use strict';

const https = require('https');
const url = require('url');
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({});

/**
 * How long a resolved secret is reused before it is read again.
 *
 * Not "forever": rotating the webhook (a leaked URL is re-issued, the channel
 * changes) is supposed to take effect without a redeploy (#182), and a warm
 * container can outlive the rotation by hours. Not per invocation either —
 * alarms arrive in bursts, and every read costs a round trip.
 *
 * Same five minutes as the authorizer, so one number describes both.
 */
const SECRET_TTL_MS = 5 * 60 * 1000;

let cachedWebhookUrl;
let cachedAt = 0;

/**
 * The webhook URL is post access to the channel, so it is kept in Secrets
 * Manager rather than in an environment variable, which `ReadOnlyAccess`
 * can read through `lambda:GetFunctionConfiguration` (#182).
 */
async function webhookUrlFromSecret() {
  const fresh = cachedWebhookUrl !== undefined && Date.now() - cachedAt < SECRET_TTL_MS;
  if (fresh) return cachedWebhookUrl;

  const secretId = process.env.SLACK_WEBHOOK_SECRET_ID;
  try {
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

    if (!response.SecretString) {
      throw new Error(`Secret ${secretId} holds no string value`);
    }
    cachedWebhookUrl = response.SecretString;
    cachedAt = Date.now();
  } catch (err) {
    // Losing the ability to re-read should not silence an alarm we can still
    // deliver. `cachedAt` stays put, so the next alarm retries the read.
    if (cachedWebhookUrl === undefined) throw err;
    console.error(`Reusing the cached webhook URL: ${secretId} could not be re-read`, err);
  }

  return cachedWebhookUrl;
}

/**
 * SNS → Slack Webhook forwarder for CloudWatch Alarms.
 * Receives SNS notification from CloudWatch Alarm and posts a formatted
 * Slack message using Incoming Webhooks.
 */
exports.handler = async (event) => {
  let webhookUrl;
  try {
    webhookUrl = await webhookUrlFromSecret();
  } catch (err) {
    // A missing webhook secret means notifications are not configured yet.
    // Throwing here would make SNS retry an alarm nobody can receive, so the
    // failure is logged and the alarm is dropped — same as before the move.
    console.error('Slack webhook URL unavailable; skipping notification', err);
    return;
  }

  const snsRecord = event.Records[0].Sns;
  let alarm;
  try {
    alarm = JSON.parse(snsRecord.Message);
  } catch (e) {
    console.error('Failed to parse SNS message', snsRecord.Message);
    return;
  }

  const isAlarm = alarm.NewStateValue === 'ALARM';
  const isOk    = alarm.NewStateValue === 'OK';

  const icon  = isAlarm ? ':rotating_light:' : isOk ? ':white_check_mark:' : ':information_source:';
  const color = isAlarm ? '#ff0000'           : isOk ? '#36a64f'           : '#cccccc';
  const env   = alarm.AlarmName?.match(/-(poc|dev|pro)$/)?.[1]?.toUpperCase() ?? 'UNKNOWN';

  const payload = {
    attachments: [
      {
        color,
        title: `${icon} [${alarm.NewStateValue}] ${alarm.AlarmName}`,
        text: alarm.AlarmDescription ?? '',
        fields: [
          {
            title: 'メトリクス',
            value: `${alarm.Trigger?.MetricName ?? '-'} (${alarm.Trigger?.Namespace ?? '-'})`,
            short: true,
          },
          {
            title: '環境',
            value: env,
            short: true,
          },
          {
            title: '閾値',
            value: `${alarm.Trigger?.Threshold ?? '-'} を超過`,
            short: true,
          },
          {
            title: '集計期間',
            value: `${(alarm.Trigger?.Period ?? 0) / 60} 分`,
            short: true,
          },
          {
            title: '理由',
            value: alarm.NewStateReason ?? '-',
            short: false,
          },
          {
            title: '検知時刻 (UTC)',
            value: alarm.StateChangeTime ?? '-',
            short: false,
          },
        ],
        footer: 'CloudWatch Alarm → SNS → Lambda → Slack',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  await postToSlack(webhookUrl, payload);
  console.log(`Slack notification sent: ${alarm.AlarmName} → ${alarm.NewStateValue}`);
};

/**
 * POST JSON payload to a Slack Incoming Webhook URL.
 * @param {string} webhookUrl
 * @param {object} payload
 */
function postToSlack(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const parsed  = url.parse(webhookUrl);

    let settled = false;
    const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const req = https.request(
      {
        hostname: parsed.hostname,
        path:     parsed.path,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            done(reject, new Error(`Slack returned ${res.statusCode}: ${data}`));
          } else {
            done(resolve, data);
          }
        });
      }
    );

    // 5秒でタイムアウト — Slack が無応答のまま Lambda が止まるのを防ぐ
    req.setTimeout(5000, () => {
      req.destroy();
      done(reject, new Error('Slack webhook request timed out after 5s'));
    });

    req.on('error', (err) => done(reject, err));
    req.write(body);
    req.end();
  });
}
