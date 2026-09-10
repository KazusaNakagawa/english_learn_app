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

/**
 * Environments a `develop` member may touch directly. `pro` is absent, and the
 * allow-list is what actually keeps it out — the explicit pro deny further down
 * is defence in depth for the day another policy joins this group.
 */
const DEVELOP_ENVS = ['poc', 'dev'];

/**
 * IAM writes that must not be reachable from `develop`.
 *
 * Spelled out rather than expressed as "iam:* except ...", because IAM has no
 * subtraction: `NotAction` would deny every *non*-IAM action instead, and a
 * blanket `Deny iam:*` would override the #172 baseline's Allow — an explicit
 * deny beats any allow — leaving the whole group unable to enrol MFA or change
 * a password. That failure is silent until someone new joins, so
 * test/develop-group.test.ts pins each self-service action as *not* denied.
 *
 * Denying these does not break `cdk deploy`: CloudFormation creates roles
 * through the assumed bootstrap role, whose session is not evaluated against
 * the calling user's identity policy. The same property that made the pro deny
 * useless makes this deny harmless.
 */
const DENIED_IAM_WRITES = [
  'iam:CreateUser',
  'iam:DeleteUser',
  'iam:UpdateUser',
  'iam:CreateLoginProfile',
  'iam:UpdateLoginProfile',
  'iam:DeleteLoginProfile',
  'iam:CreateGroup',
  'iam:DeleteGroup',
  'iam:UpdateGroup',
  'iam:AddUserToGroup',
  'iam:RemoveUserFromGroup',
  'iam:AttachUserPolicy',
  'iam:AttachGroupPolicy',
  'iam:AttachRolePolicy',
  'iam:DetachUserPolicy',
  'iam:DetachGroupPolicy',
  'iam:DetachRolePolicy',
  'iam:PutUserPolicy',
  'iam:PutGroupPolicy',
  'iam:PutRolePolicy',
  'iam:DeleteUserPolicy',
  'iam:DeleteGroupPolicy',
  'iam:DeleteRolePolicy',
  'iam:CreatePolicy',
  'iam:DeletePolicy',
  'iam:CreatePolicyVersion',
  'iam:DeletePolicyVersion',
  'iam:SetDefaultPolicyVersion',
  'iam:UpdateAssumeRolePolicy',
  'iam:CreateAccountAlias',
  'iam:DeleteAccountAlias',
  'iam:UpdateAccountPasswordPolicy',
  'iam:CreateSAMLProvider',
  'iam:CreateOpenIDConnectProvider',
  'iam:UpdateOpenIDConnectProviderThumbprint',
  // Roles are the sharpest tool here: anyone able to create one can mint a
  // principal with arbitrary permissions, which makes locking down users and
  // groups alone fairly pointless.
  'iam:CreateRole',
  'iam:DeleteRole',
  'iam:UpdateRole',
  'iam:UpdateRoleDescription',
  // Permissions boundaries are the mechanism a future design would use to cap
  // what these roles can do; being able to detach one voids that in advance.
  'iam:PutRolePermissionsBoundary',
  'iam:DeleteRolePermissionsBoundary',
  'iam:PutUserPermissionsBoundary',
  'iam:DeleteUserPermissionsBoundary',
  // Tags become an authorization surface the moment any policy conditions on
  // aws:ResourceTag, at which point rewriting them is privilege escalation.
  'iam:TagRole',
  'iam:UntagRole',
  'iam:TagUser',
  'iam:UntagUser',
  // Deliberately absent: iam:CreateServiceLinkedRole. AWS defines those roles
  // and their policies, several services create them on first use, and denying
  // it breaks legitimate work for no meaningful gain.
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
            // Covers SSM SecureString: GetParameter WithDecryption needs
            // kms:Decrypt, and an undecrypted read returns only ciphertext.
            // It does NOT cover plain String parameters — see below.
            'kms:Decrypt',
          ],
          resources: ['*'],
        }),
        // kms:Decrypt says nothing about a secret stored in a plain String
        // parameter, which is a common enough mistake to fail closed on.
        // Denying by default costs nothing today: the account holds exactly one
        // parameter, /cdk-bootstrap/hnb659fds/version, whose value is "30".
        //
        // Adding a legitimate non-secret parameter later means widening this
        // exception on purpose, which is the point — an accidental secret in
        // SSM should not silently become readable by everyone in `readonly`.
        new iam.PolicyStatement({
          sid: 'DenySsmParameterValues',
          effect: iam.Effect.DENY,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
            'ssm:GetParameterHistory',
          ],
          notResources: [
            this.formatArn({
              service: 'ssm',
              region: '*',
              account: '*',
              resource: 'parameter',
              resourceName: 'cdk-bootstrap/*',
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            }),
          ],
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

    this.addGroup('DevelopGroup', 'develop', [this.developWorkloadPolicy()]);

    // No `ope` group: it would be identical to `readonly` (see the original
    // requirement, which says as much). Operations staff get `readonly` plus a
    // narrow write policy if and when someone actually needs one — inventing
    // it now would mean guessing at the actions.
  }

  /**
   * What a developer may do without asking infra.
   *
   * `develop` is a **trusted** group, not a sandbox. Granting `cloudformation`
   * plus AssumeRole on the CDK bootstrap roles is effectively admin over
   * whatever a stack can define, and that was accepted deliberately rather
   * than paying the cost of maintaining a narrowed bootstrap role. The
   * controls that actually bind are MFA (#172), CloudTrail on those
   * AssumeRole calls, and stack-side protection on VoicevoxStack-pro.
   * See docs/aws/iam-group-iac-worklog.md.
   */
  private developWorkloadPolicy(): iam.ManagedPolicy {
    const stackArns = DEVELOP_ENVS.map((env) =>
      this.formatArn({
        service: 'cloudformation',
        region: '*',
        resource: 'stack',
        resourceName: `VoicevoxStack-${env}/*`,
      }),
    );

    const perEnv = (build: (env: string) => string) => DEVELOP_ENVS.map(build);

    // account is left to default to this stack's account. Allows are narrowed;
    // the production deny further down deliberately keeps account: '*', since a
    // deny is only ever safer for being broader.
    const lambdaArns = perEnv((env) =>
      this.formatArn({
        service: 'lambda',
        region: '*',
        resource: 'function',
        resourceName: `voicevox-*-${env}`,
        arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
      }),
    );
    const ecrArns = perEnv((env) =>
      this.formatArn({
        service: 'ecr',
        region: '*',
        resource: 'repository',
        resourceName: `voicevox-*-${env}`,
      }),
    );
    const logArns = perEnv((env) =>
      this.formatArn({
        service: 'logs',
        region: '*',
        resource: 'log-group',
        resourceName: `/aws/lambda/voicevox-*-${env}*`,
        arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
      }),
    );
    const snsArns = perEnv((env) =>
      this.formatArn({ service: 'sns', region: '*', resource: `voicevox-*-${env}` }),
    );

    return new iam.ManagedPolicy(this, 'DevelopWorkload', {
      managedPolicyName: 'develop-workload',
      description:
        'Lets developers deploy and iterate on VoicevoxStack poc/dev without infra involvement.',
      statements: [
        new iam.PolicyStatement({
          sid: 'DeployProjectStacks',
          actions: ['cloudformation:*'],
          resources: stackArns,
        }),
        // Not resource-scopeable, and read-only, so granted account-wide.
        new iam.PolicyStatement({
          sid: 'InspectCloudFormation',
          actions: [
            'cloudformation:ListStacks',
            'cloudformation:GetTemplateSummary',
            'cloudformation:ValidateTemplate',
            'cloudformation:DescribeStackDriftDetectionStatus',
          ],
          resources: ['*'],
        }),
        // The step that actually makes `cdk deploy` work. cfn-exec-role is
        // absent on purpose: CloudFormation assumes that one itself, and
        // handing it to a person grants CloudFormation's own execution rights.
        new iam.PolicyStatement({
          sid: 'AssumeCdkBootstrapRoles',
          actions: ['sts:AssumeRole'],
          resources: [
            'deploy-role',
            'file-publishing-role',
            'image-publishing-role',
            'lookup-role',
          ].map((role) =>
            this.formatArn({
              service: 'iam',
              region: '',
              resource: 'role',
              resourceName: `cdk-*-${role}-*`,
            }),
          ),
        }),
        new iam.PolicyStatement({
          sid: 'IterateOnWorkloadResources',
          actions: ['lambda:*', 'ecr:*', 'logs:*', 'sns:*'],
          resources: [...lambdaArns, ...ecrArns, ...logArns, ...snsArns],
        }),
        // CloudWatch alarms and API Gateway cannot be scoped by name:
        // alarm ARNs carry CDK-generated suffixes, and API Gateway v2 ARNs
        // identify APIs by generated id, not by stack or environment. Both are
        // therefore account-wide, which includes pro. Recorded rather than
        // papered over — it is consistent with `develop` being trusted, but it
        // is a genuine hole in the environment separation.
        new iam.PolicyStatement({
          sid: 'ManageObservabilityAndApiUnscopeable',
          actions: ['cloudwatch:*', 'apigateway:*'],
          resources: ['*'],
        }),
        // Needed to attach the Lambda execution role during a direct update.
        // An unscoped PassRole would let any role be attached to a function,
        // which is privilege escalation by another name.
        new iam.PolicyStatement({
          sid: 'PassProjectRolesOnly',
          actions: ['iam:PassRole'],
          resources: [
            // CDK-generated role names are prefixed with the stack name...
            'VoicevoxStack-*',
            // ...but the Lambda execution role is named explicitly in
            // voicevox-stack.ts (`voicevox-engine-role-${stackEnv}`), so the
            // stack-name pattern alone would miss the one role a direct
            // function update actually needs to pass.
            'voicevox-*-role-*',
          ].map((roleName) =>
            this.formatArn({
              service: 'iam',
              region: '',
              resource: 'role',
              resourceName: roleName,
            }),
          ),
        }),
        new iam.PolicyStatement({
          sid: 'DenyIamAdministration',
          effect: iam.Effect.DENY,
          actions: DENIED_IAM_WRITES,
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'DenyAccountLevelControls',
          effect: iam.Effect.DENY,
          actions: ['organizations:*', 'account:*', 'ce:*', 'aws-portal:*'],
          resources: ['*'],
        }),
        // Blocks direct calls at pro. It does NOT block `cdk deploy -c env=pro`:
        // after sts:AssumeRole the session is evaluated as the bootstrap role,
        // and the caller's identity policy no longer applies. Production is
        // guarded stack-side instead — see #174 and the worklog.
        new iam.PolicyStatement({
          sid: 'DenyDirectCallsAgainstProduction',
          effect: iam.Effect.DENY,
          actions: ['lambda:*', 'ecr:*', 'logs:*', 'sns:*', 'cloudformation:*'],
          resources: [
            this.formatArn({
              service: 'lambda',
              region: '*',
              account: '*',
              resource: 'function',
              resourceName: 'voicevox-*-pro',
              arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
            }),
            this.formatArn({
              service: 'ecr',
              region: '*',
              account: '*',
              resource: 'repository',
              resourceName: 'voicevox-*-pro',
            }),
            this.formatArn({
              service: 'logs',
              region: '*',
              account: '*',
              resource: 'log-group',
              resourceName: '/aws/lambda/voicevox-*-pro*',
              arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
            }),
            this.formatArn({
              service: 'sns',
              region: '*',
              account: '*',
              resource: 'voicevox-*-pro',
            }),
            this.formatArn({
              service: 'cloudformation',
              region: '*',
              account: '*',
              resource: 'stack',
              resourceName: 'VoicevoxStack-pro/*',
            }),
          ],
        }),
      ],
    });
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
