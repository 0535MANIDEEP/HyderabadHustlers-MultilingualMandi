// Jest setup file for Multilingual Mandi Backend
// This file is executed before running tests

const path = require('path');
const dotenv = require('dotenv');

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce test output noise (optional)
// Uncomment if you want cleaner test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test timeout
jest.setTimeout(30000);

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
});