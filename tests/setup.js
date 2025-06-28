/**
 * Jest test setup file for jest-puppeteer integration
 * Configures global test environment and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MIXPANEL_TOKEN = 'test-token-12345';

// Configure test timeouts (will be set by jest-puppeteer)

// Global test utilities
global.createTestPage = async (content) => {
  const page = await browser.newPage();
  await page.setContent(content);
  return page;
};

global.createSimpleTestPage = async () => {
  return await createTestPage(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Page</title>
      </head>
      <body>
        <h1>Test Page</h1>
        <button type="submit" class="btn-primary">Submit Button</button>
        <button class="regular-btn">Regular Button</button>
        <a href="#test">Test Link</a>
        <div style="height: 2000px;">
          <p>Scrollable content</p>
        </div>
      </body>
    </html>
  `);
};

// Suppress some console output during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  // Only suppress certain noisy logs
  const message = args.join(' ');
  if (!message.includes('[NPC]') && !message.includes('DevTools')) {
    originalConsoleLog(...args);
  }
};

console.warn = (...args) => {
  // Only suppress certain warnings
  const message = args.join(' ');
  if (!message.includes('deprecated') && !message.includes('CSP')) {
    originalConsoleWarn(...args);
  }
};