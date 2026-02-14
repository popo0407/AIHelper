/** @type {import('jest').Config} */
const config = {
  displayName: 'aichat-frontend',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Module name mapping — mirrors tsconfig paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },

  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}'],

  collectCoverageFrom: [
    'src/components/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],

  // Use ts-jest for TypeScript transform (no SWC required)
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },

  transformIgnorePatterns: [
    '/node_modules/(?!(aws-amplify|@aws-amplify)/)',
  ],
};

module.exports = config;
