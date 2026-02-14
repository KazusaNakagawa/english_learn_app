import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import * as path from 'path';

export class VoicevoxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ----------------------------------------------------------------
    // Lambda: VOICEVOX engine (Container Image + Lambda Web Adapter)
    // ----------------------------------------------------------------
    const voicevoxFn = new lambda.DockerImageFunction(this, 'VoicevoxFunction', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../lambda/voicevox'),
        // Force linux/amd64 build to match Lambda x86_64 (required on Apple Silicon)
        { platform: ecr_assets.Platform.LINUX_AMD64 }
      ),
      // CPU inference only. 2GB to give VOICEVOX enough headroom
      memorySize: 2048,
      // Allow time for cold start + TTS generation
      timeout: cdk.Duration.seconds(60),
      architecture: lambda.Architecture.X86_64,
      environment: {
        // Lambda Web Adapter: port that VOICEVOX engine listens on
        PORT: '50021',
        // Enable async init so Lambda does not time out during slow startup
        ASYNC_INIT: 'true',
        // Path used by Lambda Web Adapter to confirm the app is ready
        READINESS_CHECK_PATH: '/version',
      },
      description: 'VOICEVOX TTS engine (Zundamon) - PoC',
    });

    // ----------------------------------------------------------------
    // API Gateway: HTTP API
    // ----------------------------------------------------------------
    const httpApi = new apigatewayv2.HttpApi(this, 'VoicevoxHttpApi', {
      apiName: 'voicevox-api',
      description: 'VOICEVOX TTS API (PoC)',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Accept'],
      },
    });

    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'VoicevoxLambdaIntegration',
      voicevoxFn
    );

    // ----------------------------------------------------------------
    // Routes: expose VOICEVOX engine API endpoints
    //
    // Speech synthesis flow:
    //   1. POST /audio_query?text=...&speaker=3  -> get query JSON
    //   2. POST /synthesis?speaker=3  body=queryJSON -> get WAV binary
    // ----------------------------------------------------------------

    // (1) Text -> audio query generation
    httpApi.addRoutes({
      path: '/audio_query',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // (2) Query -> speech synthesis (WAV binary)
    httpApi.addRoutes({
      path: '/synthesis',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // List available speakers
    httpApi.addRoutes({
      path: '/speakers',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // Health check / version
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
      exportName: 'VoicevoxApiEndpoint',
    });

    new cdk.CfnOutput(this, 'VoicevoxFunctionArn', {
      value: voicevoxFn.functionArn,
      description: 'VOICEVOX Lambda function ARN',
    });
  }
}
