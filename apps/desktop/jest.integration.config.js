/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  clearMocks: true,
  testTimeout: 30_000,
  moduleNameMapper: {
    '^@omniscribe/shared$': '<rootDir>/../../packages/shared/dist',
    '^@omniscribe/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
      },
    ],
  },
};
