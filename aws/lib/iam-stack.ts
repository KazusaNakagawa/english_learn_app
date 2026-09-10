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
 * The subset of ALLOWED_WITHOUT_MFA that can name another user's resource.
 *
 * A `NotAction` exemption is not resource-scoped: it says "this action is not
 * denied", for *any* resource. On its own that is too generous, because a
 * principal that also holds broad IAM permissions (the existing `dev_user`
 * group carries `IAMFullAccess`) could then use a password-only session to
 * change someone else's password or attach an MFA device to their user.
 *
 * These actions are therefore denied again, this time with `NotResource`
 * limited to the caller's own ARNs, so the exemption really means
 * "manage your own credentials" rather than "manage anyone's".
 *
 * Account-level actions are excluded on purpose — `iam:ListVirtualMFADevices`,
 * `iam:GetAccountPasswordPolicy` and `sts:GetSessionToken` have no per-user
 * resource to match, so scoping them would deny them outright and close the
 * only route into MFA enrolment.
 */
/**
 * Lambda functions whose environment variables hold secrets in plaintext.
 *
 * `ReadOnlyAccess` includes `lambda:GetFunctionConfiguration`, which returns
 * the environment block verbatim — so without an explicit deny, anyone in
 * `readonly` can read these values:
 *
 *   voicevox-authorizer-*   → API_KEY            (the VOICEVOX API credential)
 *   voicevox-slack-alert-*  → SLACK_WEBHOOK_URL  (post access to the channel)
 *
 * Wildcarded across environments because the stack names them `-{env}`.
 * The engine function is deliberately absent: it holds no secret and is the
 * main thing an investigator needs to look at.
 *
 * The real fix is to stop putting secrets in Lambda environment variables at
 * all; that belongs to VoicevoxStack, so it is tracked in #182.
 */
const SECRET_BEARING_FUNCTIONS = ['voicevox-authorizer-*', 'voicevox-slack-alert-*'];

const SELF_TARGETED_WITHOUT_MFA = [
  'iam:ChangePassword',
  'iam:GetUser',
  'iam:CreateVirtualMFADevice',
  'iam:DeleteVirtualMFADevice',
  'iam:EnableMFADevice',
  'iam:ListMFADevices',
  'iam:ResyncMFADevice',
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
        // Narrows the exemption above from "any resource" to "your own".
        // Without this, the baseline is defeated by any policy on the same
        // principal that grants these actions broadly (e.g. IAMFullAccess).
        new iam.PolicyStatement({
          sid: 'DenyOtherPeoplesCredentialsUnlessMfaAuthenticated',
          effect: iam.Effect.DENY,
          actions: SELF_TARGETED_WITHOUT_MFA,
          notResources: [ownUser, ownMfaDevice],
          conditions: {
            BoolIfExists: { 'aws:MultiFactorAuthPresent': 'false' },
          },
        }),
      ],
    });

    this.baselinePolicies = [selfServiceCredentials, denyWithoutMfa];

    // ----------------------------------------------------------------
    // Plug the secret-shaped holes in ReadOnlyAccess / SecurityAudit
    // ----------------------------------------------------------------
    const denySecretReads = new iam.ManagedPolicy(this, 'DenySecretReads', {
      managedPolicyName: 'deny-secret-reads',
      description:
        'Blocks the reads through which AWS read-only policies would expose secret material.',
      statements: [
        new iam.PolicyStatement({
          sid: 'DenySecretMaterial',
          effect: iam.Effect.DENY,
          actions: [
            'secretsmanager:GetSecretValue',
            // Also closes SSM SecureString: GetParameter WithDecryption needs
            // kms:Decrypt, while the undecrypted read returns only ciphertext.
            'kms:Decrypt',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'DenyLambdaEnvironmentHoldingSecrets',
          effect: iam.Effect.DENY,
          actions: ['lambda:GetFunction', 'lambda:GetFunctionConfiguration'],
          resources: SECRET_BEARING_FUNCTIONS.map((name) =>
            this.formatArn({
              service: 'lambda',
              region: '*',
              account: '*',
              resource: 'function',
              resourceName: name,
              arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
            }),
          ),
        }),
      ],
    });

    // ----------------------------------------------------------------
    // Groups
    // ----------------------------------------------------------------
    this.addGroup('ReadonlyGroup', 'readonly', [
      iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
      denySecretReads,
    ]);

    // Config-level review without ReadOnlyAccess's object-level data reads.
    this.addGroup('AuditGroup', 'audit', [
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecurityAudit'),
      denySecretReads,
    ]);

    // No `ope` group: it would be identical to `readonly` (see the original
    // requirement, which says as much). Operations staff get `readonly` plus a
    // narrow write policy if and when someone actually needs one — inventing
    // it now would mean guessing at the actions.
  }

  /**
   * Creates a group with the MFA baseline always attached.
   *
   * Groups are only ever created through here so that the baseline cannot be
   * forgotten — a group without it would silently accept password-only access.
   */
  private addGroup(
    id: string,
    groupName: string,
    managedPolicies: iam.IManagedPolicy[],
  ): iam.Group {
    return new iam.Group(this, id, {
      groupName,
      managedPolicies: [...this.baselinePolicies, ...managedPolicies],
    });
  }
}
