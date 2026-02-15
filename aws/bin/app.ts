#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VoicevoxStack } from '../lib/voicevox-stack';

const app = new cdk.App();

const env = app.node.tryGetContext('env') ?? 'poc';
const validEnvs = ['poc', 'dev', 'pro'];
if (!validEnvs.includes(env)) {
  throw new Error(`Invalid env: "${env}". Must be one of: ${validEnvs.join(' | ')}`);
}

new VoicevoxStack(app, `VoicevoxStack-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
  stackEnv: env,
});
