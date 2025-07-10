import dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import { tmpdir } from 'os';
import pLimit from 'p-limit';
import puppeteer from 'puppeteer';
import u from 'ak-tools';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);
const { NODE_ENV = "" } = process.env;
let { MIXPANEL_TOKEN = "" } = process.env;
if (!NODE_ENV) throw new Error("NODE_ENV is required");
let TEMP_DIR = NODE_ENV === 'dev' ? './tmp' : tmpdir();
TEMP_DIR = path.resolve(TEMP_DIR);
const agents = await u.load('./agents.json', true);
import { log as globalLog } from './logger.js';
import injectMixpanel from './utils/injectMixpanel.js';

/**
 * @typedef PARAMS
 * @property {string} url URL to simulate
 * @property {number} users Number of users to simulate
 * @property {number} concurrency Number of users to simulate concurrently
 * @property {boolean} headless Whether to run headless or not
 * @property {boolean} inject Whether to inject mixpanel or not
 * @property {boolean} past Whether to simulate time in past
 * @property {string} token Mixpanel token
 * @property {number} maxActions Maximum number of actions per user session
 */

/**
 * Main function to simulate user behavior.
 * @param {PARAMS} PARAMS 
 * @param {Function} logFunction - Optional logging function for real-time updates
 */
export default async function main(PARAMS = {}, logFunction = console.log) {
	const log = logFunction;
	let { url = "https://ak--47.github.io/fixpanel/",
		users = 10,
		concurrency = 5,
		headless = true,
		inject = true,
		past = false,
		token = "",
		maxActions = null
	} = PARAMS;
	if (url === "fixpanel") url = `https://ak--47.github.io/fixpanel/`;
	const limit = pLimit(concurrency);
	if (users > 25) users = 25;
	if (concurrency > 10) concurrency = 10;
	if (token) MIXPANEL_TOKEN = token;
	if (NODE_ENV === 'production') headless = true; // Always headless in production

	const userPromises = Array.from({ length: users }, (_, i) => {

		return limit(() => {
			return new Promise(async (resolve) => {
				try {
					// Generate unique username for this meeple
					const usersHandle = u.makeName(3, "-");
					globalLog(`🚀 <span style="color: #7856FF; font-weight: bold;">Spawning ${usersHandle}</span> (${i + 1}/${users}) on <span style="color: #80E1D9;">${url}</span>...`, usersHandle);

					const result = await simulateUser(url, headless, inject, past, maxActions, usersHandle);

					if (result && !result.error && !result.timedOut) {
						globalLog(`✅ <span style="color: #07B096;">${usersHandle} completed!</span> Session data captured.`, usersHandle);
					} else if (result && result.timedOut) {
						globalLog(`⏰ <span style="color: #F8BC3B;">${usersHandle} timed out</span> - but simulation continues`, usersHandle);
					} else {
						globalLog(`⚠️ <span style="color: #F8BC3B;">${usersHandle} completed with issues</span> - but simulation continues`, usersHandle);
					}

					resolve(result || { error: 'Unknown error', user: i + 1 });
				}
				catch (e) {
					const errorMsg = e.message || 'Unknown error';
					globalLog(`❌ <span style="color: #CC332B;">${usersHandle} failed:</span> ${errorMsg} - <span style="color: #888;">continuing with other users</span>`, usersHandle);
					resolve({ error: errorMsg, user: i + 1, crashed: true });
				}
			});
		});
	});

	// Use Promise.allSettled instead of Promise.all to prevent one failure from stopping everything
	const results = await Promise.allSettled(userPromises);

	// Process results and provide summary
	const successful = results.filter(r => r.status === 'fulfilled' && r.value && !r.value.error && !r.value.crashed).length;
	const timedOut = results.filter(r => r.status === 'fulfilled' && r.value && r.value.timedOut).length;
	const crashed = results.filter(r => r.status === 'fulfilled' && r.value && r.value.crashed).length;
	const failed = results.filter(r => r.status === 'rejected').length;

	globalLog(`📊 <span style="color: #7856FF;">Simulation Summary:</span> ${successful}/${users} successful, ${timedOut} timed out, ${crashed} crashed, ${failed} rejected`);

	// Return the actual results, filtering out any undefined values
	const finalResults = results.map(r => {
		if (r.status === 'fulfilled') {
			return r.value;
		} else {
			globalLog(`⚠️ <span style="color: #CC332B;">Promise rejected:</span> ${r.reason?.message || 'Unknown error'}`);
			return { error: r.reason?.message || 'Promise rejected', crashed: true };
		}
	}).filter(Boolean);

	return finalResults;
}

/**
 * Simulates a single user session with random actions, with a timeout to prevent hangs.
 * @param {string} url - The URL to visit.
 * @param {boolean} headless - Whether to run the browser headlessly.
 * @param {boolean} inject - Whether to inject Mixpanel into the page.
 * @param {boolean} past - Whether to simulate time in past.
 * @param {number} maxActions - Maximum number of actions to perform (optional).
 */
export async function simulateUser(url, headless = true, inject = true, past = false, maxActions = null, usersHandle = null) {
	// Create user-specific logger that automatically includes the usersHandle
	const log = usersHandle ? (message) => globalLog(message, usersHandle) : globalLog;
	
	const totalTimeout = 10 * 60 * 1000;  // max 10 min / user
	const pageTimeout = 60 * 1000; // 1 minutes
	const timeoutPromise = new Promise((resolve) =>
		setTimeout(() => {
			resolve('timeout');
		}, totalTimeout)
	);
	let browser;

	// Define the user session simulation promise
	const simulationPromise = (async () => {
		browser = await puppeteer.launch({
			headless, args: [
				'--disable-web-security',
				'--disable-features=VizDisplayCompositor',
				'--disable-features=IsolateOrigins,site-per-process,TrustedDOMTypes',
				'--disable-site-isolation-trials',
				'--disable-blink-features=AutomationControlled',
				'--disable-client-side-phishing-detection',
				'--disable-sync',
				'--disable-background-networking',
				'--disable-background-timer-throttling',
				'--disable-renderer-backgrounding',
				'--disable-backgrounding-occluded-windows',
				'--disable-ipc-flooding-protection',
				'--disable-hang-monitor',
				'--disable-prompt-on-repost',
				'--disable-domain-reliability',
				'--disable-component-extensions-with-background-pages',
				'--disable-default-apps',
				'--disable-extensions',
				'--disable-popup-blocking',
				'--allow-running-insecure-content',
				'--allow-insecure-localhost',
				'--ignore-certificate-errors',
				'--ignore-ssl-errors',
				'--ignore-certificate-errors-spki-list',
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-accelerated-2d-canvas',
				'--no-first-run',
				'--no-zygote',
				'--disable-gpu'
			],
			timeout: pageTimeout, // Browser launch timeout
			waitForInitialPage: true,
		});
		const page = (await browser.pages())[0];
		await page.setDefaultTimeout(pageTimeout);
		await page.setDefaultNavigationTimeout(pageTimeout);
		await relaxCSP(page, log);
		await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true });

		// Spoof user agent for realistic browser fingerprinting
		await spoofAgent(page, log);

		// Spoof time if requested
		if (past) await forceSpoofTimeInBrowser(page, log);
		if (inject)

			// Validate URL before navigation
			try {
				new URL(url); // This will throw if URL is invalid
			} catch (urlError) {
				throw new Error(`Invalid URL provided: ${url} - ${urlError.message}`);
			}

		log(`📍 <span style="color: #F8BC3B;">Navigating</span> to <span style="color: #80E1D9;">${url}</span>...`);
		try {
			await page.goto(url);
			await u.sleep(u.rand(42, 420)); // Random sleep to simulate human behavior


		} catch (navError) {
			// Provide more specific error information
			throw new Error(`Navigation failed to ${url}: ${navError.message}`);
		}
		log(`  └─ <span style="color: #07B096;">Page loaded successfully</span>`);
		await u.sleep(u.rand(42, 420)); // Random sleep to simulate human behavior
		const persona = selectPersona(log);
		log(`🎭 <span style="color: #7856FF;">Persona assigned:</span> <span style="color: #80E1D9; font-weight: bold;">${persona}</span>`);

		try {
			const actions = await simulateUserSession(browser, page, persona, inject, maxActions, usersHandle);
			await browser.close();
			return actions;
		}
		catch (error) {
			await browser.close();
			return { error: error.message, timedOut: false };
		}
	})();

	// Use Promise.race to terminate if simulation takes too long
	try {
		return await Promise.race([simulationPromise, timeoutPromise]);
	} catch (error) {
		// Handle timeout error (close browser if not already closed)
		const errorMsg = error.message || 'Unknown error';
		log(`🚨 <span style="color: #CC332B;">User simulation error:</span> ${errorMsg}`);

		try {
			if (browser) {
				await browser.close();
			}
		} catch (closeError) {
			log(`⚠️ <span style="color: #F8BC3B;">Browser close error:</span> ${closeError.message}`);
		}

		if (NODE_ENV === "dev") log("simulateUser Error:", error);
		return { error: errorMsg, timedOut: error.message?.includes('timeout') || false };
	}
}

async function retry(operation, maxRetries = 3, delay = 1000) {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await operation();
		} catch (error) {
			if (i === maxRetries - 1) throw error;
			await u.sleep(delay);
		}
	}
}

 /**
 * @param  {import('puppeteer').Page} page
 */
export async function spoofAgent(page, log = globalLog) {
	const agent = u.shuffle(agents).slice().pop();
	const { userAgent, ...headers } = agent;
	const set = await setUserAgent(page, userAgent, headers, log);
	log(`    │  └─ 🥸 <span style="color: #07B096;">User agent: ${userAgent}</span>`);
	return set;
}

/**
 * Set the user agent and additional headers for the page.
 * @param  {import('puppeteer').Page} page
 * @param  {string} userAgent
 * @param  {Object} additionalHeaders
 */
export async function setUserAgent(page, userAgent, additionalHeaders = {}, log = globalLog) {
	if (!page) throw new Error("Browser not initialized");

	await page.setUserAgent(userAgent);

	if (Object.keys(additionalHeaders).length > 0) {
		await page.setExtraHTTPHeaders(additionalHeaders);
	}

	return { userAgent, additionalHeaders };
}

// TIME SPOOFING
export function getRandomTimestampWithinLast5Days(log = globalLog) {
	const now = Date.now();
	const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000); // 5 days ago in milliseconds
	const timeChosen = Math.floor(Math.random() * (now - fiveDaysAgo)) + fiveDaysAgo;
	log(`🕰️ Spoofed time: ${dayjs(timeChosen).toISOString()}`);
	return timeChosen;
}

// Function to inject and execute time spoofing
export async function forceSpoofTimeInBrowser(page, log = globalLog) {
	const spoofedTimestamp = getRandomTimestampWithinLast5Days(log);
	const spoofTimeFunctionString = spoofTime.toString();
	log(`	├─ 🕰️ <span style="color: #F8BC3B;">Spoofing time to: ${dayjs(spoofedTimestamp).toISOString()}</span>`);

	await retry(async () => {
		await page.evaluateOnNewDocument((timestamp, spoofTimeFn) => {
			const injectedFunction = new Function(`return (${spoofTimeFn})`)();
			injectedFunction(timestamp);
		}, spoofedTimestamp, spoofTimeFunctionString);
	});
}

// The time spoofing function that will be serialized and injected
function spoofTime(startTimestamp) {
	function DO_TIME_SPOOF() {
		const actualDate = Date;
		const actualNow = Date.now;
		const actualPerformanceNow = performance.now;

		// Calculate the offset
		const offset = actualNow() - startTimestamp;

		// Override Date constructor
		function FakeDate(...args) {
			if (args.length === 0) {
				return new actualDate(actualNow() - offset);
			}
			return new actualDate(...args);
		}

		// Copy static methods
		FakeDate.now = () => actualNow() - offset;
		FakeDate.parse = actualDate.parse;
		FakeDate.UTC = actualDate.UTC;

		// Override instance methods
		FakeDate.prototype = actualDate.prototype;

		// Override Date.now
		Date.now = () => actualNow() - offset;

		// Override performance.now
		performance.now = function () {
			const timeSincePageLoad = actualPerformanceNow.call(performance);
			return (actualNow() - offset) - (Date.now() - timeSincePageLoad);
		};

		// Replace window Date
		window.Date = FakeDate;

		return { spoof: true };
	}
	return DO_TIME_SPOOF();
}

async function jamMixpanelIntoBrowser(page, username, log = globalLog) {
	await retry(async () => {
		// Enhanced injection with multiple fallback strategies
		const injectMixpanelString = injectMixpanel.toString();

		await page.evaluate((MIXPANEL_TOKEN, userId, injectMixpanelFn) => {
			try {
				// Strategy 1: Direct function injection
				const injectedFunction = new Function(`return (${injectMixpanelFn})`)();
				injectedFunction(MIXPANEL_TOKEN, userId);

				// Strategy 2: Force override any existing CSP violations
				if (window.console && window.console.error) {
					const originalConsoleError = window.console.error;
					window.console.error = function (...args) {
						// Suppress CSP violation errors for our injection
						const message = args.join(' ');
						if (message.includes('Content Security Policy') ||
							message.includes('CSP') ||
							message.includes('unsafe-eval') ||
							message.includes('unsafe-inline')) {
							return; // Suppress CSP errors
						}
						return originalConsoleError.apply(this, args);
					};
				}

				// Strategy 3: Ensure script execution even if initially blocked
				setTimeout(() => {
					if (!window.MIXPANEL_WAS_INJECTED || !window.mixpanel) {
						console.log('[NPC] Retrying Mixpanel injection...');
						try {
							const retryFunction = new Function(`return (${injectMixpanelFn})`)();
							retryFunction(MIXPANEL_TOKEN, userId);
						} catch (retryError) {
							console.warn('[NPC] Retry injection failed:', retryError);
						}
					}
				}, 500);

			} catch (error) {
				console.error('[NPC] Mixpanel injection error:', error);

				// Strategy 4: Fallback injection using createElement
				try {
					const script = document.createElement('script');
					script.textContent = `(${injectMixpanelFn})('${MIXPANEL_TOKEN}', '${userId}');`;
					(document.head || document.documentElement).appendChild(script);
				} catch (fallbackError) {
					console.error('[NPC] Fallback injection failed:', fallbackError);
				}
			}
		}, MIXPANEL_TOKEN, username, injectMixpanelString);
	}, 3, 1000); // Retry up to 3 times with 1 second delay

	return true;
}

 /**
 * Fast CSP check and relaxation - no-op if already relaxed
 * @param  {import('puppeteer').Page} page
 */
async function ensureCSPRelaxed(page, log = globalLog) {
	try {
		// Quick check if CSP is already relaxed
		const cspStatus = await page.evaluate(() => {
			return {
				relaxed: !!(window?.CSP_WAS_RELAXED),
				evalWorking: !!(window?.CSP_EVAL_WORKING),
				timestamp: window?.CSP_RELAXED_TIMESTAMP || 0
			};
		});

		// If CSP is already relaxed and working, no-op (no logging)
		if (cspStatus.relaxed && cspStatus.evalWorking) {
			return true;
		}

		// Log when we actually need to apply CSP relaxation
		log(`    ├─ 🛡️ <span style="color: #F8BC3B;">CSP needs relaxation - applying...</span>`);
		const result = await relaxCSP(page, log);
		if (result) {
			log(`    │  └─ ✅ <span style="color: #07B096;">CSP relaxation applied</span>`);
		}
		return result;
	} catch (e) {
		return false;
	}
}

/**
 * Fast Mixpanel check and injection - no-op if already injected
 * @param  {import('puppeteer').Page} page
 * @param  {string} username
 */
async function ensureMixpanelInjected(page, username, log = globalLog) {
	try {
		// Quick check if Mixpanel is already injected and working
		const mixpanelStatus = await page.evaluate(() => {
			return {
				injected: !!(window?.MIXPANEL_WAS_INJECTED),
				hasSDK: !!(window?.mixpanel),
				working: !!(window?.mixpanel && window?.MIXPANEL_WAS_INJECTED)
			};
		});

		// If Mixpanel is already injected and working, no-op (no logging)
		if (mixpanelStatus.working) {
			return true;
		}

		// Log when we actually need to inject/re-inject Mixpanel
		log(`    ├─ 💉 <span style="color: #F8BC3B;">Mixpanel needs injection - applying...</span>`);
		const result = await jamMixpanelIntoBrowser(page, username, log);
		if (result) {
			log(`    │  └─ ✅ <span style="color: #07B096;">Mixpanel injected successfully</span>`);
		}
		return result;
	} catch (e) {
		return false;
	}
}


/**
 * Comprehensive CSP and security bypass for reliable script injection
 * @param  {import('puppeteer').Page} page
 */
async function relaxCSP(page, log = globalLog) {
	try {
		// 1. Enable CSP bypass at the browser level
		await page.setBypassCSP(true);

		// 2. Set up request interception to modify security headers
		await page.setRequestInterception(true);
		page.on('request', request => {
			try {
				const headers = { ...request.headers() };

				// Remove all CSP-related headers
				delete headers['content-security-policy'];
				delete headers['content-security-policy-report-only'];
				delete headers['x-content-security-policy'];
				delete headers['x-webkit-csp'];

				// Remove other restrictive headers
				delete headers['x-frame-options'];
				delete headers['x-xss-protection'];
				delete headers['referrer-policy'];

				// Add permissive CSP that allows everything
				headers['content-security-policy'] = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';";

				if (!request.isInterceptResolutionHandled()) request.continue({ headers });
			} catch (e) {
				// If request modification fails, continue without headers modification
				// Only continue if request hasn't been handled yet
				if (!request.isInterceptResolutionHandled()) {
					try {
						request.continue();
					} catch (continueError) {
						// Request already handled by another listener, ignore
					}
				}
			}
		});

		// 3. Inject CSP bypass directly into page context before any scripts load
		await page.evaluateOnNewDocument(() => {
			// Set flag to indicate CSP relaxation was attempted
			window.CSP_WAS_RELAXED = true;
			window.CSP_RELAXED_TIMESTAMP = Date.now();

			// Override CSP enforcement in the page context
			if (typeof document !== 'undefined') {
				// Remove CSP meta tags
				const observer = new MutationObserver((mutations) => {
					mutations.forEach((mutation) => {
						mutation.addedNodes.forEach((node) => {
							if (node.tagName === 'META' &&
								(node.getAttribute('http-equiv') === 'Content-Security-Policy' ||
									node.getAttribute('http-equiv') === 'content-security-policy')) {
								node.remove();
								console.log('[NPC] Removed CSP meta tag:', node.outerHTML);
							}
						});
					});
				});
				observer.observe(document, { childList: true, subtree: true });

				// Override any existing CSP enforcement
				document.addEventListener('DOMContentLoaded', () => {
					const cspMetas = document.querySelectorAll('meta[http-equiv*="content-security-policy" i]');
					cspMetas.forEach(meta => {
						console.log('[NPC] Removing CSP meta on DOMContentLoaded:', meta.outerHTML);
						meta.remove();
					});

					// Confirm CSP relaxation is still active
					window.CSP_WAS_RELAXED = true;
					window.CSP_RELAXED_TIMESTAMP = Date.now();
				});
			}

			// Override eval restrictions
			window.originalEval = window.eval;

			// Test CSP relaxation by attempting eval
			try {
				eval('window.CSP_EVAL_TEST = true;');
				window.CSP_EVAL_WORKING = true;
			} catch (e) {
				window.CSP_EVAL_WORKING = false;
				console.warn('[NPC] CSP eval restriction still active:', e);
			}

			// Ensure fetch and XMLHttpRequest work without restrictions
			if (typeof fetch !== 'undefined') {
				const originalFetch = window.fetch;
				window.fetch = function (...args) {
					return originalFetch.apply(this, args).catch(err => {
						// Fallback for blocked requests
						console.warn('Fetch blocked, attempting proxy:', err);
						return originalFetch.apply(this, args);
					});
				};
			}
		});

		// 4. Disable additional security features that might interfere
		await page.setJavaScriptEnabled(true);

		// 5. Set permissive permissions for all origins (only for valid origins)
		const context = page.browserContext();
		const currentUrl = page.url();

		// Only set permissions for valid, non-opaque origins
		if (currentUrl && !currentUrl.startsWith('about:') && !currentUrl.startsWith('data:') && !currentUrl.startsWith('chrome:')) {
			try {
				await context.overridePermissions(currentUrl, [
					'geolocation',
					'notifications',
					'camera',
					'microphone',
					'background-sync',
					'ambient-light-sensor',
					'accelerometer',
					'gyroscope',
					'magnetometer',
					'accessibility-events',
					'clipboard-read',
					'clipboard-write',
					'payment-handler'
				]);
			} catch (permError) {
				// Permission override failed for this origin, continue anyway
				console.warn('Permission override failed for origin:', currentUrl, permError.message);
			}
		}

	} catch (e) {
		console.warn('CSP relaxation failed:', e.message);
		// Continue anyway - some restrictions are better than total failure
	}
}

/**
 * Fast combined check and application of CSP relaxation and Mixpanel injection
 * Only does work if needed - no-op when already applied
 * @param  {import('puppeteer').Page} page
 * @param  {string} username 
 * @param  {boolean} inject - Whether to inject Mixpanel
 */
async function ensurePageSetup(page, username, inject = true, log = globalLog) {
	try {
		// Always ensure CSP is relaxed (very fast if already done)
		await ensureCSPRelaxed(page, log);

		// Only inject Mixpanel if requested (very fast if already done)
		if (inject) {
			await ensureMixpanelInjected(page, username, log);
		}

		return true;
	} catch (e) {
		return false;
	}
}

/**
 * Simulates a user session on the page, following a persona-based action sequence.
 * @param {import('puppeteer').Browser} browser - Puppeteer browser object.
 * @param {import('puppeteer').Page} page - Puppeteer page object.
 * @param {string} persona - User persona to simulate.
 * @param {boolean} inject - Whether to inject Mixpanel into the page.
 * @param {number} maxActions - Maximum number of actions to perform (optional).
 */
export async function simulateUserSession(browser, page, persona, inject = true, maxActions = null, usersHandle = null) {
	// If no handle provided, generate one (for backward compatibility)
	if (!usersHandle) {
		usersHandle = u.makeName(4, "-");
	}

	// Create user-specific logger that automatically includes the usersHandle
	const log = (message) => globalLog(message, usersHandle);

	// Enhanced logging with user context
	log(`👤 <span style="color: #7856FF; font-weight: bold;">${usersHandle}</span> joined as <span style="color: #80E1D9;">${persona}</span> persona`);

	// Initial page setup - CSP relaxation and Mixpanel injection
	log(`  └─ 🛠️ Setting up page environment...`);
	await ensurePageSetup(page, usersHandle, inject, log);

	if (inject) {
		// Verify injection was successful
		const injectionSuccess = await page.evaluate(() => {
			return !!(window.mixpanel && window.MIXPANEL_WAS_INJECTED);
		});

		if (injectionSuccess) {
			log(`  │  └─ ✅ <span style="color: #07B096;">Mixpanel loaded successfully</span>`);
		} else {
			log(`  │  └─ ⚠️ <span style="color: #F8BC3B;">Mixpanel injection may have failed</span>`);
		}
	} else {
		log(`  │  └─ ⏭️ Skipping Mixpanel injection`);
	}

	// Store initial domain and page target ID
	const initialUrl = await page.url();
	const initialDomain = new URL(initialUrl).hostname;
	const initialTopLevelDomain = extractTopLevelDomain(initialDomain);

	// Log warning if we're still on about:blank (should be rare with improved navigation)
	if (initialUrl.startsWith('about:')) {
		log(`  ├─ ⚠️ <span style="color: #F8BC3B;">Page still on about:blank, will proceed without domain monitoring</span>`);
		// Continue without domain monitoring rather than exiting early
	}
	const mainPageTarget = await page.target();
	const mainPageId = mainPageTarget._targetId;

	// Simplified domain monitoring - just track navigation attempts
	let consecutiveNavigationAttempts = 0;
	const MAX_NAVIGATION_ATTEMPTS = 5;

	// Function to handle domain navigation checks and about:blank recovery
	async function checkDomainNavigation() {
		try {
			const currentUrl = await page.url();

			// Handle about:blank pages - these need immediate recovery
			if (currentUrl && currentUrl.startsWith('about:blank')) {
				log(`    ├─ 🔄 <span style="color: #F8BC3B;">Detected about:blank page, recovering...</span>`);

				// Try to go back first
				try {
					const canGoBack = await page.evaluate(() => window.history.length > 1);
					if (canGoBack) {
						await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
						const recoveredUrl = await page.url();
						if (!recoveredUrl.startsWith('about:blank')) {
							log(`    │  └─ ✅ <span style="color: #07B096;">Recovered via back navigation</span>`);
							return;
						}
					}
				} catch (backError) {
					// Back navigation failed, try forward navigation
				}

				// If back navigation failed, try going forward
				try {
					const canGoForward = await page.evaluate(() => window.history.length > 1);
					if (canGoForward) {
						await page.goForward({ waitUntil: 'domcontentloaded', timeout: 5000 });
						const recoveredUrl = await page.url();
						if (!recoveredUrl.startsWith('about:blank')) {
							log(`    │  └─ ✅ <span style="color: #07B096;">Recovered via forward navigation</span>`);
							return;
						}
					}
				} catch (forwardError) {
					// Forward navigation failed, fall back to direct navigation
				}

				// If both back and forward failed, go directly to original URL
				await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
				log(`    │  └─ ✅ <span style="color: #07B096;">Recovered via direct navigation to original URL</span>`);
				return;
			}

			// Skip other special URLs
			if (!currentUrl || currentUrl.startsWith('chrome://') || currentUrl.startsWith('data:')) {
				return;
			}

			const newDomain = new URL(currentUrl).hostname;
			const newTopLevelDomain = extractTopLevelDomain(newDomain);

			// Check for top-level domain changes (should navigate back)
			if (newTopLevelDomain !== initialTopLevelDomain) {
				consecutiveNavigationAttempts++;

				if (consecutiveNavigationAttempts >= MAX_NAVIGATION_ATTEMPTS) {
					// Return to original URL
					await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
					consecutiveNavigationAttempts = 0;
				} else {
					// Try to go back
					await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
				}
			} else if (consecutiveNavigationAttempts > 0) {
				consecutiveNavigationAttempts = 0; // Reset when back on original domain
			}
		} catch (e) {
			// Ignore navigation errors
		}
	}

	// Set up tab listener to automatically close new tabs
	browser.on('targetcreated', async (target) => {
		if (target._targetId !== mainPageId) {
			const newPage = await target.page();
			if (newPage) {
				log(`🚫 Closing new tab: ${newPage.url()}`);
				await newPage.close();
			}
		}
	});

	// Navigation monitoring is now handled by the polling mechanism above

	const actionSequence = generatePersonaActionSequence(persona, maxActions);
	const numActions = actionSequence.length;
	const actionResults = [];

	log(`  ├─ 🎬 <span style="color: #7856FF;">Action sequence generated:</span> ${numActions} actions planned for ${persona} persona`);

	// Track action history for context-aware decisions
	const actionHistory = [];

	// Circuit breaker to stop user if too many consecutive failures
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = 5;

	// Identify hot zones for coordinated user behavior (always enabled for better heatmap data)
	let hotZones = [];
	try {
		log(`  ├─ 🔍 <span style="color: #7856FF;">Indexing hot zones...</span> Analyzing page elements for optimal targeting`);
		hotZones = await identifyHotZones(page);
		log(`  │  └─ 🎯 <span style="color: #07B096;">Hot zones indexed:</span> Found ${hotZones.length}/25 prominent elements for realistic interactions & <span style="color: #4ECDC4;">enhanced heatmap coverage</span>`);
	} catch (e) {
		log(`  │  └─ ⚠️ <span style="color: #F8BC3B;">Hot zone indexing failed:</span> ${e.message} - using fallback targeting`);
	}

	// Initialize hover history for return visit behavior
	const hoverHistory = [];



	// Action emoji mapping
	const actionEmojis = {
		click: '👆',
		scroll: '📜',
		mouse: '🖱️',
		wait: '⏸️',
		hover: '🎯',
		form: '📝',
		back: '⬅️'
	};

	log(`  ├─ 🚀 <span style="color: #7856FF;">Starting action execution loop...</span>`);

	for (const [index, originalAction] of actionSequence.entries()) {
		// Apply context-aware action selection
		const action = getContextAwareAction(actionHistory, originalAction, log);

		const emoji = actionEmojis[action] || '🎯';
		const contextNote = action !== originalAction ? ` <span style="color: #888;">(adapted from ${originalAction})</span>` : '';
		log(`  ├─ ${emoji} <span style="color: #FF7557;">Action ${index + 1}/${numActions}</span>: ${action}${contextNote}`);

		let funcToPerform;
		switch (action) {
			case "click":
				funcToPerform = () => clickStuff(page, hotZones, log);
				break;
			case "scroll":
				funcToPerform = () => intelligentScroll(page, hotZones, log);
				break;
			case "mouse":
				funcToPerform = () => naturalMouseMovement(page, hotZones, log);
				break;
			case "hover":
				funcToPerform = () => hoverOverElements(page, hotZones, persona, hoverHistory, log);
				break;
			case "form":
				funcToPerform = () => interactWithForms(page, log);
				break;
			case "back":
				funcToPerform = () => navigateBack(page, log);
				break;
			case "forward":
				funcToPerform = () => navigateForward(page, log);
				break;
			default:
				funcToPerform = () => shortPause(log);
				break;
		}

		if (funcToPerform) {
			// Ensure page setup before each action (fast no-op if already done)
			await ensurePageSetup(page, usersHandle, inject, log);

			// Check for domain navigation and handle if needed
			const previousUrl = await page.url();
			await checkDomainNavigation();
			const currentUrl = await page.url();

			// Re-identify hotzones if the URL changed (new page/navigation)
			if (previousUrl !== currentUrl) {
				try {
					log(`    ├─ 🔍 <span style="color: #7856FF;">Re-indexing hot zones...</span> New page detected, analyzing elements`);
					const newHotZones = await identifyHotZones(page);
					hotZones = newHotZones;
					log(`    │  └─ 🎯 <span style="color: #07B096;">Hot zones re-indexed:</span> Found ${hotZones.length} elements on new page`);
				} catch (e) {
					log(`    │  └─ ⚠️ <span style="color: #F8BC3B;">Hot zone re-indexing failed:</span> ${e.message} - using existing zones`);
				}
			}

			try {
				// Add timeout for individual actions to prevent hanging
				const actionTimeout = new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Action timeout')), 30000) // 30 second timeout per action
				);

				const result = await Promise.race([
					funcToPerform(page),
					actionTimeout
				]);

				if (result) {
					actionResults.push(action);
					actionHistory.push(action);
					consecutiveFailures = 0; // Reset failure counter on success
				} else {
					// Action failed, still add to history for context
					actionHistory.push(`${action}_failed`);
					consecutiveFailures++;
					log(`    └─ ⚠️ <span style="color: #F8BC3B;">Action ${action} failed:</span> <span style="color: #888;">no result returned (${consecutiveFailures}/${maxConsecutiveFailures})</span>`);
				}
			}
			catch (e) {
				// Log error but continue with simulation
				const errorMsg = e.message || 'unknown error';
				consecutiveFailures++;
				log(`    └─ ⚠️ <span style="color: #F8BC3B;">Action ${action} failed:</span> <span style="color: #888;">${errorMsg} (${consecutiveFailures}/${maxConsecutiveFailures})</span>`);
				actionHistory.push(`${action}_error`);

				// Check if page is still responsive after error
				try {
					await page.evaluate(() => document.readyState);
				} catch (pageError) {
					log(`    └─ 🚨 <span style="color: #CC332B;">Page unresponsive after ${action}</span> - stopping this user`);
					break; // Exit this user's action loop, but don't crash the whole simulation
				}
			}
		}

		// Circuit breaker: stop user if too many consecutive failures
		if (consecutiveFailures >= maxConsecutiveFailures) {
			log(`    └─ 🛑 <span style="color: #CC332B;">Too many consecutive failures</span> - stopping this user early`);
			break;
		}

		// More realistic pause between actions (humans need time to think/process)
		await u.sleep(u.rand(500, 2000));
	}

	// No cleanup needed - monitoring is now per-action

	log(`  └─ ✅ <span style="color: #07B096; font-weight: bold;">${usersHandle}</span> completed session: <span style="color: #888;">${actionResults.length}/${numActions} actions successful</span>`);

	return {
		persona: personas[persona],
		personaLabel: persona,
		actionSequence,
		actionResults,
		userName: usersHandle
	};
}

// Realistic user personas optimized for comprehensive engagement
const personas = {
	// Power users - confident, fast, goal-oriented
	powerUser: { scroll: 0.3, mouse: 0.1, click: 0.9, wait: 0.1, hover: 0.2, form: 0.3, back: 0.1, forward: 0.1 },
	taskFocused: { scroll: 0.2, mouse: 0.1, click: 0.8, wait: 0.2, hover: 0.1, form: 0.5, back: 0.2, forward: 0.1 },

	// Shopping/conversion oriented
	shopper: { scroll: 0.4, mouse: 0.2, click: 0.7, wait: 0.3, hover: 0.4, form: 0.4, back: 0.3, forward: 0.1 },
	comparison: { scroll: 0.5, mouse: 0.3, click: 0.6, wait: 0.4, hover: 0.5, form: 0.3, back: 0.4, forward: 0.1 },

	// Content consumption
	reader: { scroll: 0.6, mouse: 0.2, click: 0.4, wait: 0.5, hover: 0.3, form: 0.2, back: 0.2, forward: 0.1 },
	skimmer: { scroll: 0.7, mouse: 0.1, click: 0.3, wait: 0.2, hover: 0.2, form: 0.1, back: 0.3, forward: 0.1 },

	// Exploration patterns
	explorer: { scroll: 0.4, mouse: 0.3, click: 0.6, wait: 0.3, hover: 0.4, form: 0.3, back: 0.2, forward: 0.1 },
	discoverer: { scroll: 0.3, mouse: 0.4, click: 0.7, wait: 0.2, hover: 0.6, form: 0.4, back: 0.1, forward: 0.1 },

	// Mobile-like behavior (even on desktop)
	mobileHabits: { scroll: 0.8, mouse: 0.1, click: 0.6, wait: 0.2, hover: 0.1, form: 0.3, back: 0.2, forward: 0.1 },

	// Efficient users
	decisive: { scroll: 0.2, mouse: 0.1, click: 0.9, wait: 0.1, hover: 0.1, form: 0.4, back: 0.1, forward: 0.1 },

	// Deep engagement patterns
	researcher: { scroll: 0.7, mouse: 0.4, click: 0.5, wait: 0.6, hover: 0.5, form: 0.4, back: 0.1, forward: 0.1 },
	methodical: { scroll: 0.5, mouse: 0.3, click: 0.6, wait: 0.5, hover: 0.4, form: 0.5, back: 0.2, forward: 0.1 },

	minMaxer: { scroll: 0.3, mouse: 0.7, click: 0.8, wait: 0.2, hover: 0.3, form: 0.2, back: 0.1, forward: 0.1 }, // Optimize every action
	rolePlayer: { scroll: 0.6, mouse: 0.4, click: 0.4, wait: 0.6, hover: 0.5, form: 0.3, back: 0.2, forward: 0.1 }, // Immersive experience
	murderHobo: { scroll: 0.1, mouse: 0.1, click: 0.99, wait: 0.01, hover: 0.1, form: 0.1, back: 0.1, forward: 0.1 }, // Click all the things!
	ruleSlawyer: { scroll: 0.9, mouse: 0.6, click: 0.5, wait: 0.7, hover: 0.6, form: 0.6, back: 0.3, forward: 0.1 }, // Read everything twice

};

/**
 * Selects a random persona.
 */
export function selectPersona(log = globalLog) {
	const personaKeys = Object.keys(personas);
	return personaKeys[Math.floor(Math.random() * personaKeys.length)];
}

/**
 * Context-aware action selection based on recent actions
 * @param {Array} actionHistory - Recent actions performed
 * @param {string} suggestedAction - Action suggested by persona weighting
 * @returns {string} - The action to perform (may override suggestion)
 */
export function getContextAwareAction(actionHistory, suggestedAction, log = globalLog) {
	if (actionHistory.length === 0) return suggestedAction;

	const lastAction = actionHistory[actionHistory.length - 1];
	const recent5Actions = actionHistory.slice(-5);

	// After clicking, users often wait or scroll to see results
	if (lastAction === 'click') {
		if (Math.random() < 0.4) return 'wait';
		if (Math.random() < 0.3) return 'scroll';
	}

	// After form interaction, usually wait to see results or navigate
	if (lastAction === 'form') {
		if (Math.random() < 0.5) return 'wait';
		if (Math.random() < 0.2) return 'back';
	}

	// After scrolling a lot, users often click something they found
	const recentScrolls = recent5Actions.filter(a => a === 'scroll').length;
	if (recentScrolls >= 3 && Math.random() < 0.6) {
		return 'click';
	}

	// After hovering, users often click what they were examining
	if (lastAction === 'hover' && Math.random() < 0.4) {
		return 'click';
	}

	// After going back, users often scroll or wait to orient themselves
	if (lastAction === 'back') {
		if (Math.random() < 0.4) return 'wait';
		if (Math.random() < 0.3) return 'scroll';
	}

	// Prevent too much repetition of the same action
	const recentSameActions = recent5Actions.filter(a => a === suggestedAction).length;
	if (recentSameActions >= 3) {
		// Switch to a different action
		const alternatives = ['click', 'scroll', 'wait', 'hover'];
		const different = alternatives.filter(a => a !== suggestedAction);
		return different[Math.floor(Math.random() * different.length)];
	}

	// Default: use the persona-suggested action
	return suggestedAction;
}

/**
 * Generates an action sequence based on a persona's weighting.
 * @param {string} persona - The selected persona.
 * @param {number} maxActions - Maximum number of actions (optional).
 */
export function generatePersonaActionSequence(persona, maxActions = null) {
	const personaWeights = personas[persona];
	const actionTypes = Object.keys(personaWeights);
	return generateWeightedRandomActionSequence(actionTypes, personaWeights, maxActions);
}

/**
 * Generates a weighted random action sequence.
 * @param {Array} actionTypes - List of possible actions.
 * @param {Object} weights - Weighting for each action.
 * @param {number} maxActions - Maximum number of actions (optional).
 */
export function generateWeightedRandomActionSequence(actionTypes, weights, maxActions = null) {
	const sequence = [];
	// More comprehensive sessions - users engage deeply with content
	// Use maxActions if provided, otherwise use default range
	const length = maxActions ? Math.min(maxActions, u.rand(25, 100)) : u.rand(25, 100);

	// Create a more natural flow with better variety for longer sessions
	let consecutiveScrolls = 0;
	let consecutiveClicks = 0;
	let consecutiveWaits = 0;
	let actionsSinceLastWait = 0;
	let lastAction = null;

	for (let i = 0; i < length; i++) {
		let action = weightedRandom(actionTypes, weights);

		// Natural flow patterns - prevent too much repetition
		if (action === 'scroll') {
			consecutiveScrolls++;
			if (consecutiveScrolls > 4) {
				// After scrolling, users often click or pause
				action = Math.random() < 0.6 ? 'click' : 'wait';
				consecutiveScrolls = 0;
			}
		} else {
			consecutiveScrolls = 0;
		}

		if (action === 'click') {
			consecutiveClicks++;
			if (consecutiveClicks > 3) {
				// After clicking, users often scroll to see results or wait
				action = Math.random() < 0.7 ? 'scroll' : 'wait';
				consecutiveClicks = 0;
			}
		} else {
			consecutiveClicks = 0;
		}

		if (action === 'wait') {
			consecutiveWaits++;
			if (consecutiveWaits > 2) {
				// Don't wait too much in a row
				action = Math.random() < 0.5 ? 'click' : 'scroll';
				consecutiveWaits = 0;
			}
		} else {
			consecutiveWaits = 0;
		}

		// Force occasional waits in longer sessions
		actionsSinceLastWait++;
		if (actionsSinceLastWait > 8 && Math.random() < 0.3) {
			action = 'wait';
			actionsSinceLastWait = 0;
		}

		if (action === 'wait') actionsSinceLastWait = 0;

		sequence.push(action);
		lastAction = action;
	}

	// Ensure we have enough clicks for longer sessions (users come to sites to interact)
	const clickCount = sequence.filter(a => a === 'click').length;
	const minClicks = Math.max(5, Math.floor(length * 0.15)); // At least 15% clicks
	if (clickCount < minClicks) {
		// Replace some non-click actions with clicks
		const indicesToReplace = Math.min(minClicks - clickCount, sequence.length);
		for (let i = 0; i < indicesToReplace; i++) {
			const randomIndex = Math.floor(Math.random() * sequence.length);
			if (sequence[randomIndex] !== 'click') {
				sequence[randomIndex] = 'click';
			}
		}
	}

	return sequence;
}


/**
 * Smart click targeting - prioritizes elements users actually click
 * @param  {import('puppeteer').Page} page
 */
export async function clickStuff(page, hotZones = [], log = globalLog) {
	try {
		// If we have hot zones, prefer them (80% chance to use hot zone)
		if (hotZones.length > 0 && Math.random() < 0.8) {
			// Select from hot zones with weighted probability based on priority
			const weightedHotZones = [];
			hotZones.forEach(zone => {
				for (let i = 0; i < zone.priority; i++) {
					weightedHotZones.push(zone);
				}
			});

			const selectedZone = weightedHotZones[Math.floor(Math.random() * weightedHotZones.length)];

			// More natural click positioning within the hot zone
			const targetX = selectedZone.x + u.rand(-selectedZone.width * 0.3, selectedZone.width * 0.3);
			const targetY = selectedZone.y + u.rand(-selectedZone.height * 0.3, selectedZone.height * 0.3);

			// Slower, more realistic mouse movement to target
			await moveMouse(page,
				u.rand(0, page.viewport().width),
				u.rand(0, page.viewport().height),
				targetX,
				targetY,
				log
			);

			// More realistic pause before clicking (humans don't click immediately)
			await u.sleep(u.rand(200, 800));

			// Natural click with slight delay
			await page.mouse.click(targetX, targetY, {
				delay: u.rand(50, 150),
				count: 1,
				button: 'left'
			});

			log(`    └─ 👆 <span style="color: #07B096;">Clicked hot zone</span> ${selectedZone.tag}: "<span style="color: #FEDE9B;">${selectedZone.text}</span>" <span style="color: #888;">(priority: ${selectedZone.priority})</span>`);

			// Pause after click to see results
			await u.sleep(u.rand(300, 1000));
			return true;
		}

		// Fallback: Get all potentially clickable elements with priority scoring
		const targetInfo = await page.evaluate(() => {
			const elements = [];

			// Priority 1: Primary action buttons (highest priority)
			const primaryButtons = document.querySelectorAll(`
				button[type="submit"], 
				input[type="submit"], 
				[class*="btn-primary"], 
				[class*="button-primary"],
				[class*="cta"], 
				[class*="call-to-action"],
				[class*="buy"], 
				[class*="purchase"],
				[class*="sign-up"], 
				[class*="signup"],
				[class*="get-started"], 
				[class*="start"],
				[class*="download"]
			`);
			primaryButtons.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 10,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			// Priority 2: Regular buttons and obvious clickables
			const buttons = document.querySelectorAll(`
				button:not([type="submit"]), 
				[role="button"], 
				[class*="btn"], 
				[class*="button"],
				a[href]:not([href="#"]):not([href=""]),
				[onclick],
				input[type="button"]
			`);
			buttons.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 7,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			// Priority 3: Navigation and menu items
			const navItems = document.querySelectorAll(`
				nav a, 
				[class*="nav"] a, 
				[class*="menu"] a,
				[class*="header"] a,
				[role="menuitem"],
				[class*="link"]
			`);
			navItems.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 5,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			// Priority 4: Content headings and cards (lower priority)
			const contentElements = document.querySelectorAll(`
				h1, h2, h3, 
				[class*="card"], 
				[class*="item"], 
				[class*="tile"],
				[class*="post"],
				article a
			`);
			contentElements.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 2,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			return elements;
		});

		if (targetInfo.length === 0) return false;

		// Weight selection by priority (higher priority = more likely to be selected)
		const weightedElements = [];
		targetInfo.forEach(info => {
			// Add element multiple times based on priority for weighted selection
			for (let i = 0; i < info.priority; i++) {
				weightedElements.push(info);
			}
		});

		const selectedInfo = weightedElements[Math.floor(Math.random() * weightedElements.length)];
		const rect = selectedInfo.rect;

		// More natural click positioning within the element
		const targetX = rect.x + (rect.width * 0.5) + u.rand(-rect.width * 0.2, rect.width * 0.2);
		const targetY = rect.y + (rect.height * 0.5) + u.rand(-rect.height * 0.2, rect.height * 0.2);

		// Natural mouse movement to target
		await moveMouse(page,
			u.rand(0, page.viewport().width),
			u.rand(0, page.viewport().height),
			targetX,
			targetY,
			log
		);

		// More realistic pause before clicking (humans take time to aim)
		await u.sleep(u.rand(200, 800));

		// Natural click with more realistic timing
		await page.mouse.click(targetX, targetY, {
			delay: u.rand(50, 150),
			count: 1,
			button: 'left'
		});

		log(`    └─ 👆 <span style="color: #07B096;">Clicked</span> ${selectedInfo.tag}: "<span style="color: #FEDE9B;">${selectedInfo.text}</span>" <span style="color: #888;">(priority: ${selectedInfo.priority})</span>`);

		// Pause after click to see results (more realistic)
		await u.sleep(u.rand(300, 1000));

		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Intelligent scrolling that feels natural and content-aware
 */
export async function intelligentScroll(page, hotZones = [], log = globalLog) {
	try {
		const scrollInfo = await page.evaluate(() => {
			const scrollHeight = document.documentElement.scrollHeight;
			const viewportHeight = window.innerHeight;
			const currentScroll = window.pageYOffset;
			const maxScroll = scrollHeight - viewportHeight;

			// Check if we can scroll
			if (scrollHeight <= viewportHeight) return null;

			// Find scroll targets (content sections)
			const sections = document.querySelectorAll('article, section, .content, main, [class*="post"], [class*="card"]');
			const targets = [];

			sections.forEach(section => {
				const rect = section.getBoundingClientRect();
				if (rect.height > 100) { // Only substantial content
					targets.push({
						top: section.offsetTop,
						height: rect.height
					});
				}
			});

			return {
				scrollHeight,
				viewportHeight,
				currentScroll,
				maxScroll,
				targets: targets.slice(0, 5) // Limit to first 5 sections
			};
		});

		if (!scrollInfo) return false;

		let targetScroll;

		// If we have hot zones, prefer scrolling towards them (70% chance)
		if (hotZones.length > 0 && Math.random() < 0.7) {
			// Find hot zones that are not currently visible
			const currentViewportTop = scrollInfo.currentScroll;
			const currentViewportBottom = scrollInfo.currentScroll + scrollInfo.viewportHeight;

			const targetZones = hotZones.filter(zone => {
				return zone.y < currentViewportTop - 100 || zone.y > currentViewportBottom + 100;
			});

			if (targetZones.length > 0) {
				// Scroll towards a high-priority hot zone
				const sortedZones = targetZones.sort((a, b) => b.priority - a.priority);
				const targetZone = sortedZones[Math.floor(Math.random() * Math.min(3, sortedZones.length))]; // Pick from top 3
				targetScroll = targetZone.y - (scrollInfo.viewportHeight * 0.3); // Center zone in viewport
				log(`    └─ 📜 <span style="color: #F8BC3B;">Scrolling toward hot zone:</span> ${targetZone.tag} "${targetZone.text}"`);
			} else {
				// All hot zones visible, do regular content scroll
				if (scrollInfo.targets.length > 0) {
					const target = scrollInfo.targets[Math.floor(Math.random() * scrollInfo.targets.length)];
					targetScroll = target.top - (scrollInfo.viewportHeight * 0.1);
				} else {
					const scrollDirection = Math.random() < 0.8 ? 1 : -1;
					const scrollDistance = scrollInfo.viewportHeight * (0.3 + Math.random() * 0.7);
					targetScroll = scrollInfo.currentScroll + (scrollDistance * scrollDirection);
				}
			}
		} else if (scrollInfo.targets.length > 0 && Math.random() < 0.7) {
			// 70% chance to scroll to content section
			const target = scrollInfo.targets[Math.floor(Math.random() * scrollInfo.targets.length)];
			targetScroll = target.top - (scrollInfo.viewportHeight * 0.1); // Leave some margin
		} else {
			// Random scroll
			const scrollDirection = Math.random() < 0.8 ? 1 : -1; // 80% down, 20% up
			const scrollDistance = scrollInfo.viewportHeight * (0.3 + Math.random() * 0.7); // 30-100% of viewport
			targetScroll = scrollInfo.currentScroll + (scrollDistance * scrollDirection);
		}

		// Clamp to valid range
		targetScroll = Math.max(0, Math.min(scrollInfo.maxScroll, targetScroll));

		// Smooth scroll
		await page.evaluate((target) => {
			window.scrollTo({
				top: target,
				behavior: 'smooth'
			});
		}, targetScroll);

		// Wait for scroll to complete (more realistic timing)
		await u.sleep(u.rand(800, 1500));

		log(`    └─ 📜 <span style="color: #BCF0F0;">Scrolled</span> to position <span style="color: #FEDE9B;">${Math.round(targetScroll)}</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Track mouse movement for heatmap data collection
 */
async function trackMouseMovement(page, target, log = null) {
	try {
		await page.evaluate((targetData) => {
			// Only track if Mixpanel is available
			if (typeof window.mixpanel !== 'undefined' && window.mixpanel.headless) {
				const movementEvent = {
					// Position data
					x: targetData.x,
					y: targetData.y,
					
					// Movement context
					movement_type: 'natural_movement',
					target_source: targetData.source || 'unknown',
					
					// Page context
					page_url: window.location.href,
					viewport_width: window.innerWidth,
					viewport_height: window.innerHeight,
					
					// Calculate relative position
					relative_x: targetData.x / window.innerWidth,
					relative_y: targetData.y / window.innerHeight,
					
					// Timestamp
					timestamp: Date.now(),
					event_time: new Date().toISOString()
				};
				
				// Track the movement event for heatmap aggregation
				// window.mixpanel.headless.track('heatmap_movement', movementEvent);
			}
		}, target);
		
		if (log) {
			log(`        └─ 📊 <span style="color: #4ECDC4;">Mixpanel event sent:</span> heatmap_movement (${target.x}, ${target.y})`);
		}
	} catch (error) {
		if (log) {
			log(`        └─ ⚠️ <span style="color: #F8BC3B;">Mixpanel tracking failed:</span> ${error.message}`);
		}
	}
}

/**
 * Natural mouse movement without clicking - simulates reading/hovering behavior
 */
export async function naturalMouseMovement(page, hotZones = [], log = globalLog) {
	try {
		let target;

		// 60% chance to move near hot zones for more realistic mouse tracking
		if (hotZones.length > 0 && Math.random() < 0.6) {
			// Select a hot zone but don't actually interact with it - just move near it
			const zone = hotZones[Math.floor(Math.random() * hotZones.length)];
			target = {
				x: zone.x + u.rand(-80, 80), // Move near but not exactly on the hot zone
				y: zone.y + u.rand(-60, 60),
				source: 'near hot zone'
			};
		} else {
			// Move to readable content areas
			const contentInfo = await page.evaluate(() => {
				const elements = document.querySelectorAll('p, h1, h2, h3, article, [class*="content"], [class*="text"]');
				const targets = [];

				elements.forEach(el => {
					const rect = el.getBoundingClientRect();
					if (rect.width > 100 && rect.height > 20 && rect.top < window.innerHeight && rect.top > 0) {
						targets.push({
							x: rect.x + rect.width * 0.5,
							y: rect.y + rect.height * 0.5,
							width: rect.width,
							height: rect.height
						});
					}
				});

				return targets.slice(0, 10); // Limit to first 10 elements
			});

			if (contentInfo.length === 0) return false;

			const contentTarget = contentInfo[Math.floor(Math.random() * contentInfo.length)];
			target = {
				x: contentTarget.x + u.rand(-contentTarget.width * 0.3, contentTarget.width * 0.3),
				y: contentTarget.y + u.rand(-contentTarget.height * 0.3, contentTarget.height * 0.3),
				source: 'content area'
			};
		}

		// Ensure target is within viewport
		target.x = Math.max(50, Math.min(page.viewport().width - 50, target.x));
		target.y = Math.max(50, Math.min(page.viewport().height - 50, target.y));

		await moveMouse(page,
			u.rand(0, page.viewport().width),
			u.rand(0, page.viewport().height),
			target.x,
			target.y,
			log
		);

		// Longer, more realistic pause (users move mouse then pause to read/think)
		await u.sleep(u.rand(800, 2000));

		// Track mouse movement for heatmap data
		await trackMouseMovement(page, target, log);

		log(`    └─ 🖱️ <span style="color: #80E1D9;">Mouse moved</span> to ${target.source} <span style="color: #888;">(reading/scanning behavior)</span> - <span style="color: #4ECDC4;">heatmap tracked</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Natural pause to simulate realistic user rhythm
 */
export async function shortPause(log = globalLog) {
	const pauseDuration = u.rand(300, 1500);
	await u.sleep(pauseDuration);
	log(`    └─ ⏸️ <span style="color: #888;">Natural pause</span> (${pauseDuration}ms)`);
	return true;
}

/**
 * Interact with forms - search boxes, email inputs, etc.
 */
export async function interactWithForms(page, log = globalLog) {
	try {
		// Check if page is still responsive
		await page.evaluate(() => document.readyState);

		const formElements = await page.evaluate(() => {
			// Expanded selector to include more input types and inputs without explicit type
			const inputs = Array.from(document.querySelectorAll('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]):not([type="hidden"]), textarea, select'));
			return inputs.filter(el => {
				const rect = el.getBoundingClientRect();
				const style = window.getComputedStyle(el);
				// Better visibility check: element must be visible and either in viewport or scrollable into view
				return rect.width > 0 && rect.height > 0 &&
					!el.disabled && !el.readOnly &&
					style.visibility !== 'hidden' && style.display !== 'none' &&
					(rect.bottom > 0 && rect.top < document.documentElement.scrollHeight);
			}).map((el, index) => {
				const rect = el.getBoundingClientRect();
				return {
					selector: el.tagName.toLowerCase() + (el.type ? `[type="${el.type}"]` : ''),
					type: el.type || el.tagName.toLowerCase(),
					placeholder: el.placeholder || '',
					name: el.name || '',
					id: el.id || '',
					rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
					isInViewport: rect.top >= 0 && rect.top < window.innerHeight,
					index: index // Add index as a fallback selector
				};
			});
		});

		if (formElements.length === 0) {
			log(`    └─ 📝 <span style="color: #888;">No interactive form elements found</span>`);
			return false;
		}

		log(`    └─ 📝 Found ${formElements.length} form element(s) to interact with`);

		const target = formElements[Math.floor(Math.random() * formElements.length)];

		// Scroll element into view if it's not currently visible
		if (!target.isInViewport) {
			await page.evaluate((targetInfo) => {
				// Try multiple selector strategies for robustness
				let element = null;

				// Strategy 1: Try ID selector (if valid)
				if (targetInfo.id) {
					try {
						element = document.getElementById(targetInfo.id);
					} catch (e) {
						// Invalid ID, continue to next strategy
					}
				}

				// Strategy 2: Try name selector
				if (!element && targetInfo.name) {
					try {
						element = document.querySelector(`${targetInfo.selector}[name="${targetInfo.name}"]`);
					} catch (e) {
						// Invalid selector, continue
					}
				}

				// Strategy 3: Use index-based selection as fallback
				if (!element) {
					const elements = document.querySelectorAll(targetInfo.selector);
					if (elements[targetInfo.index]) {
						element = elements[targetInfo.index];
					}
				}

				if (element) {
					element.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			}, target);
			await u.sleep(u.rand(500, 1000)); // Wait for scroll
		}

		// Click into the field
		const targetX = target.rect.x + (target.rect.width * 0.5) + u.rand(-target.rect.width * 0.2, target.rect.width * 0.2);
		const targetY = target.rect.y + (target.rect.height * 0.5) + u.rand(-target.rect.height * 0.2, target.rect.height * 0.2);

		await page.mouse.click(targetX, targetY);
		await u.sleep(u.rand(100, 300));

		// Choose realistic search terms based on input type
		const searchTerms = {
			search: ['best products', 'how to', 'reviews', 'price', 'compare', 'tutorial', 'guide', 'tips'],
			email: ['user@example.com', 'test@gmail.com', 'hello@test.com', 'demo@website.com'],
			text: ['John Doe', 'test user', 'sample text', 'hello world'],
			password: ['password123', 'secret456', 'test1234'],
			url: ['https://example.com', 'https://test.com', 'https://sample.org'],
			tel: ['555-123-4567', '(555) 987-6543', '555.456.7890'],
			number: ['42', '100', '2024', '3.14'],
			select: null // Will be handled differently
		};

		// Handle select elements differently
		if (target.type === 'select') {
			await page.evaluate((targetInfo) => {
				// Try multiple selector strategies for robustness
				let selectEl = null;

				// Strategy 1: Try ID selector (if valid)
				if (targetInfo.id) {
					try {
						selectEl = document.getElementById(targetInfo.id);
					} catch (e) {
						// Invalid ID, continue to next strategy
					}
				}

				// Strategy 2: Try name selector
				if (!selectEl && targetInfo.name) {
					try {
						selectEl = document.querySelector(`${targetInfo.selector}[name="${targetInfo.name}"]`);
					} catch (e) {
						// Invalid selector, continue
					}
				}

				// Strategy 3: Use index-based selection as fallback
				if (!selectEl) {
					const elements = document.querySelectorAll(targetInfo.selector);
					if (elements[targetInfo.index]) {
						selectEl = elements[targetInfo.index];
					}
				}

				if (selectEl && selectEl.options && selectEl.options.length > 1) {
					const randomIndex = Math.floor(Math.random() * selectEl.options.length);
					selectEl.selectedIndex = randomIndex;
					selectEl.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}, target);
			log(`    └─ 📝 <span style="color: #07B096;">Select option chosen</span> in dropdown field`);
			return true;
		}

		const termType = ['email', 'search', 'password', 'url', 'tel', 'number'].includes(target.type) ? target.type : 'text';
		const availableTerms = searchTerms[termType];
		const term = availableTerms[Math.floor(Math.random() * availableTerms.length)];

		// Type with realistic speed and occasional typos
		for (const char of term) {
			// Occasionally make a typo and correct it (5% chance)
			if (Math.random() < 0.05) {
				const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // random letter
				await page.keyboard.type(wrongChar);
				await u.sleep(u.rand(100, 200));
				await page.keyboard.press('Backspace');
				await u.sleep(u.rand(50, 150));
			}

			await page.keyboard.type(char);
			await u.sleep(u.rand(50, 150)); // Realistic typing speed
		}

		// Sometimes submit (30%), sometimes just leave it
		const action = Math.random();
		if (action < 0.3) {
			await page.keyboard.press('Enter');
			log(`    └─ 📝 <span style="color: #07B096;">Form submitted</span> "${term}" in ${target.type} field`);
		} else {
			log(`    └─ 📝 <span style="color: #80E1D9;">Form filled</span> "${term}" in ${target.type} field <span style="color: #888;">(abandoned)</span>`);
		}

		return true;
	} catch (error) {
		// Log specific error but don't crash
		if (error.message && !error.message.includes('Target closed')) {
			log(`    └─ ⚠️ <span style="color: #F8BC3B;">Form interaction failed:</span> ${error.message}`);
		}
		return false;
	}
}

/**
 * Hover over elements to trigger dropdowns, tooltips, etc.
 */
export async function hoverOverElements(page, hotZones = [], persona = null, hoverHistory = [], log = globalLog) {
	try {
		let target;

		// Return visit behavior - sometimes revisit previously hovered elements
		if (hoverHistory.length > 0 && Math.random() < 0.25) { // 25% chance to return to previous element
			const recentElements = hoverHistory.slice(-5); // Consider last 5 hovered elements
			const revisitTarget = recentElements[Math.floor(Math.random() * recentElements.length)];
			
			// Check if the previous element is still valid and visible
			const isValidForRevisit = await page.evaluate((prevTarget) => {
				const element = document.querySelector(prevTarget.selector);
				if (!element) return false;
				
				const rect = element.getBoundingClientRect();
				return rect.width > 30 && rect.height > 20 && rect.top < window.innerHeight && rect.top > 0;
			}, revisitTarget);
			
			if (isValidForRevisit) {
				target = {
					...revisitTarget,
					isRevisit: true
				};
				log(`    └─ 🔄 <span style="color: #7856FF;">Revisiting element</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(return visit)</span> - <span style="color: #4ECDC4;">realistic heatmap pattern</span>`);
			}
		}

		// If we have hot zones, prefer them (75% chance to use hot zone)
		if (hotZones.length > 0 && Math.random() < 0.75) {
			// Filter to currently visible hot zones
			const visibleZones = hotZones.filter(zone => {
				return zone.y > 0 && zone.y < page.viewport().height;
			});

			if (visibleZones.length > 0) {
				// Weight by priority for selection
				const weightedZones = [];
				visibleZones.forEach(zone => {
					for (let i = 0; i < zone.priority; i++) {
						weightedZones.push(zone);
					}
				});

				target = weightedZones[Math.floor(Math.random() * weightedZones.length)];
				log(`    └─ 🎯 <span style="color: #F8BC3B;">Hovering hot zone</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(priority: ${target.priority})</span>`);
			}
		}

		// Fallback: find regular hover targets
		if (!target) {
			const hoverTargets = await page.evaluate(() => {
				const elements = document.querySelectorAll('a, button, [class*="card"], [class*="item"], img, [role="button"], [class*="menu"], nav a');
				const targets = [];

				elements.forEach(el => {
					const rect = el.getBoundingClientRect();
					if (rect.width > 50 && rect.height > 20 && rect.top < window.innerHeight && rect.top > 0) {
						targets.push({
							x: rect.x + rect.width / 2,
							y: rect.y + rect.height / 2,
							width: rect.width,
							height: rect.height,
							text: el.textContent?.trim().substring(0, 30) || '',
							tag: el.tagName.toLowerCase()
						});
					}
				});

				return targets.slice(0, 20); // Limit to first 20 for performance
			});

			if (hoverTargets.length === 0) return false;
			target = hoverTargets[Math.floor(Math.random() * hoverTargets.length)];
		}

		// Move to element
		await moveMouse(page,
			u.rand(0, page.viewport().width),
			u.rand(0, page.viewport().height),
			target.x + u.rand(-10, 10),
			target.y + u.rand(-10, 10),
			log
		);

		// Calculate realistic hover duration based on content type and persona
		const hoverDuration = calculateHoverDuration(target, persona);
		
		// Enhanced logging for heatmap data generation
		const durationSeconds = (hoverDuration / 1000).toFixed(1);
		const dwellCategory = hoverDuration < 2000 ? 'quick' : 
							 hoverDuration < 5000 ? 'medium' : 
							 hoverDuration < 10000 ? 'long' : 'very_long';
		
		log(`    ├─ 🔥 <span style="color: #FF6B6B;">Dwelling for ${durationSeconds}s</span> (${dwellCategory} dwell) - <span style="color: #4ECDC4;">generating heatmap data</span>`);
		
		// Simulate reading-pattern micro-movements during hover (interleaved with the hover duration)
		await simulateReadingMovements(page, target, hoverDuration, persona, log);

		// Track explicit hover dwell event with Mixpanel
		await trackHoverDwellEvent(page, target, hoverDuration, persona, log);

		if (!target.priority) {
			log(`    └─ 🎯 <span style="color: #FEDE9B;">Hovered</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(${hoverDuration}ms)</span>`);
		} else {
			log(`    └─ 🎯 <span style="color: #FEDE9B;">Hovered hot zone</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(${hoverDuration}ms, priority: ${target.priority})</span>`);
		}

		// Add to hover history if not a revisit (to prevent infinite loops)
		if (!target.isRevisit) {
			const historyEntry = {
				x: target.x,
				y: target.y,
				width: target.width,
				height: target.height,
				text: target.text,
				tag: target.tag,
				priority: target.priority,
				selector: target.selector || `${target.tag}:contains("${target.text?.substring(0, 20)}")`,
				timestamp: Date.now(),
				hoverDuration: hoverDuration
			};
			
			hoverHistory.push(historyEntry);
			
			// Keep only the last 10 entries to prevent memory issues
			if (hoverHistory.length > 10) {
				hoverHistory.shift();
			}
			
			log(`      └─ 📊 <span style="color: #4ECDC4;">Heatmap data captured:</span> dwell event + movement tracking + history (${hoverHistory.length}/10 entries)`);
		}

		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Navigate back using browser back button
 */
export async function navigateBack(page, log = globalLog) {
	try {
		const canGoBack = await page.evaluate(() => window.history.length > 1);
		if (canGoBack && Math.random() < 0.7) { // 70% chance to actually go back if possible
			await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
			log(`    └─ ⬅️ <span style="color: #80E1D9;">Navigated back</span> in browser history`);
			return true;
		}
		return false;
	} catch (error) {
		// Back navigation might fail for various reasons (no history, navigation restrictions, etc.)
		return false;
	}
}

/**
 * Navigate forward using browser forward button
 */
export async function navigateForward(page, log = globalLog) {
	try {
		const canGoForward = await page.evaluate(() => window.history.length > 1);
		if (canGoForward && Math.random() < 0.7) { // 70% chance to actually go forward if possible
			await page.goForward({ waitUntil: 'domcontentloaded', timeout: 5000 });
			log(`    └─ ➡️ <span style="color: #80E1D9;">Navigated forward</span> in browser history`);
			return true;
		}
		return false;
	} catch (error) {
		// Forward navigation might fail for various reasons (no history, navigation restrictions, etc.)
		return false;
	}
}


/**
 * Enhanced hot zone detection optimized for marketing landing pages
 * Incorporates research-based improvements while maintaining simplicity
 */
export async function identifyHotZones(page) {
    try {
        return await page.evaluate(() => {
            const hotZones = [];
            
            // Performance optimization: cache computed styles
            const styleCache = new WeakMap();
            
            function getCachedStyle(element) {
                if (!styleCache.has(element)) {
                    styleCache.set(element, window.getComputedStyle(element));
                }
                return styleCache.get(element);
            }

            // Enhanced visual prominence scoring based on research
            function calculateVisualProminence(element, rect) {
                let score = 0;
                const style = getCachedStyle(element);
                
                // 1. Size and position scoring (F-pattern weighted)
                const area = rect.width * rect.height;
                const viewportArea = window.innerWidth * window.innerHeight;
                const relativeSize = area / viewportArea;
                
                // Boost scores for F-pattern positioning (top and left areas)
                const fPatternBoost = rect.top < window.innerHeight * 0.3 ? 1.5 : 
                                     rect.left < window.innerWidth * 0.4 ? 1.2 : 1;
                
                if (relativeSize > 0.02) score += 3 * fPatternBoost; // Large CTAs
                else if (relativeSize > 0.01) score += 2 * fPatternBoost; // Medium buttons
                else if (relativeSize > 0.005) score += 1 * fPatternBoost; // Standard links
                else if (relativeSize < 0.001) score -= 2; // Too small
                
                // 2. Visual hierarchy scoring
                const zIndex = parseInt(style.zIndex) || 0;
                if (zIndex > 1000) score += 3; // Modals, popups
                else if (zIndex > 100) score += 2; // Floating elements
                else if (zIndex > 10) score += 1; // Elevated elements
                
                // Color contrast scoring (simplified)
                const bgColor = style.backgroundColor;
                const hasHighContrast = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && 
                                       bgColor !== 'transparent';
                if (hasHighContrast) score += 1;
                
                // Marketing-specific visual cues
                const hasShadow = style.boxShadow && style.boxShadow !== 'none';
                const hasGradient = style.backgroundImage && style.backgroundImage.includes('gradient');
                const hasTransform = style.transform && style.transform !== 'none';
                const hasTransition = style.transition && style.transition !== 'none';
                
                if (hasShadow) score += 1.5; // Elevated appearance
                if (hasGradient) score += 1; // Modern CTA styling
                if (hasTransform || hasTransition) score += 0.5; // Interactive feel
                
                // Button-like appearance scoring
                const borderRadius = parseInt(style.borderRadius) || 0;
                const padding = parseInt(style.padding) || 0;
                if (borderRadius > 4 && padding > 8) score += 2; // Likely a button
                
                // 3. Typography prominence
                const fontSize = parseInt(style.fontSize) || 16;
                const fontWeight = style.fontWeight;
                
                if (fontSize > 20) score += 1.5;
                else if (fontSize > 16) score += 0.5;
                else if (fontSize < 12) score -= 1;
                
                if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) score += 1;
                
                // 4. Interactive state indicators
                const cursor = style.cursor;
                if (cursor === 'pointer') score += 2;
                else if (cursor === 'grab' || cursor === 'move') score += 1;
                
                // 5. Content analysis for marketing CTAs
                const text = element.textContent?.trim().toLowerCase() || '';
                const actionWords = [
                    'buy', 'shop', 'get', 'start', 'try', 'demo', 'download', 
                    'signup', 'sign up', 'register', 'join', 'save', 'claim',
                    'book', 'schedule', 'contact', 'call', 'learn', 'discover',
                    'free', 'trial', 'now', 'today', 'limited', 'offer'
                ];
                
                const matchedWords = actionWords.filter(word => text.includes(word));
                score += matchedWords.length * 2;
                
                // Short, punchy text is often a CTA
                if (text.length > 0 && text.length < 25) score += 1;
                
                return Math.round(score * 10) / 10;
            }

            // Check if element is actually visible and interactive
            function isElementInteractive(el, rect, style) {
                // Skip if hidden
                if (style.display === 'none' || style.visibility === 'hidden' ||
                    style.opacity === '0' || el.disabled || el.hidden) {
                    return false;
                }
                
                // Check if behind modal/overlay
                if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])') ||
                    document.querySelector('.modal.show, .modal.open, .modal.active')) {
                    // Element needs high z-index to be interactive when modal is open
                    const zIndex = parseInt(style.zIndex) || 0;
                    if (zIndex < 1000) {
                        const modalRect = document.querySelector('[role="dialog"], .modal')?.getBoundingClientRect();
                        if (modalRect && rectsOverlap(rect, modalRect)) {
                            return false;
                        }
                    }
                }
                
                return true;
            }
            
            function rectsOverlap(rect1, rect2) {
                return !(rect1.right < rect2.left || rect1.left > rect2.right ||
                        rect1.bottom < rect2.top || rect1.top > rect2.bottom);
            }

            // Enhanced selector list incorporating ARIA and modern patterns
            const interactiveSelectors = [
                // High-priority marketing elements
                'button[class*="cta"], button[class*="CTA"], button[class*="btn-primary"]',
                'a[class*="button"], a[class*="btn"], a[class*="cta"]',
                '[role="button"][class*="primary"], [role="button"][class*="cta"]',
                'button[type="submit"], input[type="submit"]',
                '[data-action*="buy"], [data-action*="purchase"], [data-action*="checkout"]',
                '[data-action*="signup"], [data-action*="register"], [data-action*="start"]',
                
                // ARIA-enhanced interactive elements
                '[role="button"]:not([aria-hidden="true"])',
                '[role="link"]:not([aria-hidden="true"])',
                '[role="menuitem"], [role="tab"], [role="option"]',
                '[aria-expanded], [aria-haspopup], [aria-controls]',
                
                // Standard interactive elements
                'button:not([aria-hidden="true"]):not(.close):not(.dismiss)',
                'a[href]:not([href="#"]):not([href=""]):not([aria-hidden="true"])',
                'input[type="button"], input[type="submit"], input[type="image"]',
                '[onclick]:not([aria-hidden="true"])',
                '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
                
                // Marketing-specific patterns
                '[class*="hero"] button, [class*="hero"] a[class*="btn"]',
                '[class*="banner"] button, [class*="banner"] a[class*="btn"]',
                '[class*="pricing"] button, [class*="plan"] button',
                '[class*="testimonial"] a[class*="btn"], [class*="review"] button',
                '[class*="countdown"] button, [class*="timer"] button',
                'form button:not([type="reset"]), form input[type="submit"]'
            ];

            // Analyze elements with batching for performance
            const allElements = [];
            interactiveSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (!allElements.includes(el)) {
                            allElements.push(el);
                        }
                    });
                } catch (e) {
                    // Ignore invalid selectors
                }
            });

            // Process elements
            allElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = getCachedStyle(el);

                // Must be visible and reasonably sized
                if (rect.width > 20 && rect.height > 15 &&
                    rect.top < window.innerHeight && rect.bottom > 0 &&
                    rect.left < window.innerWidth && rect.right > 0 &&
                    isElementInteractive(el, rect, style)) {

                    const visualProminence = calculateVisualProminence(el, rect);
                    
                    // Marketing pages often have prominent CTAs
                    const baseThreshold = 4; // Lower threshold for marketing sites
                    
                    if (visualProminence >= baseThreshold) {
                        hotZones.push({
                            element: el,
                            rect: {
                                x: rect.x + rect.width / 2,
                                y: rect.y + rect.height / 2,
                                width: rect.width,
                                height: rect.height,
                                top: rect.top,
                                left: rect.left
                            },
                            priority: visualProminence,
                            text: (el.textContent || '').trim().substring(0, 50),
                            tag: el.tagName.toLowerCase(),
                            href: el.href || null,
                            ariaRole: el.getAttribute('role'),
                            ariaLabel: el.getAttribute('aria-label')
                        });
                    }
                }
            });

            // Sort by priority and remove overlaps
            hotZones.sort((a, b) => b.priority - a.priority);

            // Smart overlap removal - keep highest priority elements
            const filteredZones = [];
            const overlapThreshold = 40; // pixels
            
            hotZones.forEach(zone => {
                const hasOverlap = filteredZones.some(existing => {
                    const dx = Math.abs(zone.rect.x - existing.rect.x);
                    const dy = Math.abs(zone.rect.y - existing.rect.y);
                    
                    // For marketing sites, be more aggressive about keeping multiple CTAs
                    const isLikelyCTA = zone.priority > 10;
                    const threshold = isLikelyCTA ? overlapThreshold * 0.6 : overlapThreshold;
                    
                    return dx < threshold && dy < threshold;
                });

                if (!hasOverlap && filteredZones.length < 25) { // Allow more hot zones
                    filteredZones.push(zone);
                }
            });

            return filteredZones.map(zone => ({
                x: zone.rect.x,
                y: zone.rect.y,
                width: zone.rect.width,
                height: zone.rect.height,
                priority: zone.priority,
                text: zone.text,
                tag: zone.tag,
                selector: zone.tag, // Maintain compatibility
                href: zone.href,
                ariaRole: zone.ariaRole,
                ariaLabel: zone.ariaLabel
            }));
        });
    } catch (error) {
        console.error('Hot zone detection failed:', error);
        return [];
    }
}


/**
 * Track explicit hover dwell event with Mixpanel for better heatmap data
 */
async function trackHoverDwellEvent(page, target, hoverDuration, persona, log = null) {
	try {
		await page.evaluate((targetData, duration, userPersona) => {
			// Only track if Mixpanel is available
			if (typeof window.mixpanel !== 'undefined' && window.mixpanel.headless) {
				// Create comprehensive hover tracking event
				const hoverEvent = {
					// Dwell time measurements
					dwell_time_ms: duration,
					dwell_time_seconds: Math.round(duration / 1000 * 10) / 10,
					
					// Element information
					element_type: targetData.tag,
					element_text: targetData.text,
					element_x: targetData.x,
					element_y: targetData.y,
					element_width: targetData.width,
					element_height: targetData.height,
					element_area: targetData.width * targetData.height,
					
					// User behavior context
					user_persona: userPersona,
					interaction_type: 'hover_dwell',
					
					// Page context
					page_url: window.location.href,
					viewport_width: window.innerWidth,
					viewport_height: window.innerHeight,
					
					// Calculate relative position on page
					relative_x: targetData.x / window.innerWidth,
					relative_y: targetData.y / window.innerHeight,
					
					// Element prominence indicators
					element_priority: targetData.priority || 0,
					is_hot_zone: targetData.priority !== undefined,
					
					// Categorize dwell time
					dwell_category: duration < 2000 ? 'quick' : 
									duration < 5000 ? 'medium' : 
									duration < 10000 ? 'long' : 'very_long',
					
					// Timestamp
					timestamp: Date.now(),
					event_time: new Date().toISOString()
				};
				
				// Track the explicit dwell event
				//window.mixpanel.headless.track('hover_dwell', hoverEvent);
			
			}
		}, target, hoverDuration, persona);
		
		if (log) {
			log(`        └─ 📊 <span style="color: #4ECDC4;">Mixpanel events sent:</span> hover_dwell, heatmap_hover (${hoverDuration}ms dwell)`);
		}
	} catch (error) {
		if (log) {
			log(`        └─ ⚠️ <span style="color: #F8BC3B;">Mixpanel tracking failed:</span> ${error.message}`);
		}
	}
}

/**
 * Simulate realistic reading-pattern micro-movements during hover
 */
async function simulateReadingMovements(page, target, hoverDuration, persona, log) {
	// Determine reading behavior based on persona
	const readingBehaviors = {
		// High-engagement personas - more micro-movements
		researcher: { intensity: 0.8, movements: 4, tremor: 0.3 },
		ruleSlawyer: { intensity: 0.9, movements: 5, tremor: 0.2 },
		discoverer: { intensity: 0.7, movements: 3, tremor: 0.4 },
		comparison: { intensity: 0.6, movements: 3, tremor: 0.3 },
		reader: { intensity: 0.8, movements: 4, tremor: 0.2 },
		
		// Medium-engagement personas
		shopper: { intensity: 0.5, movements: 2, tremor: 0.3 },
		explorer: { intensity: 0.6, movements: 3, tremor: 0.4 },
		methodical: { intensity: 0.7, movements: 3, tremor: 0.2 },
		rolePlayer: { intensity: 0.6, movements: 3, tremor: 0.3 },
		
		// Low-engagement personas - fewer micro-movements
		powerUser: { intensity: 0.3, movements: 1, tremor: 0.2 },
		taskFocused: { intensity: 0.2, movements: 1, tremor: 0.1 },
		decisive: { intensity: 0.1, movements: 1, tremor: 0.1 },
		mobileHabits: { intensity: 0.2, movements: 1, tremor: 0.3 },
		murderHobo: { intensity: 0.1, movements: 0, tremor: 0.1 },
		skimmer: { intensity: 0.4, movements: 2, tremor: 0.3 },
		minMaxer: { intensity: 0.5, movements: 2, tremor: 0.2 }
	};
	
	const behavior = readingBehaviors[persona] || { intensity: 0.5, movements: 2, tremor: 0.3 };
	
	// Only simulate reading movements if persona is engaged enough
	if (Math.random() > behavior.intensity) {
		log(`      ├─ 📖 <span style="color: #95A5A6;">Skipping reading movements</span> (${persona} intensity: ${behavior.intensity})`);
		return;
	}
	
	const numMovements = behavior.movements + u.rand(-1, 1);
	const movementInterval = hoverDuration / Math.max(1, numMovements);
	
	log(`      ├─ 📖 <span style="color: #E74C3C;">Generating reading-pattern micro-movements</span> (${persona}: ${numMovements} movements, ${behavior.intensity} intensity)`);
	
	for (let i = 0; i < numMovements; i++) {
		await u.sleep(movementInterval * (0.8 + Math.random() * 0.4)); // Vary timing
		
		// Simulate different types of reading movements
		const movementType = Math.random();
		let deltaX = 0, deltaY = 0;
		let movementTypeName = '';
		
		if (movementType < 0.4) {
			// Horizontal scanning (left-to-right reading)
			deltaX = u.rand(10, 40) * (Math.random() < 0.8 ? 1 : -1); // Mostly left-to-right
			deltaY = u.rand(-5, 5);
			movementTypeName = 'horizontal';
		} else if (movementType < 0.7) {
			// Vertical scanning (top-to-bottom reading)
			deltaX = u.rand(-8, 8);
			movementTypeName = 'vertical';
			deltaY = u.rand(8, 25);
		} else {
			// Natural tremor/micro-adjustments
			deltaX = u.rand(-15, 15);
			deltaY = u.rand(-15, 15);
			movementTypeName = 'tremor';
		}
		
		// Add tremor based on persona
		if (Math.random() < behavior.tremor) {
			deltaX += u.rand(-3, 3);
			deltaY += u.rand(-3, 3);
		}
		
		// Move mouse with constraints to stay near target
		const newX = Math.max(50, Math.min(page.viewport().width - 50, target.x + deltaX));
		const newY = Math.max(50, Math.min(page.viewport().height - 50, target.y + deltaY));
		
		// Log only the first movement to avoid spam
		if (i === 0) {
			log(`        ├─ 👁️ <span style="color: #3498DB;">Reading movement ${i + 1}/${numMovements}</span> (${movementTypeName}: Δx=${deltaX}, Δy=${deltaY})`);
		}
		
		await page.mouse.move(newX, newY);
		
		// Brief pause to simulate fixation
		await u.sleep(u.rand(100, 300));
	}
}

/**
 * Calculate realistic hover duration based on content type and persona
 */
function calculateHoverDuration(target, persona) {
	// Base durations by content type (in milliseconds)
	const contentTypeDurations = {
		// Reading content - longer hover times
		text: { min: 3000, max: 8000 },
		paragraph: { min: 4000, max: 12000 },
		article: { min: 5000, max: 15000 },
		
		// Interactive elements - moderate hover times
		button: { min: 2000, max: 6000 },
		link: { min: 1500, max: 5000 },
		form: { min: 3000, max: 7000 },
		
		// Media content - variable hover times
		image: { min: 2000, max: 8000 },
		video: { min: 3000, max: 10000 },
		
		// Navigation - shorter hover times
		nav: { min: 1000, max: 3000 },
		menu: { min: 1500, max: 4000 },
		
		// Default for unknown content
		default: { min: 2000, max: 6000 }
	};
	
	// Determine content type based on target properties
	let contentType = 'default';
	if (target.text && target.text.length > 100) contentType = 'paragraph';
	else if (target.text && target.text.length > 50) contentType = 'text';
	else if (target.tag === 'button' || target.text?.toLowerCase().includes('button')) contentType = 'button';
	else if (target.tag === 'a') contentType = 'link';
	else if (target.tag === 'img') contentType = 'image';
	else if (target.tag === 'video') contentType = 'video';
	else if (target.tag === 'form' || target.tag === 'input' || target.tag === 'textarea') contentType = 'form';
	else if (target.tag === 'nav' || target.text?.toLowerCase().includes('nav')) contentType = 'nav';
	
	// Get base duration range
	const baseDuration = contentTypeDurations[contentType];
	
	// Persona-based modifiers
	const personaModifiers = {
		// High engagement personas - longer hover times
		researcher: 1.5,
		ruleSlawyer: 1.4,
		discoverer: 1.3,
		comparison: 1.2,
		rolePlayer: 1.2,
		
		// Medium engagement personas
		shopper: 1.1,
		explorer: 1.0,
		methodical: 1.1,
		reader: 1.3,
		
		// Low engagement personas - shorter hover times
		powerUser: 0.7,
		taskFocused: 0.6,
		decisive: 0.5,
		mobileHabits: 0.4,
		murderHobo: 0.3,
		
		// Variable engagement
		skimmer: 0.8,
		minMaxer: 0.9
	};
	
	// Apply persona modifier
	const modifier = personaModifiers[persona] || 1.0;
	const adjustedMin = Math.round(baseDuration.min * modifier);
	const adjustedMax = Math.round(baseDuration.max * modifier);
	
	// Add some randomness for naturalism
	const baseHoverTime = u.rand(adjustedMin, adjustedMax);
	
	// Add micro-variations (±10%) for more realistic timing
	const variation = baseHoverTime * 0.1;
	const finalDuration = baseHoverTime + u.rand(-variation, variation);
	
	return Math.max(800, Math.round(finalDuration)); // Minimum 800ms hover
}

export async function randomMouse(page, log = globalLog) {
	const startX = u.rand(0, page.viewport().width);
	const startY = u.rand(0, page.viewport().height);
	const endX = u.rand(0, page.viewport().width);
	const endY = u.rand(0, page.viewport().height);
	return await moveMouse(page, startX, startY, endX, endY, log);
}

/**
 * @param  {import('puppeteer').Page} page
 * @param  {number} startX
 * @param  {number} startY
 * @param  {number} endX
 * @param  {number} endY
 */
export async function moveMouse(page, startX, startY, endX, endY, log = globalLog) {
	try {
		// More natural number of steps based on distance - faster movement
		const distance = Math.hypot(endX - startX, endY - startY);
		const baseSteps = Math.floor(distance / 50); 
		const steps = Math.max(3, Math.min(25, baseSteps + u.rand(-1, 1))); // Fewer steps overall

		// Less frequent pause before movement
		if (Math.random() < 0.2) await wait();

		const humanizedPath = generateHumanizedPath(startX, startY, endX, endY, steps);

		for (const pathPoint of humanizedPath) {
			const [x, y, microPause] = pathPoint.length === 3 ? pathPoint : [pathPoint[0], pathPoint[1], false];
			
			await page.mouse.move(x, y);

			// Handle micro-pauses for more natural movement
			if (microPause) {
				await u.sleep(u.rand(20, 50)); // Brief hesitation
			}

			// Faster variable speed that slows down near the target
			const remainingDistance = Math.hypot(endX - x, endY - y);
			const progressRatio = remainingDistance / distance;

			// Faster movement with less variation
			const baseDelay = Math.min(6, remainingDistance / 12); // Faster (was 12/8, now 6/12)
			const speedVariation = u.rand(8, 12) / 10; // Less variation
			const delay = baseDelay * speedVariation;

			// Less dramatic slowdown near target
			if (progressRatio < 0.1) {
				await u.sleep(delay * 1.5); // Was 2x, now 1.5x
			} else {
				await u.sleep(delay * 0.7); // Faster base movement
			}
		}

		// Occasional slight pause after reaching target
		if (coinFlip()) await wait();
		return true;
	} catch (e) {
		return false;
	}
}

export function generateHumanizedPath(startX, startY, endX, endY, steps) {
	const path = [];
	const distance = Math.hypot(endX - startX, endY - startY);

	// Add slight initial deviation for more natural movement start
	const initialDeviation = u.rand(5, 15);
	const deviationAngle = (Math.random() * Math.PI * 2);
	const controlPoint1X = startX + (endX - startX) * 0.3 + Math.cos(deviationAngle) * initialDeviation;
	const controlPoint1Y = startY + (endY - startY) * 0.3 + Math.sin(deviationAngle) * initialDeviation;

	// Second control point closer to target for more precise ending
	const controlPoint2X = startX + (endX - startX) * 0.7;
	const controlPoint2Y = startY + (endY - startY) * 0.7;

	// Natural tremor parameters
	const tremorFrequency = 0.3 + Math.random() * 0.4; // 0.3-0.7 Hz
	const tremorAmplitude = Math.min(2, distance / 200); // Scale tremor with distance
	const fatigueFactor = Math.min(1.5, distance / 300); // Increase tremor on longer movements

	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = bezierPoint(startX, controlPoint1X, controlPoint2X, endX, t);
		const y = bezierPoint(startY, controlPoint1Y, controlPoint2Y, endY, t);

		// Progressive jitter - more at start, less near target
		const progressRatio = i / steps;
		const baseJitter = progressRatio < 0.8 ? u.rand(-3, 3) : u.rand(-1, 1);
		
		// Add natural hand tremor using sinusoidal oscillation
		const tremorX = Math.sin(t * tremorFrequency * Math.PI * 8) * tremorAmplitude * fatigueFactor;
		const tremorY = Math.cos(t * tremorFrequency * Math.PI * 6) * tremorAmplitude * fatigueFactor;
		
		// Add micro-corrections (small directional adjustments)
		let microCorrectionX = 0, microCorrectionY = 0;
		if (i > 0 && Math.random() < 0.15) { // 15% chance of micro-correction
			microCorrectionX = u.rand(-2, 2);
			microCorrectionY = u.rand(-2, 2);
		}
		
		// Add occasional micro-pauses (simulate slight hesitation)
		let microPause = false;
		if (i > 0 && Math.random() < 0.05) { // 5% chance of micro-pause
			microPause = true;
		}
		
		// Combine all movement components
		const finalX = x + baseJitter + tremorX + microCorrectionX;
		const finalY = y + baseJitter + tremorY + microCorrectionY;
		
		path.push([finalX, finalY, microPause]);
	}
	return path;
}

/**
 * @param  {import('puppeteer').Page} page
 */
export async function randomScroll(page, log = globalLog) {
	try {
		const scrollable = await page.evaluate(() => {
			return document.documentElement.scrollHeight > window.innerHeight;
		});

		if (!scrollable) return false;

		// Enhanced scroll behavior
		await page.evaluate(() => {
			function smoothScroll(distance, duration = 1000) {
				return new Promise(resolve => {
					const start = window.pageYOffset;
					const startTime = performance.now();

					function easeInOutQuad(t) {
						return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
					}

					function scroll(currentTime) {
						const timeElapsed = currentTime - startTime;
						const progress = Math.min(timeElapsed / duration, 1);

						const ease = easeInOutQuad(progress);
						window.scrollTo(0, start + distance * ease);

						if (progress < 1) {
							requestAnimationFrame(scroll);
						} else {
							resolve();
						}
					}

					requestAnimationFrame(scroll);
				});
			}

			// More natural scroll patterns
			const scrollTypes = [
				// Small scroll
				() => smoothScroll(Math.random() * (window.innerHeight * 0.3) + 100, u.rand(800, 1200)),
				// Medium scroll
				() => smoothScroll(Math.random() * (window.innerHeight * 0.6) + 200, u.rand(1200, 1800)),
				// Full scroll to bottom
				() => smoothScroll(document.documentElement.scrollHeight - window.innerHeight, u.rand(2000, 3000)),
				// Scroll back up
				() => smoothScroll(-(window.pageYOffset * 0.7), u.rand(1500, 2500))
			];

			return scrollTypes[Math.floor(Math.random() * scrollTypes.length)]();
		});

		// Faster, less frequent pauses between scrolls
		if (Math.random() < 0.4) await wait(); // Only 40% chance of pause
		return true;
	} catch (e) {
		return false;
	}
}

async function wait() {
	const waitType = Math.random();
	if (waitType < 0.4) {
		// Quick pause (40% chance)
		await u.sleep(u.rand(15, 35));
	} else if (waitType < 0.8) {
		// Medium pause (40% chance) 
		await u.sleep(u.rand(50, 120));
	} else {
		// Longer thinking pause (20% chance)
		await u.sleep(u.rand(200, 400));
	}
}

export function bezierPoint(p0, p1, p2, p3, t) {
	return Math.pow(1 - t, 3) * p0 +
		3 * Math.pow(1 - t, 2) * t * p1 +
		3 * (1 - t) * Math.pow(t, 2) * p2 +
		Math.pow(t, 3) * p3;
}

/**
 * Helper to pick a random item from a list with weights.
 * @param {Array} items - List of items to pick from.
 * @param {Object} weights - Object with item keys and their weights.
 * @returns {any} Selected item based on weights.
 */
export function weightedRandom(items, weights) {
	const totalWeight = items.reduce((sum, item) => sum + weights[item], 0);
	const randomValue = Math.random() * totalWeight;
	let cumulativeWeight = 0;

	for (const item of items) {
		cumulativeWeight += weights[item];
		if (randomValue < cumulativeWeight) return item;
	}
}

export function coinFlip() {
	return Math.random() < 0.5;
}

/**
 * Extract top-level domain from hostname for cross-domain detection
 * @param {string} hostname - The hostname to extract TLD from
 * @returns {string} - The top-level domain (e.g., "example.com" from "sub.example.com")
 */
export function extractTopLevelDomain(hostname) {
	if (!hostname || typeof hostname !== 'string') {
		return '[empty-hostname]';
	}

	// Trim whitespace and handle empty after trim
	hostname = hostname.trim();
	if (!hostname) {
		return '[empty-hostname]';
	}

	// Handle IP addresses (IPv4)
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		return hostname;
	}

	// Handle IPv6 addresses (basic check)
	if (hostname.includes(':') && hostname.includes('[')) {
		return hostname;
	}

	// Handle localhost and local domains
	if (hostname === 'localhost' || hostname.endsWith('.local')) {
		return hostname;
	}

	// Handle invalid hostname characters
	if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) {
		return '[invalid-hostname]';
	}

	// Split hostname into parts
	const parts = hostname.split('.');

	// Filter out empty parts
	const validParts = parts.filter(part => part.length > 0);

	// If less than 2 valid parts, return as-is (could be localhost-style)
	if (validParts.length < 2) {
		return hostname;
	}

	// Handle common TLD patterns
	// For most cases, take the last 2 parts (domain.tld)
	// For ccTLD + gTLD (like .co.uk), take last 3 parts if middle part is common
	const commonSecondLevelDomains = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'blogspot', 'github'];

	if (validParts.length >= 3) {
		const secondLevel = validParts[validParts.length - 2];
		if (commonSecondLevelDomains.includes(secondLevel)) {
			return validParts.slice(-3).join('.');
		}
	}

	// Default: return last 2 parts
	return validParts.slice(-2).join('.');
}


if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const local = u.timer('headless');
	local.start();
	await main({ concurrency: 1, users: 1, headless: false, url: "https://soundcloud.com" });
	local.stop(true);

	if (NODE_ENV === 'dev') debugger;
}
