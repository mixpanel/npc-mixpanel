module.exports = {
	preset: 'jest-puppeteer',
	transform: {},
	testMatch: ['**/tests/**/*.test.js'],
	collectCoverageFrom: ['meeple/**/*.js', 'utils/**/*.js', 'server.js', '!**/node_modules/**', '!**/tmp/**'],
	coverageDirectory: 'coverage',
	clearMocks: true,
	restoreMocks: true,
	verbose: true,
	watchman: false, // Disable file watching
	watch: false, // Disable watch mode
	watchAll: false // Disable watch all mode
};
