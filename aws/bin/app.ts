#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VoicevoxStack } from '../lib/voicevox-stack';

const app = new cdk.App();

new VoicevoxStack(app, 'VoicevoxStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
  description: 'VOICEVOX TTS Lambda stack for Zundamon voice (PoC)',
});
