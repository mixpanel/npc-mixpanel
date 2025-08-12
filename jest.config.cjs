module.exports = {
  preset: 'jest-puppeteer',
  transform: {},
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'meeple/**/*.js',
    'utils/**/*.js',
    'server.js',
    '!**/node_modules/**',
    '!**/tmp/**'
  ],
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  restoreMocks: true,
  verbose: true
};