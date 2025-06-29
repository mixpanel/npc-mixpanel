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
import { log } from '../utils/logger.js';

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
	let { url = "https://aktunes.neocities.org/fixpanel/",
		users = 10,
		concurrency = 2,
		headless = true,
		inject = true,
		past = false,
		token = "",
		maxActions = null
	} = PARAMS;
	const limit = pLimit(concurrency);
	if (users > 25) users = 25;
	if (concurrency > 3) concurrency = 3;
	if (token) MIXPANEL_TOKEN = token;

	const userPromises = Array.from({ length: users }, (_, i) => {

		return limit(() => {
			try {
				log(`🚀 <span style="color: #9d5cff; font-weight: bold;">Spawning user ${i + 1}/${users}</span> on <span style="color: #80E1D9;">${url}</span>...`);
				return simulateUser(url, headless, inject, past, maxActions)
					.then((results) => {
						log(`✅ <span style="color: #00ff88;">User ${i + 1}/${users} completed!</span> Session data captured.`);
						return results;
					});
			}
			catch (e) {
				log(`❌ <span style="color: #ff4444;">User ${i + 1} failed:</span> ${e.message}`);
			}
		});
	});

	const results = await Promise.all(userPromises).catch((error) => {
		if (NODE_ENV === "dev") debugger;
		throw error;
	});

	return results;
}

/**
 * Simulates a single user session with random actions, with a timeout to prevent hangs.
 * @param {string} url - The URL to visit.
 * @param {boolean} headless - Whether to run the browser headlessly.
 * @param {boolean} inject - Whether to inject Mixpanel into the page.
 * @param {boolean} past - Whether to simulate time in past.
 * @param {number} maxActions - Maximum number of actions to perform (optional).
 */
async function simulateUser(url, headless = true, inject = true, past = false, maxActions = null) {
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

		log(`📍 <span style="color: #ff8800;">Navigating</span> to <span style="color: #80E1D9;">${url}</span>...`);
		await page.goto(url);
		const persona = selectPersona();
		log(`🎭 <span style="color: #9d5cff;">Persona assigned:</span> <span style="color: #80E1D9; font-weight: bold;">${persona}</span>`);

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
		if (browser) await browser.close();
		if (NODE_ENV === "dev") log("simulateUser Error:", error);
		return { error: error.message, timedOut: true };
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
function getRandomTimestampWithinLast5Days() {
	const now = Date.now();
	const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000); // 5 days ago in milliseconds
	const timeChosen = Math.floor(Math.random() * (now - fiveDaysAgo)) + fiveDaysAgo;
	log(`🕰️ Spoofed time: ${dayjs(timeChosen).toISOString()}`);
	return timeChosen;
}

// Function to inject and execute time spoofing
async function forceSpoofTimeInBrowser(page) {
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
			includeHeartbeat: true,
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

		// Heartbeat functionality
		function setupHeartbeat() {
			if (!config.includeHeartbeat) return;

			heartbeatInterval = setInterval(() => {
				if (!hasTracked && document.visibilityState === "visible") {
					mp.track("$mp_page_heartbeat", {
						session_duration: Date.now() - sessionStartTime,
						last_activity: Date.now() - lastActivityTime,
						url: window.location.href
					}, { transport: "sendBeacon" });
				}
			}, config.heartbeatInterval);
		}

		// Initialize everything
		setupListeners();
		setupAdvancedFeatures();
		setupHeartbeat();

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

				request.continue({ headers });
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
							}
						});
					});
				});
				observer.observe(document, { childList: true, subtree: true });

				// Override any existing CSP enforcement
				document.addEventListener('DOMContentLoaded', () => {
					const cspMetas = document.querySelectorAll('meta[http-equiv*="content-security-policy" i]');
					cspMetas.forEach(meta => meta.remove());
				});
			}

			// Override eval restrictions
			window.originalEval = window.eval;

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

		// 5. Set permissive permissions for all origins
		const context = page.browserContext();
		await context.overridePermissions(page.url(), [
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
async function simulateUserSession(browser, page, persona, inject = true, maxActions = null) {
	const usersHandle = u.makeName(4, "-");

	// Enhanced logging with user context
	log(`👤 <span style="color: #9d5cff; font-weight: bold;">${usersHandle}</span> joined as <span style="color: #80E1D9;">${persona}</span> persona`);

	// Conditional Mixpanel injection
	if (inject) {
		log(`  └─ 💉 Injecting Mixpanel tracking...`);
		await jamMixpanelIntoBrowser(page, usersHandle);

		// Verify injection was successful
		const injectionSuccess = await page.evaluate(() => {
			return !!(window.mixpanel && window.MIXPANEL_WAS_INJECTED);
		});

		if (injectionSuccess) {
			log(`  │  └─ ✅ <span style="color: #00ff88;">Mixpanel loaded successfully</span>`);
		} else {
			log(`  │  └─ ⚠️ <span style="color: #ffaa00;">Mixpanel injection may have failed</span>`);
		}
	} else {
		log(`  └─ ⏭️ Skipping Mixpanel injection`);
	}

	// Store initial domain and page target ID
	let currentDomain = new URL(await page.url()).hostname;
	const mainPageTarget = await page.target();
	const mainPageId = mainPageTarget._targetId;

	// Set up periodic Mixpanel injection check (every 30 seconds)
	let mixpanelCheckInterval;
	if (inject) {
		mixpanelCheckInterval = setInterval(async () => {
			try {
				const isInjected = await page.evaluate(() => {
					return !!(window?.MIXPANEL_WAS_INJECTED);
				});

				if (!isInjected) {
					log(`  ├─ 🔄 <span style="color: #ffaa00;">Mixpanel check:</span> Not detected, re-injecting...`);
					await jamMixpanelIntoBrowser(page, usersHandle);
				}
			} catch (e) {
				// Ignore errors during polling - page might be navigating
			}
		}, 30000); // Every 30 seconds
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

	// Set up navigation listener for the main page
	page.on('domcontentloaded', async () => {
		try {
			// Check if we're still on the main page
			const currentTarget = await page.target();
			if (currentTarget._targetId === mainPageId) {
				const newDomain = new URL(await page.url()).hostname;
				if (newDomain !== currentDomain) {
					// Domain changed in the same tab - reinject
					log(`  ├─ 🔄 <span style="color: #ff8800;">Navigation</span> detected: ${currentDomain} → <span style="color: #80E1D9;">${newDomain}</span>`);
					log(`  │  └─ Reapplying CSP relaxations and Mixpanel injection...`);
					try {
						await relaxCSP(page);
					}
					catch (e) {
						log(`    └─ ⚠️ <span style="color: #ffaa00;">CSP relaxation failed:</span> ${e.message}`);
					}
					if (inject) {
						try {
							log(`  │  └─ 💉 Reinjecting Mixpanel tracker...`);
							await jamMixpanelIntoBrowser(page, usersHandle);

						}
						catch (e) {
							log(`    └─ ⚠️ <span style="color: #ffaa00;">Mixpanel reinjection failed:</span> ${e.message}`);
						}
					}
					currentDomain = newDomain;
				}
			}
		} catch (e) {

			log('Error handling navigation:', e);
		}
	});

	const actionSequence = generatePersonaActionSequence(persona, maxActions);
	const numActions = actionSequence.length;
	const actionResults = [];



	// Action emoji mapping
	const actionEmojis = {
		click: '👆',
		scroll: '📜',
		mouse: '🖱️',
		wait: '⏸️'
	};

	for (const [index, action] of actionSequence.entries()) {
		const emoji = actionEmojis[action] || '🎯';
		log(`  ├─ ${emoji} <span style="color: #FF7557;">Action ${index + 1}/${numActions}</span>: ${action}`);

		let funcToPerform;
		switch (action) {
			case "click":
				funcToPerform = clickStuff;
				break;
			case "scroll":
				funcToPerform = intelligentScroll;
				break;
			case "mouse":
				funcToPerform = naturalMouseMovement;
				break;
			default:
				funcToPerform = shortPause;
				break;
		}

		if (funcToPerform) {
			try {
				const result = await funcToPerform(page);
				if (result) actionResults.push(action);
			}
			catch (e) {
				// Log error but continue
				log(`    └─ ⚠️ <span style="color: #ffaa00;">Action ${action} failed:</span> <span style="color: #888;">${e.message}</span>`);
			}
		}

		// Very short natural pause between actions
		await u.sleep(u.rand(25, 100));
	}

	// Clean up the navigation listener and intervals
	await page.removeAllListeners('domcontentloaded');
	if (mixpanelCheckInterval) {
		clearInterval(mixpanelCheckInterval);
	}

	log(`  └─ ✅ <span style="color: #00ff88; font-weight: bold;">${usersHandle}</span> completed session: <span style="color: #888;">${actionResults.length}/${numActions} actions successful</span>`);

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
	powerUser: { scroll: 0.3, mouse: 0.1, click: 0.9, wait: 0.1 },
	taskFocused: { scroll: 0.2, mouse: 0.1, click: 0.8, wait: 0.2 },

	// Shopping/conversion oriented
	shopper: { scroll: 0.4, mouse: 0.2, click: 0.7, wait: 0.3 },
	comparison: { scroll: 0.5, mouse: 0.3, click: 0.6, wait: 0.4 },

	// Content consumption
	reader: { scroll: 0.6, mouse: 0.2, click: 0.4, wait: 0.5 },
	skimmer: { scroll: 0.7, mouse: 0.1, click: 0.3, wait: 0.2 },

	// Exploration patterns
	explorer: { scroll: 0.4, mouse: 0.3, click: 0.6, wait: 0.3 },
	discoverer: { scroll: 0.3, mouse: 0.4, click: 0.7, wait: 0.2 },

	// Mobile-like behavior (even on desktop)
	mobileHabits: { scroll: 0.8, mouse: 0.1, click: 0.6, wait: 0.2 },

	// Efficient users
	decisive: { scroll: 0.2, mouse: 0.1, click: 0.9, wait: 0.1 },

	// Deep engagement patterns
	researcher: { scroll: 0.7, mouse: 0.4, click: 0.5, wait: 0.6 },
	methodical: { scroll: 0.5, mouse: 0.3, click: 0.6, wait: 0.5 },

	minMaxer: { scroll: 0.3, mouse: 0.7, click: 0.8, wait: 0.2 }, // Optimize every action
	rolePlayer: { scroll: 0.6, mouse: 0.4, click: 0.4, wait: 0.6 }, // Immersive experience
	murderHobo: { scroll: 0.1, mouse: 0.1, click: 0.99, wait: 0.01 }, // Click all the things!
	ruleSlawyer: { scroll: 0.9, mouse: 0.6, click: 0.5, wait: 0.7 }, // Read everything twice

};

/**
 * Selects a random persona.
 */
function selectPersona() {
	const personaKeys = Object.keys(personas);
	return personaKeys[Math.floor(Math.random() * personaKeys.length)];
}

/**
 * Generates an action sequence based on a persona's weighting.
 * @param {string} persona - The selected persona.
 * @param {number} maxActions - Maximum number of actions (optional).
 */
function generatePersonaActionSequence(persona, maxActions = null) {
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
function generateWeightedRandomActionSequence(actionTypes, weights, maxActions = null) {
	const sequence = [];
	// More comprehensive sessions - users engage deeply with content
	// Use maxActions if provided, otherwise use default range
	const length = maxActions ? Math.min(maxActions, u.rand(25, 100)) : u.rand(25, 100);

	// Create a more natural flow with better variety for longer sessions
	let lastAction = '';
	let consecutiveScrolls = 0;
	let consecutiveClicks = 0;
	let consecutiveWaits = 0;
	let actionsSinceLastWait = 0;

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
async function clickStuff(page) {
	try {
		// Get all potentially clickable elements with priority scoring
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
		const currentMouse = await page.mouse;
		await moveMouse(page,
			u.rand(0, page.viewport().width),
			u.rand(0, page.viewport().height),
			targetX,
			targetY
		);

		// Brief realistic pause before clicking
		if (Math.random() < 0.2) await u.sleep(u.rand(50, 200));

		// Quick, confident click
		await page.mouse.click(targetX, targetY, {
			delay: u.rand(30, 80),
			count: 1,
			button: 'left'
		});

		log(`    └─ 👆 <span style="color: #00ff00;">Clicked</span> ${selectedInfo.tag}: "<span style="color: #ffff88;">${selectedInfo.text}</span>" <span style="color: #888;">(priority: ${selectedInfo.priority})</span>`);

		// Very brief pause after click
		if (Math.random() < 0.3) await u.sleep(u.rand(100, 300));

		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Intelligent scrolling that feels natural and content-aware
 */
async function intelligentScroll(page) {
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
		if (scrollInfo.targets.length > 0 && Math.random() < 0.7) {
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

		// Wait for scroll to complete
		await u.sleep(u.rand(400, 800));

		log(`    └─ 📜 <span style="color: #00aaff;">Scrolled</span> to position <span style="color: #ffff88;">${Math.round(targetScroll)}</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Natural mouse movement without clicking - simulates reading/hovering behavior
 */
async function naturalMouseMovement(page) {
	try {
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

		const target = contentInfo[Math.floor(Math.random() * contentInfo.length)];

		// Add some randomness to the target position
		const targetX = target.x + u.rand(-target.width * 0.3, target.width * 0.3);
		const targetY = target.y + u.rand(-target.height * 0.3, target.height * 0.3);

		await moveMouse(page,
			u.rand(0, page.viewport().width),
			u.rand(0, page.viewport().height),
			targetX,
			targetY
		);

		// Brief pause as if reading
		await u.sleep(u.rand(200, 500));

		log(`    └─ 🖱️ <span style="color: #88aaff;">Mouse moved</span> to content area <span style="color: #888;">(reading behavior)</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Very short pause to simulate natural user rhythm
 */
async function shortPause(page) {
	await u.sleep(u.rand(50, 200));
	log(`    └─ ⏸️ <span style="color: #888;">Brief pause</span> (${u.rand(50, 200)}ms)`);
	return true;
}

async function randomMouse(page) {
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
async function moveMouse(page, startX, startY, endX, endY) {
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

function generateHumanizedPath(startX, startY, endX, endY, steps) {
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
async function randomScroll(page) {
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


function bezierPoint(p0, p1, p2, p3, t) {
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
function weightedRandom(items, weights) {
	const totalWeight = items.reduce((sum, item) => sum + weights[item], 0);
	const randomValue = Math.random() * totalWeight;
	let cumulativeWeight = 0;

	for (const item of items) {
		cumulativeWeight += weights[item];
		if (randomValue < cumulativeWeight) return item;
	}
}


function coinFlip() {
	return Math.random() < 0.5;
}




if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const local = u.timer('headless');
	local.start();
	const result = await main({ concurrency: 1, users: 1, headless: false, url: "https://soundcloud.com" });
	local.stop(true);

	if (NODE_ENV === 'dev') debugger;
}
