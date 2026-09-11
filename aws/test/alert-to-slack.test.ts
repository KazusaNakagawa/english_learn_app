/**
 * Unit tests for the CloudWatch Alarm → Slack forwarder
 * (`lambda/alert-to-slack/index.js`).
 *
 * The webhook URL used to sit in `SLACK_WEBHOOK_URL`, readable through
 * `lambda:GetFunctionConfiguration` (#182). It now comes from Secrets Manager,
 * resolved once per container.
 */
import { EventEmitter } from 'events';

jest.mock(
  '@aws-sdk/client-secrets-manager',
  () => {
    const send = jest.fn();
    return {
      __send: send,
      SecretsManagerClient: jest.fn(() => ({ send })),
      GetSecretValueCommand: jest.fn((input: unknown) => ({ input })),
    };
  },
  { virtual: true },
);

jest.mock('https', () => ({ __request: jest.fn(), request: (...args: unknown[]) => (require('https') as any).__request(...args) }));

const SECRET_ID = '/englishlearn/poc/voicevox/slack-webhook-url';
const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXX';

type Handler = (event: unknown) => Promise<void>;

function load(): { handler: Handler; send: jest.Mock; request: jest.Mock } {
  jest.resetModules();
  const sdk = require('@aws-sdk/client-secrets-manager');
  const https = require('https');
  const { handler } = require('../lambda/alert-to-slack/index');
  return { handler, send: sdk.__send, request: https.__request };
}

/** Stand-in for https.request that reports `statusCode` and captures the body. */
function respondWith(statusCode: number) {
  const bodies: string[] = [];
  const impl = (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
    const req = new EventEmitter() as any;
    req.setTimeout = jest.fn();
    req.destroy = jest.fn();
    req.write = (chunk: string) => bodies.push(chunk);
    req.end = () => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = statusCode;
      process.nextTick(() => {
        res.emit('data', 'ok');
        res.emit('end');
      });
      callback(res);
    };
    return req;
  };
  return { impl, bodies };
}

const alarmEvent = (message: string) => ({ Records: [{ Sns: { Message: message } }] });

const ALARM = JSON.stringify({
  AlarmName: 'voicevox-api-5xx-poc',
  AlarmDescription: 'API Gateway 5xx errors exceeded threshold (5min / >=1)',
  NewStateValue: 'ALARM',
  NewStateReason: 'Threshold Crossed',
  StateChangeTime: '2026-09-12T00:00:00.000Z',
  Trigger: { MetricName: '5xx', Namespace: 'AWS/ApiGateway', Threshold: 0, Period: 300 },
});

describe('alert-to-slack forwarder', () => {
  const saved = process.env.SLACK_WEBHOOK_SECRET_ID;

  beforeEach(() => {
    process.env.SLACK_WEBHOOK_SECRET_ID = SECRET_ID;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.SLACK_WEBHOOK_SECRET_ID;
    else process.env.SLACK_WEBHOOK_SECRET_ID = saved;
    jest.restoreAllMocks();
  });

  // 成功系: シークレットの URL に投げること。
  it('posts the alarm to the webhook URL held in the secret', async () => {
    const { handler, send, request } = load();
    send.mockResolvedValue({ SecretString: WEBHOOK });
    const { impl, bodies } = respondWith(200);
    request.mockImplementation(impl);

    await handler(alarmEvent(ALARM));

    expect(send.mock.calls[0][0].input).toEqual({ SecretId: SECRET_ID });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({
      hostname: 'hooks.slack.com',
      path: '/services/T000/B000/XXXX',
      method: 'POST',
    });
    expect(JSON.parse(bodies.join('')).attachments[0].title).toContain('voicevox-api-5xx-poc');
  });

  // 成功系: 1 コンテナで 1 回だけ読む。
  it('reads the secret once and reuses it while the container is warm', async () => {
    const { handler, send, request } = load();
    send.mockResolvedValue({ SecretString: WEBHOOK });
    request.mockImplementation(respondWith(200).impl);

    await handler(alarmEvent(ALARM));
    await handler(alarmEvent(ALARM));

    expect(send).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  // 失敗系: シークレットが無い環境（webhook 未登録）でも落とさず通知だけ諦める。
  // アラート転送が throw すると、SNS が再試行し続けるだけで誰も気づかない。
  it.each([
    ['the secret does not exist', () => Promise.reject(new Error('ResourceNotFoundException'))],
    ['the secret is empty', () => Promise.resolve({ SecretString: '' })],
  ])('skips posting without throwing when %s', async (_label, response) => {
    const { handler, send, request } = load();
    send.mockImplementation(response);

    await expect(handler(alarmEvent(ALARM))).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  // 成功系: webhook の差し替えが再デプロイなしで効くこと。
  it('picks up a rotated webhook URL after the cache expires', async () => {
    const { handler, send, request } = load();
    const rotated = 'https://hooks.slack.com/services/T000/B999/YYYY';
    send.mockResolvedValueOnce({ SecretString: WEBHOOK });
    send.mockResolvedValueOnce({ SecretString: rotated });
    request.mockImplementation(respondWith(200).impl);

    const now = jest.spyOn(Date, 'now').mockReturnValue(1_757_000_000_000);
    await handler(alarmEvent(ALARM));
    now.mockReturnValue(1_757_000_000_000 + 5 * 60 * 1000);
    await handler(alarmEvent(ALARM));

    expect(send).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].path).toBe('/services/T000/B999/YYYY');
  });

  // 失敗系: 読み直しに失敗しても、直近の URL でアラートは届ける。
  it('keeps posting to the last known URL when the re-read fails', async () => {
    const { handler, send, request } = load();
    send.mockResolvedValueOnce({ SecretString: WEBHOOK });
    send.mockRejectedValueOnce(new Error('ThrottlingException'));
    request.mockImplementation(respondWith(200).impl);

    const now = jest.spyOn(Date, 'now').mockReturnValue(1_757_000_000_000);
    await handler(alarmEvent(ALARM));
    now.mockReturnValue(1_757_000_000_000 + 5 * 60 * 1000);
    await handler(alarmEvent(ALARM));

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].hostname).toBe('hooks.slack.com');
    expect(console.error).toHaveBeenCalled();
  });

  // 境界値: SNS のメッセージが JSON でない場合は投げずに戻る（既存の挙動）。
  it('ignores an SNS message that is not an alarm payload', async () => {
    const { handler, send, request } = load();
    send.mockResolvedValue({ SecretString: WEBHOOK });

    await expect(handler(alarmEvent('not json'))).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  // 失敗系: Slack 側のエラーは握り潰さない（Lambda のエラーメトリクスに出す）。
  it('rejects when Slack answers with a non-200', async () => {
    const { handler, send, request } = load();
    send.mockResolvedValue({ SecretString: WEBHOOK });
    request.mockImplementation(respondWith(403).impl);

    await expect(handler(alarmEvent(ALARM))).rejects.toThrow('403');
  });
});
