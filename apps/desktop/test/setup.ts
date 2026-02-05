// Global test setup for NestJS backend tests
// This runs before each test file via setupFiles in jest.config.js

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Suppress logger output during tests by setting log level to error-only
process.env.LOG_LEVEL = 'error';
