import puppeteer from 'puppeteer';
import u from 'ak-tools';
import { puppeteerArgs } from './entities.js';

// @ts-expect-error - Reserved for environment-specific configuration
const { NODE_ENV = '' } = process.env;

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
	if (!page) throw new Error('Browser not initialized');
	await page.setUserAgent(userAgent);

	if (Object.keys(additionalHeaders).length > 0) {
		await page.setExtraHTTPHeaders(additionalHeaders);
		log(`    │  └─ 🌐 ${Object.keys(additionalHeaders).join(', ')} headers set`);
	}

	return { userAgent, additionalHeaders };
}

/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */

/**
 * Launch a new browser instance with proper configuration
 *
 * DevTools Debugging:
 * - Set NODE_ENV=dev and headless=false to auto-open DevTools
 * - Use 'debugger' statements in injected code to pause execution
 * - Example: NODE_ENV=dev npm run local (with headless: false in config)
 *
 * @param {boolean} headless - Whether to run in headless mode
 * @param {Function} log - Logging function
 * @returns {Promise<Browser>} - Browser instance
 */
export async function launchBrowser(headless = true, log = console.log) {
	try {
		// Auto-open DevTools in development mode when not headless
		const isDev = process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development';
		const shouldOpenDevTools = isDev && !headless;

		if (shouldOpenDevTools) {
			log('🔧 Opening DevTools automatically (NODE_ENV=dev, headless=false)');
		}

		const browser = await puppeteer.launch({
			// @ts-ignore
			headless: headless ? 'new' : false,
			args: puppeteerArgs,
			// Auto-open DevTools for debugging
			devtools: shouldOpenDevTools,
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

		// Close the initial blank page that Puppeteer creates automatically
		// This prevents the "multiple about:blank pages" issue in headful mode
		try {
			const pages = await browser.pages();
			if (pages.length > 0 && pages[0].url() === 'about:blank') {
				await pages[0].close();
				log('🧹 Closed initial blank page');
			}
		} catch (err) {
			// Non-critical error, just log and continue
			log(`⚠️ Could not close initial blank page: ${err.message}`);
		}

		log(`🚀 Browser launched (headless: ${headless})`);
		return browser;
	} catch (error) {
		log(`❌ Browser launch failed: ${error.message}`);
		throw error;
	}
}

/**
 * Apply CDP network throttling to simulate poor network conditions
 * @param {Page} page - Puppeteer page object
 * @param {string} profile - Network profile: 'fast' | 'slow3g' | 'slow4g' | 'offline'
 * @param {Function} log - Logging function
 */
export async function applyNetworkThrottling(page, profile = 'fast', log = console.log) {
	if (!profile || profile === 'fast') return;

	try {
		const client = await page.createCDPSession();
		await client.send('Network.enable');

		const profiles = {
			slow3g: {
				offline: false,
				downloadThroughput: ((500 * 1000) / 8) * 0.8, // 500 kbps
				uploadThroughput: ((500 * 1000) / 8) * 0.8,
				latency: 400 * 5 // 2000ms
			},
			slow4g: {
				offline: false,
				downloadThroughput: ((4000 * 1000) / 8) * 0.8, // 4 Mbps
				uploadThroughput: ((3000 * 1000) / 8) * 0.8,
				latency: 100 * 4 // 400ms
			},
			moderate: {
				offline: false,
				downloadThroughput: ((2000 * 1000) / 8) * 0.8, // 2 Mbps
				uploadThroughput: ((1000 * 1000) / 8) * 0.8,
				latency: 150 // 150ms
			},
			offline: {
				offline: true,
				downloadThroughput: 0,
				uploadThroughput: 0,
				latency: 0
			}
		};

		const config = profiles[profile];
		if (!config) {
			log(`⚠️ Unknown network profile "${profile}", skipping throttling`);
			return;
		}

		await client.send('Network.emulateNetworkConditions', config);
		const labels = { slow3g: 'Slow 3G', slow4g: 'Slow 4G', moderate: 'Moderate (2 Mbps)', offline: 'Offline' };
		const label = labels[profile] || profile;
		log(`📶 <span style="color: #F8BC3B;">Network throttled to ${label}</span>`);
	} catch (error) {
		log(`⚠️ Network throttling failed: ${error.message}`);
	}
}

/**
 * Enable Chaos Mode: randomly sabotage POST/PUT/PATCH requests and intercept fetch/XHR
 * @param {Page} page - Puppeteer page object
 * @param {number} failRate - Probability (0-1) that a data request will be sabotaged
 * @param {Function} log - Logging function
 */
export async function enableChaosMode(page, failRate = 0.15, log = console.log) {
	try {
		await page.setRequestInterception(true);
		page.on('request', request => {
			const isMixpanelRequest = request.url().includes('mixpanel') || request.url().includes('mxpnl') || request.url().includes('express-proxy-lmozz6xkha-uc.a.run.app');
			const isDataRequest =
				!isMixpanelRequest &&
				['POST', 'PUT', 'PATCH'].includes(request.method()) &&
				['xhr', 'fetch'].includes(request.resourceType());

			if (isDataRequest && Math.random() < failRate) {
				const statusCode = Math.random() < 0.5 ? 500 : 503;
				const errorMsg = statusCode === 500 ? 'Internal Server Error' : 'Service Unavailable';
				log(`😈 <span style="color: #CC332B;">Chaos Meeple sabotaged:</span> ${request.method()} ${request.url().substring(0, 80)}`);
				request.respond({
					status: statusCode,
					contentType: 'application/json',
					body: JSON.stringify({ error: `Simulated ${errorMsg}` })
				});
			} else {
				request.continue();
			}
		});
		log(`😈 <span style="color: #FF7557;">Chaos Mode enabled</span> (${(failRate * 100).toFixed(0)}% fail rate on data requests)`);
	} catch (error) {
		log(`⚠️ Chaos mode setup failed: ${error.message}`);
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

		// CRITICAL: Enable ALL security bypasses at page level immediately
		await page.setBypassCSP(true);

		// Disable JavaScript domain security
		await page.evaluateOnNewDocument(() => {
			// Override document.domain to allow cross-origin access
			try {
				Object.defineProperty(document, 'domain', {
					get() {
						return window.location.hostname;
					},
					set(val) {
						return val;
					},
					configurable: true
				});
			} catch (e) {}
		});

		// Set random realistic user agent
		const randomAgent = agents[Math.floor(Math.random() * agents.length)];
		const { userAgent, ...headers } = randomAgent;
		await page.setUserAgent(userAgent);

		const realisticHeaders = {
			'Accept-Language': 'en-US,en;q=0.9',
			'Accept-Encoding': 'gzip, deflate, br',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
			'Cache-Control': 'no-cache',
			Pragma: 'no-cache',
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
		// await page.evaluateOnNewDocument(() => {
		// 	window.mouseX = 0;
		// 	window.mouseY = 0;
		// });

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
export async function navigateToUrl(page, url, log = console.log, opts = {}) {
	const maxRetries = 2;
	const slowNetwork = opts.networkProfile && opts.networkProfile !== 'fast';
	let lastError;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			log(`🌐 Navigating to: ${url}${attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : ''}`);

			// Try different wait strategies based on attempt
			const waitStrategies = ['networkidle2', 'domcontentloaded', 'load'];
			const waitUntil = waitStrategies[Math.min(attempt - 1, waitStrategies.length - 1)];

			const response = await page.goto(url, {
				// @ts-ignore
				waitUntil,
				timeout: slowNetwork ? 90000 : 30000
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
			if (
				error.message.includes('net::ERR_INVALID_ARGUMENT') ||
				error.message.includes('net::ERR_FAILED') ||
				error.message.includes('Navigation timeout')
			) {
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
