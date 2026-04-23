'use strict';

const https = require('https');
const url = require('url');

/**
 * SNS → Slack Webhook forwarder for CloudWatch Alarms.
 * Receives SNS notification from CloudWatch Alarm and posts a formatted
 * Slack message using Incoming Webhooks.
 */
exports.handler = async (event) => {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('SLACK_WEBHOOK_URL is not set');
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
            reject(new Error(`Slack returned ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
