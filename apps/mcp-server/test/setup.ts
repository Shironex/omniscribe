// Global test setup for MCP server tests
// This runs before each test file via setupFiles in jest.config.js

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
