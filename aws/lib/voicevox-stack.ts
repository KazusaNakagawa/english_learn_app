import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as ecrDeploy from 'cdk-ecr-deployment';
import { Construct } from 'constructs';
import * as path from 'path';

export interface VoicevoxStackProps extends cdk.StackProps {
  /** Deployment environment: 'poc' | 'dev' | 'pro' */
  stackEnv: string;
}

const envConfig: Record<string, { memorySize: number; throttleRateLimit: number; throttleBurstLimit: number }> = {
  poc: { memorySize: 2048, throttleRateLimit: 5,   throttleBurstLimit: 10  },
  dev: { memorySize: 2048, throttleRateLimit: 10,  throttleBurstLimit: 20  },
  pro: { memorySize: 3008, throttleRateLimit: 50,  throttleBurstLimit: 100 },
};

export class VoicevoxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: VoicevoxStackProps) {
    super(scope, id, {
      ...props,
      // Production is guarded here rather than in the `develop` group's policy.
      // That group can assume the CDK bootstrap roles, and after sts:AssumeRole
      // the caller's identity policy is no longer evaluated — so an IAM deny
      // cannot reach a `cdk deploy`. Stack-side protection binds regardless of
      // which principal or assumed role makes the call. See #174.
      terminationProtection: props.terminationProtection ?? props.stackEnv === 'pro',
    });

    const { stackEnv } = props;
    const cfg = envConfig[stackEnv];

    // ----------------------------------------------------------------
    // ECR: dedicated repository with human-readable name
    // ----------------------------------------------------------------
    const repository = new ecr.Repository(this, 'VoicevoxRepository', {
      repositoryName: `voicevox-engine-${stackEnv}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // Allow `cdk destroy` to succeed even when the repository contains images
      emptyOnDelete: true,
      lifecycleRules: [
        {
          // Prevent unbounded accumulation of hash-tagged images
          maxImageCount: 10,
          description: 'Retain last 10 images',
        },
      ],
    });

    // Build the Docker image asset (pushed to bootstrap ECR repo with content-hash tag)
    const imageAsset = new ecr_assets.DockerImageAsset(this, 'VoicevoxImage', {
      directory: path.join(__dirname, '../lambda/voicevox'),
      // Force linux/amd64 build to match Lambda x86_64 (required on Apple Silicon)
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    // Copy to voicevox-engine-{env}:<hash> so CloudFormation detects image changes automatically
    const deployHashTag = new ecrDeploy.ECRDeployment(this, 'DeployVoicevoxImageHash', {
      src: new ecrDeploy.DockerImageName(imageAsset.imageUri),
      dest: new ecrDeploy.DockerImageName(`${repository.repositoryUri}:${imageAsset.imageTag}`),
    });

    // Also tag as :latest for human-readable display in the ECR console
    new ecrDeploy.ECRDeployment(this, 'DeployVoicevoxImageLatest', {
      src: new ecrDeploy.DockerImageName(imageAsset.imageUri),
      dest: new ecrDeploy.DockerImageName(`${repository.repositoryUri}:latest`),
    });

    // ----------------------------------------------------------------
    // Lambda: VOICEVOX engine (Container Image + Lambda Web Adapter)
    // ----------------------------------------------------------------
    const executionRole = new iam.Role(this, 'VoicevoxFunctionRole', {
      roleName: `voicevox-engine-role-${stackEnv}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    const voicevoxFn = new lambda.DockerImageFunction(this, 'VoicevoxFunction', {
      functionName: `voicevox-engine-${stackEnv}`,
      role: executionRole,
      // Reference voicevox-engine-{env} repo with content-hash tag.
      // The hash changes when the Dockerfile changes, so CloudFormation
      // automatically re-deploys Lambda on every image update.
      code: lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: imageAsset.imageTag,
      }),
      memorySize: cfg.memorySize,
      // Allow time for cold start (VOICEVOX model loading ~30s) + TTS generation
      timeout: cdk.Duration.seconds(120),
      architecture: lambda.Architecture.X86_64,
      environment: {
        // Lambda Web Adapter: port that VOICEVOX engine listens on
        PORT: '50021',
        // Enable async init so Lambda does not time out during slow startup
        ASYNC_INIT: 'true',
        // Path used by Lambda Web Adapter to confirm the app is ready
        READINESS_CHECK_PATH: '/version',
      },
      description: `VOICEVOX TTS engine (Zundamon) - ${stackEnv}`,
      // NOTE: reservedConcurrentExecutions is intentionally omitted.
      // New AWS accounts have a default Lambda concurrency limit of 10.
      // Reserving any units would drop unreserved concurrency below the
      // required minimum of 10, causing a deployment error.
      // Cost is capped instead by API Gateway throttling.
    });

    // Allow Lambda to pull the container image from the dedicated ECR repository
    repository.grantPull(executionRole);

    // Ensure Lambda is updated only after the image is copied to voicevox-engine-{env}:<hash>.
    // Without this, CloudFormation may update Lambda before ECRDeployment completes,
    // causing "Source image does not exist" errors.
    voicevoxFn.node.addDependency(deployHashTag);

    // ----------------------------------------------------------------
    // Lambda Authorizer: API Key validation
    // ----------------------------------------------------------------
    // Read API key from environment variable (set before deployment)
    // Example: export VOICEVOX_API_KEY_POC="your-secret-key-here"
    const apiKeyEnvVar = `VOICEVOX_API_KEY_${stackEnv.toUpperCase()}`;
    const apiKeyValue = process.env[apiKeyEnvVar];

    if (!apiKeyValue) {
      throw new Error(
        `API key not found. Set environment variable: ${apiKeyEnvVar}\n` +
        `Example: export ${apiKeyEnvVar}="$(openssl rand -hex 32)"`
      );
    }

    const authorizerFn = new lambda.Function(this, 'ApiKeyAuthorizer', {
      functionName: `voicevox-authorizer-${stackEnv}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          // Safely access headers with optional chaining to prevent TypeError
          const apiKey = event.headers?.['x-api-key'];
          const expectedKey = process.env.API_KEY;

          // Only authorize if both keys exist and match
          const isAuthorized = Boolean(apiKey && expectedKey && apiKey === expectedKey);

          return {
            isAuthorized: isAuthorized,
          };
        };
      `),
      environment: {
        API_KEY: apiKeyValue,
      },
      description: `API key authorizer for VOICEVOX (${stackEnv})`,
    });

    // ----------------------------------------------------------------
    // API Gateway: HTTP API
    // CORS is required for the Web SPA (browser fetch).
    // iOS native app is unaffected by CORS headers.
    // poc: wildcard origin for PoC validation
    // dev/pro: restrict to the deployed CloudFront domain once known
    // ----------------------------------------------------------------
    const corsAllowOrigins = stackEnv === 'poc'
      ? ['*']
      : [`https://voicevox-${stackEnv}.example.com`]; // Replace with actual CloudFront domain

    const httpApi = new apigatewayv2.HttpApi(this, 'VoicevoxHttpApi', {
      apiName: `voicevox-api-${stackEnv}`,
      description: `VOICEVOX TTS API (${stackEnv})`,
      corsPreflight: {
        allowOrigins: corsAllowOrigins,
        allowMethods: [
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'x-api-key'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Apply per-environment throttling to the $default stage
    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigatewayv2.CfnStage;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: cfg.throttleBurstLimit,
        throttlingRateLimit: cfg.throttleRateLimit,
      };
    }

    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'VoicevoxLambdaIntegration',
      voicevoxFn
    );

    // Create Lambda authorizer for API key validation
    const authorizer = new apigatewayv2Authorizers.HttpLambdaAuthorizer(
      'VoicevoxApiKeyAuthorizer',
      authorizerFn,
      {
        authorizerName: `voicevox-authorizer-${stackEnv}`,
        responseTypes: [apigatewayv2Authorizers.HttpLambdaResponseType.SIMPLE],
        identitySource: ['$request.header.x-api-key'],
        resultsCacheTtl: cdk.Duration.minutes(5),
      }
    );

    // ----------------------------------------------------------------
    // Routes: expose VOICEVOX engine API endpoints
    //
    // Speech synthesis flow:
    //   1. POST /audio_query?text=...&speaker=3  -> get query JSON
    //   2. POST /synthesis?speaker=3  body=queryJSON -> get WAV binary
    // ----------------------------------------------------------------

    // (1) Text -> audio query generation (requires API key)
    httpApi.addRoutes({
      path: '/audio_query',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: lambdaIntegration,
      authorizer: authorizer,
    });

    // (2) Query -> speech synthesis (WAV binary) (requires API key)
    httpApi.addRoutes({
      path: '/synthesis',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: lambdaIntegration,
      authorizer: authorizer,
    });

    // List available speakers (requires API key)
    httpApi.addRoutes({
      path: '/speakers',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: lambdaIntegration,
      authorizer: authorizer,
    });

    // Health check / version (public, no authentication)
    httpApi.addRoutes({
      path: '/version',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // ----------------------------------------------------------------
    // CloudWatch Alarms: API Gateway 4xx / 5xx → SNS → Slack
    // ----------------------------------------------------------------

    // SNS topic: receives alarm state changes from CloudWatch
    const alertTopic = new sns.Topic(this, 'ApiAlertTopic', {
      topicName: `voicevox-api-alert-${stackEnv}`,
      displayName: `VOICEVOX API Alerts (${stackEnv})`,
    });

    // Slack Webhook URL は環境変数から取得
    // Example: export VOICEVOX_SLACK_WEBHOOK_POC="https://hooks.slack.com/services/..."
    const slackWebhookEnvVar = `VOICEVOX_SLACK_WEBHOOK_${stackEnv.toUpperCase()}`;
    const slackWebhookUrl = process.env[slackWebhookEnvVar];
    if (!slackWebhookUrl) {
      cdk.Annotations.of(this).addWarning(
        `${slackWebhookEnvVar} is not set. Slack notifications will be skipped.`
      );
    }

    const slackAlertFn = new lambda.Function(this, 'SlackAlertFunction', {
      functionName: `voicevox-slack-alert-${stackEnv}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/alert-to-slack')),
      environment: {
        // Webhook URL が未設定の場合、Lambda は通知をスキップしてログのみ出力する
        SLACK_WEBHOOK_URL: slackWebhookUrl ?? '',
      },
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: `Forwards CloudWatch Alarm notifications to Slack (${stackEnv})`,
    });

    // SNS → Lambda サブスクリプション
    alertTopic.addSubscription(
      new sns_subscriptions.LambdaSubscription(slackAlertFn)
    );

    const alarmAction = new cloudwatch_actions.SnsAction(alertTopic);

    // 4xx アラーム: 5分間で10件超えたら通知
    // （認証エラーなどのノイズを除くため閾値を10に設定）
    const api4xxAlarm = new cloudwatch.Alarm(this, 'Api4xxAlarm', {
      alarmName: `voicevox-api-4xx-${stackEnv}`,
      alarmDescription: 'API Gateway 4xx errors exceeded threshold (5min / >10)',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4xx',
        dimensionsMap: { ApiId: httpApi.apiId },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      // データなし = 問題なし（夜間などのトラフィックゼロ時に誤発報しない）
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api4xxAlarm.addAlarmAction(alarmAction);
    api4xxAlarm.addOkAction(alarmAction);  // 回復時も通知

    // 5xx アラーム: 5分間で1件でも通知（サーバーエラーは即時検知）
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `voicevox-api-5xx-${stackEnv}`,
      alarmDescription: 'API Gateway 5xx errors exceeded threshold (5min / >=1)',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: { ApiId: httpApi.apiId },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api5xxAlarm.addAlarmAction(alarmAction);
    api5xxAlarm.addOkAction(alarmAction);  // 回復時も通知

    // ----------------------------------------------------------------
    // Outputs
    // ----------------------------------------------------------------
    new cdk.CfnOutput(this, 'VoicevoxApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'VOICEVOX API Gateway endpoint URL',
      exportName: `VoicevoxApiEndpoint-${stackEnv}`,
    });

    new cdk.CfnOutput(this, 'VoicevoxFunctionArn', {
      value: voicevoxFn.functionArn,
      description: 'VOICEVOX Lambda function ARN',
    });

    // API key output removed for security:
    // - CloudFormation Outputs are visible in AWS Console and CLI
    // - API key is already known from the environment variable used during deployment
    // - Use the value of VOICEVOX_API_KEY_{ENV} instead
  }
}
