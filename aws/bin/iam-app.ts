#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IamStack } from '../lib/iam-stack';

/**
 * Dedicated CDK app entry for account-wide IAM.
 *
 * Separate from bin/app.ts on purpose. A CDK app constructs **every** stack it
 * declares before the CLI applies a stack selector, and `VoicevoxStack`'s
 * constructor throws when `VOICEVOX_API_KEY_{ENV}` is unset:
 *
 *     Error: API key not found. Set environment variable: VOICEVOX_API_KEY_POC
 *
 * Sharing one entry would therefore make every IAM command depend on VOICEVOX
 * credentials that have nothing to do with IAM — the opposite of the separation
 * this stack exists for. See docs/aws/iam-group-iac-worklog.md.
 *
 * Note the absence of `dotenv/config`: this entry must not need a .env file.
 * CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION are injected by the CDK CLI itself.
 */
const app = new cdk.App();

// No `-${env}` suffix: IAM is account-global and poc/dev/pro share one account,
// so there is exactly one instance.
new IamStack(app, 'IamStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
