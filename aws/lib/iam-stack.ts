import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * IAM policy variable expanded by AWS at evaluation time, NOT a CDK token.
 * It must survive synthesis literally, so never build it with a TS template
 * string — `${aws:username}` inside a backtick literal would interpolate.
 */
const OWN_USERNAME = '${aws:username}';

/**
 * Actions a user must be able to call *before* they have MFA, or they can
 * never enrol. Everything outside this list is denied without an MFA session.
 *
 * `sts:GetSessionToken` is what makes an MFA session obtainable at all —
 * dropping it locks every user out of the account permanently.
 *
 * `iam:DeleteVirtualMFADevice` is here deliberately (#172). Without it a user
 * whose enrolment stalls half-way cannot delete the pending device, cannot
 * recreate it under the same name (EntityAlreadyExists), and needs an
 * administrator to recover. It stays safe because AWS requires an *assigned*
 * device to be deactivated before deletion, and `iam:DeactivateMFADevice` is
 * NOT exempt — so a password-only attacker still cannot strip an active MFA.
 */
const ALLOWED_WITHOUT_MFA = [
  'iam:ChangePassword',
  'iam:GetUser',
  'iam:CreateVirtualMFADevice',
  'iam:DeleteVirtualMFADevice',
  'iam:EnableMFADevice',
  'iam:ListMFADevices',
  'iam:ListVirtualMFADevices',
  'iam:ResyncMFADevice',
  'iam:GetAccountPasswordPolicy',
  'sts:GetSessionToken',
];

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
  /**
   * Attach BOTH of these to every group. They are the reason the group split
   * means anything: without them a leaked long-lived key works unchallenged.
   *
   * Exposed rather than applied to an "all-users" group on purpose — a group
   * someone forgets to add a user to is a silent hole, whereas a group missing
   * a policy is caught by the invariant test in test/mfa-baseline.test.ts.
   */
  public readonly baselinePolicies: iam.IManagedPolicy[];

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ownUser = this.formatArn({
      service: 'iam',
      region: '',
      resource: 'user',
      resourceName: OWN_USERNAME,
    });
    const ownMfaDevice = this.formatArn({
      service: 'iam',
      region: '',
      resource: 'mfa',
      resourceName: OWN_USERNAME,
    });

    // ----------------------------------------------------------------
    // Self-service: enrol MFA, change password, rotate own access key
    // ----------------------------------------------------------------
    const selfServiceCredentials = new iam.ManagedPolicy(this, 'SelfServiceCredentials', {
      managedPolicyName: 'self-service-credentials',
      description:
        'Lets a user manage their own password, MFA device and access key. Pairs with deny-without-mfa.',
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowViewAccountInfo',
          actions: ['iam:GetAccountPasswordPolicy', 'iam:ListVirtualMFADevices'],
          // Neither action accepts a resource-level restriction.
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'AllowManageOwnCredentials',
          actions: [
            'iam:ChangePassword',
            'iam:GetUser',
            'iam:CreateVirtualMFADevice',
            'iam:DeleteVirtualMFADevice',
            'iam:EnableMFADevice',
            'iam:ListMFADevices',
            'iam:ResyncMFADevice',
            // Required to swap MFA devices. Allowed here but NOT exempt from
            // the deny below, so it needs an MFA-authenticated session.
            'iam:DeactivateMFADevice',
            // Key rotation, likewise gated behind MFA by the deny (#172).
            'iam:CreateAccessKey',
            'iam:UpdateAccessKey',
            'iam:DeleteAccessKey',
            'iam:ListAccessKeys',
          ],
          resources: [ownUser, ownMfaDevice],
        }),
      ],
    });

    // ----------------------------------------------------------------
    // Deny everything else unless the session is MFA-authenticated
    // ----------------------------------------------------------------
    const denyWithoutMfa = new iam.ManagedPolicy(this, 'DenyWithoutMfa', {
      managedPolicyName: 'deny-without-mfa',
      description:
        'Denies every action outside MFA enrolment unless the session is MFA-authenticated.',
      statements: [
        new iam.PolicyStatement({
          sid: 'DenyAllUnlessMfaAuthenticated',
          effect: iam.Effect.DENY,
          notActions: ALLOWED_WITHOUT_MFA,
          resources: ['*'],
          conditions: {
            // BoolIfExists, not Bool: long-lived access keys carry no
            // aws:MultiFactorAuthPresent key at all, and must be denied too.
            BoolIfExists: { 'aws:MultiFactorAuthPresent': 'false' },
          },
        }),
      ],
    });

    this.baselinePolicies = [selfServiceCredentials, denyWithoutMfa];
  }
}
