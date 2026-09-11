/**
 * Unit tests for the API Gateway Lambda authorizer
 * (`lambda/api-key-authorizer/index.js`).
 *
 * The handler used to compare against `process.env.API_KEY`, which put the
 * credential in the function configuration where `readonly` could read it
 * (#182). It now resolves the value from Secrets Manager once per container.
 *
 * `@aws-sdk/client-secrets-manager` is mocked virtually: the Lambda runtime
 * provides it, so it is deliberately NOT a dependency of this package.
 */
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

const SECRET_ID = '/englishlearn/poc/voicevox/api-key';
const CORRECT_KEY = 'a3f9c1d4e5b6';

type Authorizer = (event: unknown) => Promise<{ isAuthorized: boolean }>;

/** Fresh module registry per test, so the cold-start cache starts empty. */
function load(): { handler: Authorizer; send: jest.Mock } {
  jest.resetModules();
  const sdk = require('@aws-sdk/client-secrets-manager');
  const { handler } = require('../lambda/api-key-authorizer/index');
  return { handler, send: sdk.__send };
}

const request = (apiKey?: string) => ({
  headers: apiKey === undefined ? {} : { 'x-api-key': apiKey },
});

describe('api-key authorizer', () => {
  const saved = process.env.API_KEY_SECRET_ID;

  beforeEach(() => {
    process.env.API_KEY_SECRET_ID = SECRET_ID;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.API_KEY_SECRET_ID;
    else process.env.API_KEY_SECRET_ID = saved;
    jest.restoreAllMocks();
  });

  // 成功系
  it('authorizes a request carrying the key held in the secret', async () => {
    const { handler, send } = load();
    send.mockResolvedValue({ SecretString: CORRECT_KEY });

    await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({ SecretId: SECRET_ID });
  });

  // 成功系: コールドスタート1回だけ読む。毎回呼ぶと 1 リクエスト毎に課金され、
  // Secrets Manager のスロットリングにも当たる。
  it('reads the secret once and reuses it while the container is warm', async () => {
    const { handler, send } = load();
    send.mockResolvedValue({ SecretString: CORRECT_KEY });

    await handler(request(CORRECT_KEY));
    await handler(request(CORRECT_KEY));

    expect(send).toHaveBeenCalledTimes(1);
  });

  // 失敗系
  it('rejects a wrong key', async () => {
    const { handler, send } = load();
    send.mockResolvedValue({ SecretString: CORRECT_KEY });

    await expect(handler(request('wrong'))).resolves.toEqual({ isAuthorized: false });
  });

  it.each([
    ['no x-api-key header', request()],
    ['no headers at all', {}],
    ['a null event body', null],
  ])('rejects a request with %s', async (_label, event) => {
    const { handler, send } = load();
    send.mockResolvedValue({ SecretString: CORRECT_KEY });

    await expect(handler(event)).resolves.toEqual({ isAuthorized: false });
  });

  // 失敗系: 読めないときは開けない。落ちても API Gateway は 500 を返すだけで
  // 誰も通さないが、理由がログに残らないので明示的に閉じる。
  it('fails closed when the secret cannot be read', async () => {
    const { handler, send } = load();
    send.mockRejectedValue(new Error('AccessDeniedException'));

    await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: false });
    expect(console.error).toHaveBeenCalled();
  });

  // 境界値: 失敗をキャッシュしてしまうと、IAM 修正後もコンテナが生きている間ずっと
  // 全リクエストが落ち続ける。
  it('retries on the next invocation after a failed read', async () => {
    const { handler, send } = load();
    send.mockRejectedValueOnce(new Error('ThrottlingException'));
    send.mockResolvedValueOnce({ SecretString: CORRECT_KEY });

    await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: false });
    await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  // 成功系: ローテーションが再デプロイなしで効くこと。
  // キャッシュに期限が無いと、コンテナが生きている限り旧キーが通り続ける。
  describe('rotation without a redeploy', () => {
    const TTL_MS = 5 * 60 * 1000;
    const START = 1_757_000_000_000;

    /** Date.now() を固定して、コンテナが温まったまま時間が経つ状況を作る。 */
    const clock = (now: number) => jest.spyOn(Date, 'now').mockReturnValue(now);

    it('picks up a rotated key after the cache expires', async () => {
      const { handler, send } = load();
      send.mockResolvedValueOnce({ SecretString: CORRECT_KEY });
      send.mockResolvedValueOnce({ SecretString: 'rotated-key' });

      clock(START);
      await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: true });

      clock(START + TTL_MS);
      await expect(handler(request('rotated-key'))).resolves.toEqual({ isAuthorized: true });
      await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: false });
      expect(send).toHaveBeenCalledTimes(2);
    });

    // 境界値: 期限の 1ms 前はまだ読み直さない。
    it('does not re-read one millisecond before the cache expires', async () => {
      const { handler, send } = load();
      send.mockResolvedValue({ SecretString: CORRECT_KEY });

      clock(START);
      await handler(request(CORRECT_KEY));
      clock(START + TTL_MS - 1);
      await handler(request(CORRECT_KEY));

      expect(send).toHaveBeenCalledTimes(1);
    });

    // 失敗系: 期限切れ後の読み直しが失敗しても API を止めない。
    // 一時的なスロットリングで全リクエストが 403 になる方が被害が大きい。
    it('keeps serving the last known key when the re-read fails', async () => {
      const { handler, send } = load();
      send.mockResolvedValueOnce({ SecretString: CORRECT_KEY });
      send.mockRejectedValueOnce(new Error('ThrottlingException'));
      send.mockResolvedValueOnce({ SecretString: 'rotated-key' });

      clock(START);
      await handler(request(CORRECT_KEY));

      clock(START + TTL_MS);
      await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: true });
      expect(console.error).toHaveBeenCalled();

      // 次の呼び出しで再試行される（cachedAt を進めていないこと）
      await expect(handler(request('rotated-key'))).resolves.toEqual({ isAuthorized: true });
      expect(send).toHaveBeenCalledTimes(3);
    });
  });

  // 境界値: 空のシークレット（作成しただけで値を入れていない場合）は
  // 「鍵が無い」であって「誰でも通る」ではない。
  it.each([
    ['an empty SecretString', { SecretString: '' }],
    ['a binary-only secret', { SecretBinary: new Uint8Array([1, 2]) }],
  ])('rejects everything when the secret holds %s', async (_label, response) => {
    const { handler, send } = load();
    send.mockResolvedValue(response);

    await expect(handler(request(''))).resolves.toEqual({ isAuthorized: false });
    await expect(handler(request(CORRECT_KEY))).resolves.toEqual({ isAuthorized: false });
  });
});
