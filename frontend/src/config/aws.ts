/**
 * AWS Amplify & AppSync configuration.
 *
 * Values are loaded from environment variables at build / run time.
 * For local development, create .env.local with the required values.
 */

const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID ?? '',
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID ?? '',
      loginWith: {
        email: true,
      },
      signUpVerificationMethod: 'code' as const,
      userAttributes: {
        email: {
          required: true,
        },
      },
      allowGuestAccess: false,
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: false,
      },
    },
  },
  API: {
    GraphQL: {
      endpoint: process.env.NEXT_PUBLIC_APPSYNC_ENDPOINT ?? '',
      region: process.env.NEXT_PUBLIC_AWS_REGION ?? 'ap-northeast-1',
      defaultAuthMode: 'userPool' as const,
    },
  },
};

export default awsConfig;
