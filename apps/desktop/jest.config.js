/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
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
    '!src/main/**',
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
