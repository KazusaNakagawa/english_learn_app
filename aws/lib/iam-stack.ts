import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Account-wide IAM groups and policies.
 *
 * Deliberately separate from VoicevoxStack: permissions have their own review
 * and deploy lifecycle, and a mistake here locks people out of the account
 * rather than breaking one API.
 *
 * Unlike `VoicevoxStack-{env}`, this stack has **no environment suffix**.
 * IAM is account-global and poc/dev/pro share a single AWS account, so there is
 * exactly one instance. Per-environment separation therefore has to come from
 * resource-ARN conditions inside the group policies, not from separate stacks.
 * See docs/aws/iam-group-iac-worklog.md.
 *
 * Scaffold only — groups are added in follow-up issues (#172-#175).
 * The pre-existing hand-created groups (`dev_readonly`, `dev_user`) are NOT
 * touched here; CloudFormation cannot adopt an existing group by name and would
 * fail with AlreadyExists. Cutover is #178.
 */
export class IamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  }
}
