/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  clearMocks: true,
  globals: {
    __VERSION__: '0.0.0-test',
  },
  moduleNameMapper: {
    // Strip .js extensions from relative imports (ESM source → CJS test)
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Workspace package
    '^@omniscribe/shared$': '<rootDir>/../../packages/shared/dist',
    '^@omniscribe/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
    '!src/tools/types.ts',
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
