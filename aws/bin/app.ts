#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { VoicevoxStack } from '../lib/voicevox-stack';

// IamStack is deliberately NOT declared here — it has its own entry,
// bin/iam-app.ts. A CDK app constructs every declared stack before the CLI
// applies a stack selector, so the two share nothing at synth time: IAM
// changes lock people out of the account when wrong, and are reviewed and
// deployed on a different cadence from this stack.
// See docs/aws/iam-group-iac-worklog.md.
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
