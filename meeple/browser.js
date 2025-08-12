import puppeteer from 'puppeteer';
import u from 'ak-tools';
import { puppeteerArgs } from './entities.js';

const { NODE_ENV = "" } = process.env;

const agents = await u.load('./meeple/agents.json', true);

/**
 * Set user agent with random selection from agents.json
 * @param {Page} page - Puppeteer page object
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} - User agent and headers object
 */
export async function spoofAgent(page, log = console.log) {
	const agent = u.shuffle(agents).slice().pop();
	const { userAgent, ...headers } = agent;
	const set = await setUserAgent(page, userAgent, headers, log);
	log(`    │  └─ 🥸 User agent: ${userAgent}`);
	return set;
}

/**
 * Set the user agent and additional headers for the page
 * @param {Page} page - Puppeteer page object
 * @param {string} userAgent - User agent string
 * @param {Object} additionalHeaders - Additional headers to set
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} - User agent and headers object
 */
export async function setUserAgent(page, userAgent, additionalHeaders = {}, log = console.log) {
	if (!page) throw new Error("Browser not initialized");

	await page.setUserAgent(userAgent);

	if (Object.keys(additionalHeaders).length > 0) {
		await page.setExtraHTTPHeaders(additionalHeaders);
	}

	return { userAgent, additionalHeaders };
}

/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */

/**
 * Launch a new browser instance with proper configuration
 * @param {boolean} headless - Whether to run in headless mode
 * @param {Function} log - Logging function
 * @returns {Promise<Browser>} - Browser instance
 */
export async function launchBrowser(headless = true, log = console.log) {
	try {
		const browser = await puppeteer.launch({
			headless: headless ? 'new' : false,
			args: puppeteerArgs,
			// No userDataDir - don't persist data for cloud functions
			defaultViewport: {
				width: 1366 + Math.floor(Math.random() * 200),
				height: 768 + Math.floor(Math.random() * 100),
				deviceScaleFactor: 1,
				isMobile: false,
				hasTouch: false,
				isLandscape: true
			},
			// Additional security bypasses at launch level
			ignoreDefaultArgs: ['--enable-automation'],
			ignoreHTTPSErrors: true,
			protocolTimeout: 240000
		});

		// Browser-level security setup (URL-specific permissions will be set per page)

		log(`🚀 Browser launched (headless: ${headless})`);
		return browser;
	} catch (error) {
		log(`❌ Browser launch failed: ${error.message}`);
		throw error;
	}
}

/**
 * Create a new page with realistic user agent and configuration
 * @param {Browser} browser - Browser instance
 * @param {Function} log - Logging function
 * @returns {Promise<Page>} - Page instance
 */
export async function createPage(browser, log = console.log) {
	try {
		const page = await browser.newPage();

		// CRITICAL: Enable CSP bypass at page level immediately
		await page.setBypassCSP(true);

		// Set random realistic user agent
		const randomAgent = agents[Math.floor(Math.random() * agents.length)];
		const { userAgent, ...headers } = randomAgent;
		await page.setUserAgent(userAgent);

		const realisticHeaders = {
			'Accept-Language': 'en-US,en;q=0.9',
			'Accept-Encoding': 'gzip, deflate, br',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
			'Cache-Control': 'no-cache',
			'Pragma': 'no-cache',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'none',
			'Sec-Fetch-User': '?1',
			'Upgrade-Insecure-Requests': '1',
			...headers
		};


		// Set additional headers for realism
		await page.setExtraHTTPHeaders(realisticHeaders);

		// Set viewport with slight randomization
		const viewport = {
			width: 1366 + Math.floor(Math.random() * 200),
			height: 768 + Math.floor(Math.random() * 100)
		};
		await page.setViewport(viewport);

		// Initialize mouse position tracking
		await page.evaluateOnNewDocument(() => {
			window.mouseX = 0;
			window.mouseY = 0;
		});

		log(`📄 New page created with agent: ${userAgent.substring(0, 50)}...`);
		return page;
	} catch (error) {
		log(`❌ Page creation failed: ${error.message}`);
		throw error;
	}
}

/**
 * Navigate to a URL with timeout and error handling
 * @param {Page} page - Puppeteer page object
 * @param {string} url - URL to navigate to
 * @param {Function} log - Logging function
 * @returns {Promise<any>} - Navigation response
 */
export async function navigateToUrl(page, url, log = console.log) {
	const maxRetries = 2;
	let lastError;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			log(`🌐 Navigating to: ${url}${attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : ''}`);

			// Try different wait strategies based on attempt
			const waitStrategies = ['networkidle2', 'domcontentloaded', 'load'];
			const waitUntil = waitStrategies[Math.min(attempt - 1, waitStrategies.length - 1)];

			const response = await page.goto(url, {
				waitUntil,
				timeout: 60000 // 1 minute timeout
			});

			if (response && !response.ok()) {
				log(`⚠️ HTTP ${response.status()}: ${response.statusText()}`);
				// Don't retry for HTTP errors, they're usually legitimate
				return response;
			} else {
				log(`✅ Page loaded successfully`);
			}

			return response;
		} catch (error) {
			lastError = error;
			log(`❌ Navigation attempt ${attempt} failed: ${error.message}`);
			
			// Check if it's a network error that might be retryable
			if (error.message.includes('net::ERR_INVALID_ARGUMENT') || 
				error.message.includes('net::ERR_FAILED') ||
				error.message.includes('Navigation timeout')) {
				
				if (attempt < maxRetries) {
					log(`⏳ Retrying navigation in 2 seconds...`);
					await new Promise(resolve => setTimeout(resolve, 2000));
					continue;
				}
			}
			
			// Don't retry for other types of errors
			break;
		}
	}

	throw lastError;
}

/**
 * Get page title and basic information
 * @param {Page} page - Puppeteer page object
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} - Page information
 */
export async function getPageInfo(page, log = console.log) {
	try {
		const title = await page.title();
		const url = page.url();
		const viewport = page.viewport();

		const info = {
			title: title || 'Untitled',
			url,
			viewport
		};

		log(`📋 Page info: "${info.title}" at ${url}`);
		return info;
	} catch (error) {
		log(`⚠️ Could not get page info: ${error.message}`);
		return {
			title: 'Unknown',
			url: page?.url() || 'unknown',
			viewport: null
		};
	}
}

/**
 * Close browser instance safely
 * @param {Browser} browser - Browser instance to close
 * @param {Function} log - Logging function
 */
export async function closeBrowser(browser, log = console.log) {
	try {
		if (browser) {
			await browser.close();
			log(`🔒 Browser closed`);
		}
	} catch (error) {
		log(`⚠️ Browser close error: ${error.message}`);
	}
}