/**
 * AWS Amplify & AppSync configuration.
 *
 * Values are loaded from environment variables at build / run time.
 * For local development, create .env.local with the required values.
 */

const awsConfig = {
  API: {
    GraphQL: {
      endpoint: process.env.NEXT_PUBLIC_APPSYNC_ENDPOINT ?? '',
      region: process.env.NEXT_PUBLIC_AWS_REGION ?? 'ap-northeast-1',
      defaultAuthMode: 'apiKey' as const,
      apiKey: process.env.NEXT_PUBLIC_APPSYNC_API_KEY ?? '',
    },
  },
};

export default awsConfig;
