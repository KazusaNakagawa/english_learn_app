#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { VoicevoxStack } from '../lib/voicevox-stack';
import { IamStack } from '../lib/iam-stack';

const app = new cdk.App();

const env = app.node.tryGetContext('env') ?? 'poc';
const validEnvs = ['poc', 'dev', 'pro'];
if (!validEnvs.includes(env)) {
  throw new Error(`Invalid env: "${env}". Must be one of: ${validEnvs.join(' | ')}`);
}

const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
};

new VoicevoxStack(app, `VoicevoxStack-${env}`, {
  env: awsEnv,
  stackEnv: env,
});

// No `-${env}` suffix: IAM is account-global and poc/dev/pro share one account,
// so there is exactly one instance regardless of the `env` context value.
new IamStack(app, 'IamStack', { env: awsEnv });
