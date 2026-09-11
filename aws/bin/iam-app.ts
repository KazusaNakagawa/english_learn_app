#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IamStack } from '../lib/iam-stack';

/**
 * Dedicated CDK app entry for account-wide IAM.
 *
 * Separate from bin/app.ts on purpose. A CDK app constructs **every** stack it
 * declares before the CLI applies a stack selector, so sharing one entry would
 * tie every IAM command to the application stack's synth — and a mistake here
 * locks people out of the account, which is why this stack is reviewed and
 * deployed on its own cadence. See docs/aws/iam-group-iac-worklog.md.
 *
 * Until #182 there was a harder reason: `VoicevoxStack`'s constructor threw
 * when `VOICEVOX_API_KEY_{ENV}` was unset ("Error: API key not found."), so any
 * IAM command needed a VOICEVOX credential to run at all. The stack now reads
 * its secrets from Secrets Manager at runtime and requires none at synth time.
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
