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
import { log } from './logger.js';

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
					log(`🚀 <span style="color: #7856FF; font-weight: bold;">Spawning user ${i + 1}/${users}</span> on <span style="color: #80E1D9;">${url}</span>...`);

					const result = await simulateUser(url, headless, inject, past, maxActions);

					if (result && !result.error && !result.timedOut) {
						log(`✅ <span style="color: #07B096;">User ${i + 1}/${users} completed!</span> Session data captured.`);
					} else if (result && result.timedOut) {
						log(`⏰ <span style="color: #F8BC3B;">User ${i + 1}/${users} timed out</span> - but simulation continues`);
					} else {
						log(`⚠️ <span style="color: #F8BC3B;">User ${i + 1}/${users} completed with issues</span> - but simulation continues`);
					}

					resolve(result || { error: 'Unknown error', user: i + 1 });
				}
				catch (e) {
					const errorMsg = e.message || 'Unknown error';
					log(`❌ <span style="color: #CC332B;">User ${i + 1}/${users} failed:</span> ${errorMsg} - <span style="color: #888;">continuing with other users</span>`);
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

	log(`📊 <span style="color: #7856FF;">Simulation Summary:</span> ${successful}/${users} successful, ${timedOut} timed out, ${crashed} crashed, ${failed} rejected`);

	// Return the actual results, filtering out any undefined values
	const finalResults = results.map(r => {
		if (r.status === 'fulfilled') {
			return r.value;
		} else {
			log(`⚠️ <span style="color: #CC332B;">Promise rejected:</span> ${r.reason?.message || 'Unknown error'}`);
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
export async function simulateUser(url, headless = true, inject = true, past = false, maxActions = null) {
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
		await relaxCSP(page);
		await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true });

		// Spoof user agent for realistic browser fingerprinting
		await spoofAgent(page);

		// Spoof time if requested
		if (past) await forceSpoofTimeInBrowser(page);

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
		const persona = selectPersona();
		log(`🎭 <span style="color: #7856FF;">Persona assigned:</span> <span style="color: #80E1D9; font-weight: bold;">${persona}</span>`);

		try {
			const actions = await simulateUserSession(browser, page, persona, inject, maxActions);
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

// USER AGENT SPOOFING
/**
 * @param  {import('puppeteer').Page} page
 */
export async function spoofAgent(page) {
	const agent = u.shuffle(agents).slice().pop();
	const { userAgent, ...headers } = agent;
	const set = await setUserAgent(page, userAgent, headers);
	return set;
}

/**
 * Set the user agent and additional headers for the page.
 * @param  {import('puppeteer').Page} page
 * @param  {string} userAgent
 * @param  {Object} additionalHeaders
 */
export async function setUserAgent(page, userAgent, additionalHeaders = {}) {
	if (!page) throw new Error("Browser not initialized");

	await page.setUserAgent(userAgent);

	if (Object.keys(additionalHeaders).length > 0) {
		await page.setExtraHTTPHeaders(additionalHeaders);
	}

	return { userAgent, additionalHeaders };
}

// TIME SPOOFING
export function getRandomTimestampWithinLast5Days() {
	const now = Date.now();
	const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000); // 5 days ago in milliseconds
	const timeChosen = Math.floor(Math.random() * (now - fiveDaysAgo)) + fiveDaysAgo;
	log(`🕰️ Spoofed time: ${dayjs(timeChosen).toISOString()}`);
	return timeChosen;
}

// Function to inject and execute time spoofing
export async function forceSpoofTimeInBrowser(page) {
	const spoofedTimestamp = getRandomTimestampWithinLast5Days();
	const spoofTimeFunctionString = spoofTime.toString();

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

async function jamMixpanelIntoBrowser(page, username) {
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

function injectMixpanel(token = process.env.MIXPANEL_TOKEN || "", userId = "") {

	function reset() {
		console.log('[NPC] RESET MIXPANEL\n\n');
		if (mixpanel) {
			if (mixpanel.headless) {
				mixpanel.headless.reset();
			}
		}
	}


	const PARAMS = qsToObj(window.location.search);
	let { user = "", project_token = "", ...restParams } = PARAMS;
	if (!restParams) restParams = {};
	if (!project_token) project_token = token;
	if (!project_token) throw new Error("Project token is required when injecting mixpanel.");

	// Function that contains the code to run after the script is loaded
	function EMBED_TRACKING() {
		if (window?.MIXPANEL_WAS_INJECTED) {
			console.log('[NPC] MIXPANEL WAS ALREADY INJECTED\n\n');
			return;
		}
		console.log('[NPC] EMBED TRACKING\n\n');
		window.MIXPANEL_WAS_INJECTED = true;
		if (window.mixpanel) {
			mixpanel.init(project_token, {
				loaded: function (mp) {
					console.log('[NPC] MIXPANEL LOADED\n\n');
					mp.register(restParams);
					if (userId) mp.identify(userId);
					if (userId) mp.people.set({ $name: userId, $email: userId });
					setupPageExitTracking(mp);


				},

				//autocapture
				autocapture: {
					pageview: "full-url",
					click: true,
					input: true,
					scroll: true,
					submit: true,
					capture_text_content: true
				},

				//session replay
				record_sessions_percent: 100,
				record_inline_images: true,
				record_collect_fonts: true,
				record_mask_text_selector: "nope",
				record_block_selector: "nope",
				record_block_class: "nope",
				record_canvas: true,
				record_heatmap_data: true,



				//normal mixpanel
				ignore_dnt: true,
				batch_flush_interval_ms: 0,
				api_host: "https://express-proxy-lmozz6xkha-uc.a.run.app",
				api_transport: 'XHR',
				persistence: "localStorage",
				api_payload_format: 'json',
				debug: true

			}, "headless");
		}
	}

	function qsToObj(queryString) {
		try {
			const parsedQs = new URLSearchParams(queryString);
			const params = Object.fromEntries(parsedQs);
			return params;
		}

		catch (e) {
			return {};
		}
	}

	function setupPageExitTracking(mp, options = {}) {
		// Configuration with defaults
		const config = {
			heartbeatInterval: 30000, // 30 seconds
			visibilityDelay: 100, // 100ms delay for visibility changes
			includeAdvancedFeatures: true,
			logToConsole: false,
			...options
		};

		// State tracking
		let hasTracked = false;
		let sessionStartTime = Date.now();
		let lastActivityTime = Date.now();
		let lastBlurTime = null;
		let visibilityTimeout = null;
		let heartbeatInterval = null;

		// Core tracking function
		function track(reason, additionalData = {}) {
			// Prevent duplicate tracking
			if (hasTracked) return;
			hasTracked = true;

			const eventData = {
				reason: reason,
				time_on_page: Date.now() - sessionStartTime,
				last_activity: Date.now() - lastActivityTime,
				url: window.location.href,
				referrer: document.referrer,
				viewport_width: window.innerWidth,
				viewport_height: window.innerHeight,
				user_agent: navigator.userAgent,
				timestamp: new Date().toISOString(),
				...additionalData
			};

			if (config.logToConsole) {
				console.log(`Page exit tracked: ${reason}`, eventData);
			}

			// Track with Mixpanel using reliable transport
			mp.track("$mp_page_close", eventData, {
				transport: "sendBeacon",
				send_immediately: true
			});
		}

		// Activity tracking
		function updateActivity() {
			lastActivityTime = Date.now();
		}

		// Setup all event listeners
		function setupListeners() {
			// Primary exit detection
			window.addEventListener("beforeunload", () => {
				track("beforeunload");
			}, { passive: true });

			// Visibility API - most reliable for modern browsers
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					// Small delay to avoid false positives from quick tab switches
					visibilityTimeout = setTimeout(() => {
						track("visibility_hidden");
					}, config.visibilityDelay);
				} else if (document.visibilityState === "visible") {
					// Cancel tracking if user comes back quickly
					if (visibilityTimeout) {
						clearTimeout(visibilityTimeout);
						visibilityTimeout = null;
						hasTracked = false; // Reset for quick tab switches
					}
				}
			}, { passive: true });

			// Page Lifecycle API
			document.addEventListener("pagehide", (event) => {
				track("pagehide", {
					persisted: event.persisted,
					page_cached: event.persisted
				});
			}, { passive: true });

			// Mobile-specific freeze event
			document.addEventListener("freeze", () => {
				track("page_freeze");
			}, { passive: true });

			// Fallback unload event
			window.addEventListener("unload", () => {
				track("unload");
			}, { passive: true });

			// Browser navigation
			window.addEventListener("popstate", () => {
				track("navigation_back_forward");
			}, { passive: true });

			// Focus/blur for context
			window.addEventListener("blur", () => {
				lastBlurTime = Date.now();
			}, { passive: true });

			window.addEventListener("focus", () => {
				if (lastBlurTime && Date.now() - lastBlurTime > 5000) {
					// Reset tracking if blur was for more than 5 seconds
					hasTracked = false;
				}
			}, { passive: true });

			// Connection loss
			window.addEventListener("offline", () => {
				track("connection_lost");
			}, { passive: true });

			// Track user activity
			const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
			activityEvents.forEach(eventType => {
				document.addEventListener(eventType, updateActivity, {
					passive: true,
					capture: true
				});
			});
		}

		// Advanced features
		function setupAdvancedFeatures() {
			if (!config.includeAdvancedFeatures) return;

			// Intersection Observer for page visibility
			if ('IntersectionObserver' in window) {
				const observer = new IntersectionObserver((entries) => {
					entries.forEach(entry => {
						if (!entry.isIntersecting && document.visibilityState === 'visible') {
							setTimeout(() => {
								if (!entry.isIntersecting && !hasTracked) {
									track("intersection_hidden");
								}
							}, 2000);
						}
					});
				}, { threshold: 0, rootMargin: '0px' });

				observer.observe(document.documentElement);
			}

			// Performance monitoring
			if ('PerformanceObserver' in window) {
				try {
					const observer = new PerformanceObserver((list) => {
						const entries = list.getEntries();
						entries.forEach(entry => {
							if (entry.entryType === 'navigation') {
								const loadTime = entry.loadEventEnd - entry.loadEventStart;
								if (loadTime > 10000) {
									track("slow_navigation", { load_time: loadTime });
								}
							}
						});
					});
					observer.observe({ entryTypes: ['navigation'] });
				} catch (e) {
					if (config.logToConsole) {
						console.warn('PerformanceObserver not fully supported');
					}
				}
			}

			// Memory pressure detection
			if ('memory' in performance) {
				const memoryCheck = setInterval(() => {
					if (hasTracked) {
						clearInterval(memoryCheck);
						return;
					}
					const memory = performance.memory;
					if (memory.usedJSHeapSize > memory.totalJSHeapSize * 0.9) {
						track("memory_pressure", {
							memory_used: memory.usedJSHeapSize,
							memory_total: memory.totalJSHeapSize
						});
					}
				}, 10000);
			}
		}


		// Initialize everything
		setupListeners();
		setupAdvancedFeatures();


		// Return utility functions for SPA support
		return {
			// Manual tracking
			track: (reason, data = {}) => track(reason, data),

			// Reset for SPA route changes
			reset: () => {
				hasTracked = false;
				sessionStartTime = Date.now();
				lastActivityTime = Date.now();
				if (visibilityTimeout) {
					clearTimeout(visibilityTimeout);
					visibilityTimeout = null;
				}
			},

			// Cleanup
			destroy: () => {
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				if (visibilityTimeout) {
					clearTimeout(visibilityTimeout);
				}
				hasTracked = true; // Prevent further tracking
			},

			// Get current state
			getState: () => ({
				hasTracked,
				sessionDuration: Date.now() - sessionStartTime,
				timeSinceLastActivity: Date.now() - lastActivityTime
			})
		};
	}



	var MIXPANEL_CUSTOM_LIB_URL = 'https://express-proxy-lmozz6xkha-uc.a.run.app/lib.min.js';
	//prettier-ignore
	(function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
	EMBED_TRACKING();
}

/**
 * Comprehensive CSP and security bypass for reliable script injection
 * @param  {import('puppeteer').Page} page
 */
async function relaxCSP(page) {
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
 * Simulates a user session on the page, following a persona-based action sequence.
 * @param {import('puppeteer').Browser} browser - Puppeteer browser object.
 * @param {import('puppeteer').Page} page - Puppeteer page object.
 * @param {string} persona - User persona to simulate.
 * @param {boolean} inject - Whether to inject Mixpanel into the page.
 * @param {number} maxActions - Maximum number of actions to perform (optional).
 */
export async function simulateUserSession(browser, page, persona, inject = true, maxActions = null) {
	const usersHandle = u.makeName(4, "-");

	// Enhanced logging with user context
	log(`👤 <span style="color: #7856FF; font-weight: bold;">${usersHandle}</span> joined as <span style="color: #80E1D9;">${persona}</span> persona`);

	// Conditional Mixpanel injection
	if (inject) {
		log(`  └─ 💉 Injecting Mixpanel tracking...`);
		await jamMixpanelIntoBrowser(page, usersHandle);

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
		log(`  └─ ⏭️ Skipping Mixpanel injection`);
	}

	// Store initial domain and page target ID
	const initialUrl = await page.url();
	const initialDomain = new URL(initialUrl).hostname;
	const initialTopLevelDomain = extractTopLevelDomain(initialDomain);
	let currentDomain = initialDomain;

	// Log warning if we're still on about:blank (should be rare with improved navigation)
	if (initialUrl.startsWith('about:')) {
		log(`  ├─ ⚠️ <span style="color: #F8BC3B;">Page still on about:blank, will proceed without domain monitoring</span>`);
		// Continue without domain monitoring rather than exiting early
	}
	const mainPageTarget = await page.target();
	const mainPageId = mainPageTarget._targetId;

	// Set up comprehensive polling for CSP, Mixpanel, and domain monitoring
	let monitoringInterval;
	let hasNavigatedBack = false;
	let consecutiveNavigationAttempts = 0;
	const MAX_NAVIGATION_ATTEMPTS = 5;

	if (inject && !initialUrl.startsWith('about:')) {
		// Wait a moment for page to stabilize before starting monitoring
		await u.sleep(1000);

		monitoringInterval = setInterval(async () => {
			try {
				// Check if page and frame are still valid
				if (page.isClosed()) {
					if (monitoringInterval) {
						clearInterval(monitoringInterval);
						monitoringInterval = null;
					}
					return;
				}

				// Check if page is still responsive
				const currentUrl = await page.url();

				// Handle special URLs that don't have normal domains (silently skip about:blank during transitions)
				if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome://') || currentUrl.startsWith('data:')) {
					// Only log if it's not about:blank (which is common during page transitions)
					if (!currentUrl.startsWith('about:blank')) {
						log(`  ├─ ⚠️ <span style="color: #F8BC3B;">Special URL detected, skipping domain monitoring:</span> ${currentUrl}`);
					}
					return;
				}

				let newDomain, newTopLevelDomain;
				try {
					newDomain = new URL(currentUrl).hostname;
					newTopLevelDomain = extractTopLevelDomain(newDomain);

					// Add defensive check for empty domains
					if (!newDomain) {
						log(`  ├─ ⚠️ <span style="color: #F8BC3B;">Empty hostname detected from URL:</span> ${currentUrl}`);
						return;
					}
					if (!newTopLevelDomain) {
						log(`  ├─ ⚠️ <span style="color: #F8BC3B;">Could not extract top-level domain from:</span> ${newDomain}`);
						return;
					}
				} catch (urlError) {
					log(`  ├─ ⚠️ <span style="color: #F8BC3B;">URL parsing error:</span> ${urlError.message} (URL: ${currentUrl})`);
					return;
				}

				// Check for top-level domain changes (should navigate back)
				if (newTopLevelDomain !== initialTopLevelDomain && !hasNavigatedBack) {
					consecutiveNavigationAttempts++;
					log(`  ├─ 🚨 <span style="color: #CC332B;">Top-level domain change detected:</span> ${initialTopLevelDomain} → ${newTopLevelDomain} (attempt ${consecutiveNavigationAttempts}/${MAX_NAVIGATION_ATTEMPTS})`);

					// If too many consecutive navigation attempts, return to original URL
					if (consecutiveNavigationAttempts >= MAX_NAVIGATION_ATTEMPTS) {
						log(`  │  └─ 🚨 <span style="color: #CC332B;">Too many navigation attempts, returning to origin:</span> ${initialUrl}`);
						try {
							await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
							await u.sleep(2000);
							currentDomain = initialDomain;
							consecutiveNavigationAttempts = 0; // Reset counter
							log(`  │  └─ ✅ <span style="color: #07B096;">Successfully returned to origin:</span> ${initialDomain}`);
						} catch (originError) {
							log(`  │  └─ ⚠️ <span style="color: #F8BC3B;">Could not return to origin:</span> ${originError.message}`);
						}
						hasNavigatedBack = false;
						return;
					}

					log(`  │  └─ 🔙 <span style="color: #F8BC3B;">Navigating back to original domain...</span>`);

					hasNavigatedBack = true;
					try {
						await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
						await u.sleep(1000); // Give time for navigation

						// Reset domain tracking after going back
						const backUrl = await page.url();
						currentDomain = new URL(backUrl).hostname;
						log(`  │  └─ ✅ <span style="color: #07B096;">Successfully navigated back to:</span> ${currentDomain}`);

						// Reset navigation attempts on successful back navigation
						consecutiveNavigationAttempts = 0;
					} catch (backError) {
						log(`  │  └─ ⚠️ <span style="color: #F8BC3B;">Could not navigate back:</span> ${backError.message}`);
					}
					hasNavigatedBack = false; // Reset for future navigations
					return;
				} else if (newTopLevelDomain === initialTopLevelDomain && consecutiveNavigationAttempts > 0) {
					// Reset counter when back on original domain
					consecutiveNavigationAttempts = 0;
				}

				// Check for domain changes (subdomain navigation is OK)
				if (newDomain !== currentDomain) {
					log(`  ├─ 🔄 <span style="color: #F8BC3B;">Domain change detected:</span> ${currentDomain} → ${newDomain}`);
					currentDomain = newDomain;

					// Re-apply CSP relaxations for new domain
					log(`  │  ├─ 🛡️ <span style="color: #F8BC3B;">Re-applying CSP relaxations...</span>`);
					try {
						await relaxCSP(page);
						log(`  │  │  └─ ✅ <span style="color: #07B096;">CSP relaxations applied</span>`);
					} catch (cspError) {
						log(`  │  │  └─ ⚠️ <span style="color: #F8BC3B;">CSP relaxation failed:</span> ${cspError.message}`);
					}
				}

				// Check CSP relaxation status
				const cspStatus = await page.evaluate(() => {
					return {
						relaxed: !!(window?.CSP_WAS_RELAXED),
						evalWorking: !!(window?.CSP_EVAL_WORKING),
						timestamp: window?.CSP_RELAXED_TIMESTAMP || 0
					};
				});

				if (!cspStatus.relaxed || !cspStatus.evalWorking) {
					log(`  │  ├─ 🛡️ <span style="color: #F8BC3B;">CSP relaxation check failed - re-applying...</span>`);
					try {
						await relaxCSP(page);
						log(`  │  │  └─ ✅ <span style="color: #07B096;">CSP re-relaxation completed</span>`);
					} catch (cspError) {
						log(`  │  │  └─ ⚠️ <span style="color: #F8BC3B;">CSP re-relaxation failed:</span> ${cspError.message}`);
					}
				}

				// Check Mixpanel injection status
				const isInjected = await page.evaluate(() => {
					return !!(window?.MIXPANEL_WAS_INJECTED);
				});

				if (!isInjected) {
					log(`  │  ├─ 💉 <span style="color: #F8BC3B;">Mixpanel not detected, re-injecting...</span>`);
					try {
						await jamMixpanelIntoBrowser(page, usersHandle);
						log(`  │  │  └─ ✅ <span style="color: #07B096;">Mixpanel re-injection completed</span>`);
					} catch (mixpanelError) {
						log(`  │  │  └─ ⚠️ <span style="color: #F8BC3B;">Mixpanel re-injection failed:</span> ${mixpanelError.message}`);
					}
				}

			} catch (e) {
				// Handle common frame/page errors more gracefully - be more aggressive about filtering
				if (e.message && (
					e.message.includes('detached Frame') ||
					e.message.includes('Target closed') ||
					e.message.includes('Session closed') ||
					e.message.includes('Protocol error') ||
					e.message.includes('Attempted to use detached') ||
					e.message.includes('frame was detached') ||
					e.message.includes('Cannot find context')
				)) {
					// These are expected during page navigation - don't spam logs
					return;
				}

				// Log only truly unexpected errors
				log(`  │  └─ ⚠️ <span style="color: #F8BC3B;">Monitoring error:</span> ${e.message}`);
			}
		}, 5000); // Every 5 seconds to reduce interference
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
	const maxConsecutiveFailures = 8;

	// Identify hot zones for coordinated user behavior (always enabled for better heatmap data)
	let hotZones = [];
	try {
		hotZones = await identifyHotZones(page);
		log(`  ├─ 🎯 <span style="color: #F8BC3B;">Hot zones detected:</span> Found ${hotZones.length} prominent elements for realistic interactions`);
	} catch (e) {
		log(`  ├─ ⚠️ <span style="color: #F8BC3B;">Hot zone detection failed:</span> ${e.message} - using fallback targeting`);
	}



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
		const action = getContextAwareAction(actionHistory, originalAction);

		const emoji = actionEmojis[action] || '🎯';
		const contextNote = action !== originalAction ? ` <span style="color: #888;">(adapted from ${originalAction})</span>` : '';
		log(`  ├─ ${emoji} <span style="color: #FF7557;">Action ${index + 1}/${numActions}</span>: ${action}${contextNote}`);

		let funcToPerform;
		switch (action) {
			case "click":
				funcToPerform = () => clickStuff(page, hotZones);
				break;
			case "scroll":
				funcToPerform = () => intelligentScroll(page, hotZones);
				break;
			case "mouse":
				funcToPerform = () => naturalMouseMovement(page, hotZones);
				break;
			case "hover":
				funcToPerform = () => hoverOverElements(page, hotZones);
				break;
			case "form":
				funcToPerform = () => interactWithForms(page);
				break;
			case "back":
				funcToPerform = () => navigateBack(page);
				break;
			default:
				funcToPerform = () => shortPause(page);
				break;
		}

		if (funcToPerform) {
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

	// Clean up intervals and listeners
	if (monitoringInterval) {
		clearInterval(monitoringInterval);
	}

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
	powerUser: { scroll: 0.3, mouse: 0.1, click: 0.9, wait: 0.1, hover: 0.2, form: 0.3, back: 0.1 },
	taskFocused: { scroll: 0.2, mouse: 0.1, click: 0.8, wait: 0.2, hover: 0.1, form: 0.5, back: 0.2 },

	// Shopping/conversion oriented
	shopper: { scroll: 0.4, mouse: 0.2, click: 0.7, wait: 0.3, hover: 0.4, form: 0.4, back: 0.3 },
	comparison: { scroll: 0.5, mouse: 0.3, click: 0.6, wait: 0.4, hover: 0.5, form: 0.3, back: 0.4 },

	// Content consumption
	reader: { scroll: 0.6, mouse: 0.2, click: 0.4, wait: 0.5, hover: 0.3, form: 0.2, back: 0.2 },
	skimmer: { scroll: 0.7, mouse: 0.1, click: 0.3, wait: 0.2, hover: 0.2, form: 0.1, back: 0.3 },

	// Exploration patterns
	explorer: { scroll: 0.4, mouse: 0.3, click: 0.6, wait: 0.3, hover: 0.4, form: 0.3, back: 0.2 },
	discoverer: { scroll: 0.3, mouse: 0.4, click: 0.7, wait: 0.2, hover: 0.6, form: 0.4, back: 0.1 },

	// Mobile-like behavior (even on desktop)
	mobileHabits: { scroll: 0.8, mouse: 0.1, click: 0.6, wait: 0.2, hover: 0.1, form: 0.3, back: 0.2 },

	// Efficient users
	decisive: { scroll: 0.2, mouse: 0.1, click: 0.9, wait: 0.1, hover: 0.1, form: 0.4, back: 0.1 },

	// Deep engagement patterns
	researcher: { scroll: 0.7, mouse: 0.4, click: 0.5, wait: 0.6, hover: 0.5, form: 0.4, back: 0.1 },
	methodical: { scroll: 0.5, mouse: 0.3, click: 0.6, wait: 0.5, hover: 0.4, form: 0.5, back: 0.2 },

	minMaxer: { scroll: 0.3, mouse: 0.7, click: 0.8, wait: 0.2, hover: 0.3, form: 0.2, back: 0.1 }, // Optimize every action
	rolePlayer: { scroll: 0.6, mouse: 0.4, click: 0.4, wait: 0.6, hover: 0.5, form: 0.3, back: 0.2 }, // Immersive experience
	murderHobo: { scroll: 0.1, mouse: 0.1, click: 0.99, wait: 0.01, hover: 0.1, form: 0.1, back: 0.1 }, // Click all the things!
	ruleSlawyer: { scroll: 0.9, mouse: 0.6, click: 0.5, wait: 0.7, hover: 0.6, form: 0.6, back: 0.3 }, // Read everything twice

};

/**
 * Selects a random persona.
 */
export function selectPersona() {
	const personaKeys = Object.keys(personas);
	return personaKeys[Math.floor(Math.random() * personaKeys.length)];
}

/**
 * Context-aware action selection based on recent actions
 * @param {Array} actionHistory - Recent actions performed
 * @param {string} suggestedAction - Action suggested by persona weighting
 * @returns {string} - The action to perform (may override suggestion)
 */
export function getContextAwareAction(actionHistory, suggestedAction) {
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

// Core action functions

/**
 * Smart click targeting - prioritizes elements users actually click
 * @param  {import('puppeteer').Page} page
 */
export async function clickStuff(page, hotZones = []) {
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
				targetY
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
			targetY
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
export async function intelligentScroll(page, hotZones = []) {
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
 * Natural mouse movement without clicking - simulates reading/hovering behavior
 */
export async function naturalMouseMovement(page, hotZones = []) {
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
			target.y
		);

		// Longer, more realistic pause (users move mouse then pause to read/think)
		await u.sleep(u.rand(800, 2000));

		log(`    └─ 🖱️ <span style="color: #80E1D9;">Mouse moved</span> to ${target.source} <span style="color: #888;">(reading/scanning behavior)</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Natural pause to simulate realistic user rhythm
 */
export async function shortPause() {
	const pauseDuration = u.rand(300, 1500);
	await u.sleep(pauseDuration);
	log(`    └─ ⏸️ <span style="color: #888;">Natural pause</span> (${pauseDuration}ms)`);
	return true;
}

/**
 * Interact with forms - search boxes, email inputs, etc.
 */
export async function interactWithForms(page) {
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
export async function hoverOverElements(page, hotZones = []) {
	try {
		let target;

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
			target.y + u.rand(-10, 10)
		);

		// More realistic hover duration - users take time to read/examine
		const hoverDuration = u.rand(1000, 3000);
		await u.sleep(hoverDuration);

		// Often move slightly while hovering (reading tooltip/dropdown/examining element)
		if (Math.random() < 0.6) {
			await page.mouse.move(
				target.x + u.rand(-30, 30),
				target.y + u.rand(-30, 30)
			);
			await u.sleep(u.rand(500, 1200));
		}

		if (!target.priority) {
			log(`    └─ 🎯 <span style="color: #FEDE9B;">Hovered</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(${hoverDuration}ms)</span>`);
		}

		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Navigate back using browser back button
 */
export async function navigateBack(page) {
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
 * Identify hot zones on the page for heatmap generation
 * These are prominent, interactive elements that users should cluster around
 */
export async function identifyHotZones(page) {
	try {
		return await page.evaluate(() => {
			const hotZones = [];

			// Priority 1: High-impact conversion elements (most important for heatmaps)
			const highPrioritySelectors = [
				'button[type="submit"]',
				'input[type="submit"]',
				'[class*="cta"]:not([class*="secondary"])', '[class*="CTA"]:not([class*="secondary"])',
				'[class*="btn-primary"]', '[class*="primary-btn"]', '[class*="button-primary"]',
				'[class*="buy"]:not([class*="guide"])', '[class*="purchase"]', '[class*="order"]',
				'[class*="signup"]', '[class*="sign-up"]', '[class*="register"]',
				'[class*="get-started"]', '[class*="start-trial"]', '[class*="free-trial"]',
				'[class*="download"]', '[class*="subscribe"]',
				'[class*="add-to-cart"]', '[class*="checkout"]',
				'[role="button"][class*="primary"]',
				'[data-action*="purchase"]', '[data-action*="signup"]'
			];

			// Priority 2: Navigation and key interactive areas  
			const mediumPrioritySelectors = [
				'nav a[href]:not([href="#"])', 'header nav a[href]', '[class*="nav-main"] a[href]',
				'[class*="menu-item"] a[href]', '[class*="navigation"] a[href]',
				'[class*="hero"] button', '[class*="hero"] a[class*="btn"]',
				'[class*="banner"] button', '[class*="banner"] a[class*="btn"]',
				'[class*="card"] button', '[class*="card"] a[class*="btn"]',
				'[class*="product"] button', '[class*="service"] button',
				'[class*="pricing"] button', '[class*="plan"] button',
				'form button:not([type="reset"])', 'form input[type="submit"]',
				'[class*="search"] button', '[class*="filter"] button',
				'[class*="tab"]:not([class*="table"]) button', '[role="tab"]',
				'[class*="toggle"] button'
			];

			// Priority 3: Secondary interactive elements (be selective but broader for arbitrary sites)
			const lowPrioritySelectors = [
				'button:not([class*="close"]):not([class*="dismiss"]):not([aria-hidden="true"])',
				'a[href]:not([href="#"]):not([href=""]):not([href^="mailto"]):not([href^="tel"]):not([href^="javascript:"])',
				'[role="button"]:not([aria-hidden="true"]):not([class*="close"])',
				'[class*="link"]:not([class*="footer-link"])',
				'[onclick]:not([class*="close"]):not([class*="dismiss"])'
			];

			function analyzeElements(selectors, basePriority) {
				selectors.forEach(selector => {
					try {
						const elements = document.querySelectorAll(selector);
						elements.forEach(el => {
							const rect = el.getBoundingClientRect();

							// Element must be visible and appropriately sized for interaction
							if (rect.width > 30 && rect.height > 20 &&
								rect.top >= 0 && rect.top < window.innerHeight &&
								rect.left >= 0 && rect.left < window.innerWidth &&
								rect.bottom > 0 && rect.right > 0) {

								// Check if element is actually visible
								const style = window.getComputedStyle(el);
								if (style.display === 'none' || style.visibility === 'hidden' ||
									style.opacity === '0' || el.disabled || el.hidden) {
									return; // Skip hidden/disabled elements
								}

								// Calculate priority based on size, position, and content
								let priority = basePriority;

								// Boost priority for appropriately sized interactive elements
								const area = rect.width * rect.height;
								if (area > 15000) priority += 3; // Large, prominent elements
								else if (area > 8000) priority += 2; // Medium prominent elements
								else if (area > 3000) priority += 1; // Reasonably sized elements
								else if (area < 800) priority -= 2; // Too small, probably not main interaction

								// Boost priority for elements in key positions
								if (rect.top < window.innerHeight * 0.4) priority += 2; // Above the fold
								else if (rect.top < window.innerHeight * 0.8) priority += 1; // Still visible

								// Boost priority for elements with action-oriented text
								const text = el.textContent?.trim().toLowerCase() || '';
								const actionWords = ['buy', 'shop', 'get', 'start', 'learn', 'try', 'demo', 'download', 'signup', 'subscribe', 'register', 'join', 'contact', 'book', 'order'];
								const wordMatches = actionWords.filter(word => text.includes(word)).length;
								priority += wordMatches * 2; // Each action word adds priority

								// Reduce priority for likely non-interactive content
								if (text.length > 100) priority -= 1; // Probably text content, not button
								if (el.tagName === 'A' && !el.getAttribute('href')) priority -= 2; // Non-functional links

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
									priority,
									selector: selector,
									text: text.substring(0, 50),
									tag: el.tagName.toLowerCase(),
									area: area
								});
							}
						});
					} catch (e) {
						// Ignore selector errors
					}
				});
			}

			// Analyze elements by priority (more focused scoring)
			analyzeElements(highPrioritySelectors, 12);  // High-impact conversion elements
			analyzeElements(mediumPrioritySelectors, 7);  // Navigation and key areas
			analyzeElements(lowPrioritySelectors, 4);     // Secondary elements

			// Sort by priority and limit to top candidates
			hotZones.sort((a, b) => b.priority - a.priority);

			// Remove overlapping zones and apply quality filters
			const filteredZones = [];
			hotZones.forEach(zone => {
				// Only include zones with meaningful priority (above baseline)
				if (zone.priority < 8) return;

				const isOverlapping = filteredZones.some(existing => {
					const dx = Math.abs(zone.rect.x - existing.rect.x);
					const dy = Math.abs(zone.rect.y - existing.rect.y);
					return dx < 40 && dy < 40; // Tighter overlap detection
				});

				if (!isOverlapping && filteredZones.length < 10) { // Limit to 10 highest quality hot zones
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
				selector: zone.selector
			}));
		});
	} catch (error) {
		console.error('Hot zone detection failed:', error);
		return [];
	}
}

export async function randomMouse(page) {
	const startX = u.rand(0, page.viewport().width);
	const startY = u.rand(0, page.viewport().height);
	const endX = u.rand(0, page.viewport().width);
	const endY = u.rand(0, page.viewport().height);
	return await moveMouse(page, startX, startY, endX, endY);
}

/**
 * @param  {import('puppeteer').Page} page
 * @param  {number} startX
 * @param  {number} startY
 * @param  {number} endX
 * @param  {number} endY
 */
export async function moveMouse(page, startX, startY, endX, endY) {
	try {
		// More natural number of steps based on distance - faster movement
		const distance = Math.hypot(endX - startX, endY - startY);
		const baseSteps = Math.floor(distance / 70); // Fewer steps (was 50, now 70)
		const steps = Math.max(3, Math.min(25, baseSteps + u.rand(-1, 1))); // Fewer steps overall

		// Less frequent pause before movement
		if (Math.random() < 0.2) await wait();

		const humanizedPath = generateHumanizedPath(startX, startY, endX, endY, steps);

		for (const [x, y] of humanizedPath) {
			await page.mouse.move(x, y);

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

	// Add slight initial deviation for more natural movement start
	const initialDeviation = u.rand(5, 15);
	const deviationAngle = (Math.random() * Math.PI * 2);
	const controlPoint1X = startX + (endX - startX) * 0.3 + Math.cos(deviationAngle) * initialDeviation;
	const controlPoint1Y = startY + (endY - startY) * 0.3 + Math.sin(deviationAngle) * initialDeviation;

	// Second control point closer to target for more precise ending
	const controlPoint2X = startX + (endX - startX) * 0.7;
	const controlPoint2Y = startY + (endY - startY) * 0.7;

	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = bezierPoint(startX, controlPoint1X, controlPoint2X, endX, t);
		const y = bezierPoint(startY, controlPoint1Y, controlPoint2Y, endY, t);

		// Add smaller jitter near the target
		const progressRatio = i / steps;
		const jitterAmount = progressRatio < 0.8 ? u.rand(-3, 3) : u.rand(-1, 1);

		path.push([x + jitterAmount, y + jitterAmount]);
	}
	return path;
}

/**
 * @param  {import('puppeteer').Page} page
 */
export async function randomScroll(page) {
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


// More realistic wait patterns - faster and more varied
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
