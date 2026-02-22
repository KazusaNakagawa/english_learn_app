import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
    super(scope, id, props);

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
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const apiKey = event.headers['x-api-key'];
          const expectedKey = process.env.API_KEY;

          const isAuthorized = apiKey === expectedKey;

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
    // API Gateway: HTTP API (CORS disabled for native iOS app)
    // ----------------------------------------------------------------
    const httpApi = new apigatewayv2.HttpApi(this, 'VoicevoxHttpApi', {
      apiName: `voicevox-api-${stackEnv}`,
      description: `VOICEVOX TTS API (${stackEnv})`,
      // CORS removed: native iOS app does not require CORS
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
