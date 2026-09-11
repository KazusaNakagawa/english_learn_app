'use strict';

/**
 * API Gateway (HTTP API) Lambda authorizer for the VOICEVOX endpoints.
 *
 * The expected key comes from Secrets Manager, not from an environment
 * variable: `lambda:GetFunctionConfiguration` — which `ReadOnlyAccess` grants —
 * returns the environment block verbatim, so a key kept there is readable by
 * anyone holding a read-only policy (#182).
 *
 * `@aws-sdk/client-secrets-manager` ships with the Node.js Lambda runtime, so
 * this function needs no bundling step and no dependencies of its own.
 */
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({});

/**
 * How long a resolved secret is reused before it is read again.
 *
 * Not "forever": rotating a value is supposed to take effect without a
 * redeploy (#182), and a container can live for hours, so a cache with no
 * expiry would keep honouring a retired key for as long as Lambda keeps the
 * environment warm. Five minutes matches the authorizer's own
 * `resultsCacheTtl` in the stack, so one number describes how long a rotation
 * takes to take effect end to end.
 *
 * Not per invocation either: that would add a network round trip to every
 * request and eventually hit Secrets Manager throttling.
 */
const SECRET_TTL_MS = 5 * 60 * 1000;

let cachedApiKey;
let cachedAt = 0;

async function expectedApiKey() {
  const fresh = cachedApiKey !== undefined && Date.now() - cachedAt < SECRET_TTL_MS;
  if (fresh) return cachedApiKey;

  const secretId = process.env.API_KEY_SECRET_ID;
  try {
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

    // An empty secret means "no key configured", never "let everyone in".
    if (!response.SecretString) {
      throw new Error(`Secret ${secretId} holds no string value`);
    }
    cachedApiKey = response.SecretString;
    cachedAt = Date.now();
  } catch (err) {
    // A throttled or briefly failing read should not take the API down, so an
    // expired-but-known key keeps being served and the next invocation retries.
    // `cachedAt` is deliberately not advanced. With nothing cached there is
    // nothing to fall back to, and the caller fails closed.
    if (cachedApiKey === undefined) throw err;
    console.error(`Reusing the cached API key: ${secretId} could not be re-read`, err);
  }

  return cachedApiKey;
}

exports.handler = async (event) => {
  // Optional chaining: the authorizer is invoked with no headers at all when
  // the identity source is missing, and a TypeError here would surface as 500.
  const presentedKey = event?.headers?.['x-api-key'];

  let expectedKey;
  try {
    expectedKey = await expectedApiKey();
  } catch (err) {
    // Fail closed, and say why — a 500 from an unhandled throw leaves no trace
    // of whether the key was wrong or simply unreadable.
    console.error('Failed to read the API key secret', err);
    return { isAuthorized: false };
  }

  return { isAuthorized: Boolean(presentedKey && presentedKey === expectedKey) };
};
