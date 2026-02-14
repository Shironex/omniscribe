/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  clearMocks: true,
  moduleNameMapper: {
    '^@omniscribe/shared$': '<rootDir>/../../packages/shared/dist',
    '^@omniscribe/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    // Exclude main-process files that don't have tests yet
    '!src/main/preload.ts',
    '!src/main/logger.ts',
    '!src/main/updater.ts',
    '!src/main/backend-port.ts',
    '!src/main/ipc-handlers.ts',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
      },
    ],
  },
};
