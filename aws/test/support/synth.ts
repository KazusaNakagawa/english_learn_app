import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IamStack } from '../../lib/iam-stack';

export const ACCOUNT = '123456789012';
export const REGION = 'ap-northeast-1';

export type Statement = {
  Sid?: string;
  Effect: string;
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: unknown;
  NotResource?: unknown;
  Condition?: Record<string, Record<string, unknown>>;
};

export function synth(): Template {
  const app = new cdk.App();
  return Template.fromStack(
    new IamStack(app, 'IamStack', { env: { account: ACCOUNT, region: REGION } }),
  );
}

/** Customer-managed policy documents, keyed by ManagedPolicyName. */
export function managedPolicies(): Record<string, Statement[]> {
  const byName: Record<string, Statement[]> = {};
  for (const resource of Object.values(
    synth().findResources('AWS::IAM::ManagedPolicy'),
  ) as any[]) {
    byName[resource.Properties.ManagedPolicyName] =
      resource.Properties.PolicyDocument.Statement;
  }
  return byName;
}

/** IAM groups, keyed by GroupName rather than by logical id. */
export function groups(): Record<string, any> {
  const byName: Record<string, any> = {};
  for (const resource of Object.values(
    synth().findResources('AWS::IAM::Group'),
  ) as any[]) {
    byName[resource.Properties.GroupName] = resource.Properties;
  }
  return byName;
}

export const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * ARNs come back as `Fn::Join` with a `Ref` to AWS::Partition (and often
 * AWS::AccountId), because Stack.formatArn resolves those at deploy time
 * rather than assuming "aws". Flatten that to a plain string so assertions
 * stay readable: `arn:${AWS::Partition}:iam::123456789012:user/${aws:username}`.
 */
export function renderArn(value: unknown): string {
  if (typeof value === 'string') return value;

  const join = (value as any)?.['Fn::Join'];
  if (!join) return JSON.stringify(value);

  const [delimiter, parts] = join as [string, unknown[]];
  return parts
    .map((part) => (typeof part === 'string' ? part : `\${${(part as any).Ref}}`))
    .join(delimiter);
}

export const renderArns = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).map(renderArn);
