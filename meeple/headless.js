import dotenv from 'dotenv';
dotenv.config();
import pLimit from 'p-limit';
import u from 'ak-tools';

/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

// Import from new modular structure
import { ensurePageSetup, retry, relaxCSP } from './security.js';
import { selectPersona, generatePersonaActionSequence, getContextAwareAction } from './personas.js';
import { wait, exploratoryClick, rageClick, moveMouse, clickStuff, intelligentScroll, naturalMouseMovement, hoverOverElements, randomMouse, randomScroll, CLICK_FUZZINESS } from './interactions.js';
import { interactWithForms } from './forms.js';
import { navigateBack, navigateForward } from './navigation.js';
import { identifyHotZones } from './hotzones.js';
import { getRandomTimestampWithinLast5Days } from './analytics.js';
import { launchBrowser, createPage, navigateToUrl, getPageInfo, closeBrowser } from './browser.js';
import { randomBetween, sleep, clamp } from './utils.js';
import { puppeteerArgs } from './entities.js';

const { NODE_ENV = "" } = process.env;
let { MIXPANEL_TOKEN = "" } = process.env;
if (!NODE_ENV) throw new Error("NODE_ENV is required");

/**
 * Main function to simulate user behavior.
 * @param {Object} PARAMS - Configuration parameters
 * @param {Function} logFunction - Optional logging function for real-time updates
 * @returns {Promise<Array>} Array of simulation results
 */
export default async function main(PARAMS = {}, logFunction = null) {
	// Guard against missing logger for tests - fallback to console.log
	const log = logFunction || ((message) => console.log(message));
	let { 
		url = "https://ak--47.github.io/fixpanel/",
		users = 10,
		concurrency = 5,
		headless = true,
		inject = true,
		past = false,
		token = "",
		maxActions = null,
		masking = false
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
					log(`🚀 <span style="color: #7856FF; font-weight: bold;">Spawning ${usersHandle}</span> (${i + 1}/${users}) on <span style="color: #80E1D9;">${url}</span>...`, usersHandle);

					const result = await simulateUser(url, headless, inject, past, maxActions, usersHandle, { masking }, log);

					if (result && !result.error && !result.timedOut) {
						log(`✅ <span style="color: #07B096;">${usersHandle} completed!</span> Session data captured.`, usersHandle);
						log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					} else if (result && result.timedOut) {
						log(`⏰ <span style="color: #F8BC3B;">${usersHandle} timed out</span> - but simulation continues`, usersHandle);
						log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					} else {
						log(`⚠️ <span style="color: #F8BC3B;">${usersHandle} completed with issues</span> - but simulation continues`, usersHandle);
						log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					}

					resolve(result || { error: 'Unknown error', user: i + 1 });
				} catch (e) {
					const errorMsg = e.message || 'Unknown error';
					log(`❌ <span style="color: #CC332B;">${usersHandle} failed:</span> ${errorMsg} - <span style="color: #888;">continuing with other users</span>`, usersHandle);
					log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
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

	// Enhanced simulation summary for general tab
	log(`📊 <span style="color: #7856FF;">Simulation Summary:</span> ${successful}/${users} successful, ${timedOut} timed out, ${crashed} crashed, ${failed} rejected`);

	// Calculate total actions performed
	let totalActions = 0;
	let totalSuccessfulActions = 0;
	
	// Return the actual results, filtering out any undefined values
	const finalResults = results.map(r => {
		if (r.status === 'fulfilled') {
			const result = r.value;
			if (result && result.actions) {
				totalActions += result.actions.length;
				totalSuccessfulActions += result.actions.filter(action => action.success !== false).length;
			}
			return result;
		} else {
			log(`⚠️ <span style="color: #CC332B;">Promise rejected:</span> ${r.reason?.message || 'Unknown error'}`);
			return { error: r.reason?.message || 'Promise rejected', crashed: true };
		}
	}).filter(Boolean);

	// Send detailed summary to general tab (null meepleId)
	log(``, null); // Empty line
	log(`🎯 <span style="color: #07B096;">Mission Accomplished!</span>`, null);
	log(`📈 Total Actions Performed: ${totalActions}`, null);
	log(`✅ Successful Actions: ${totalSuccessfulActions}`, null);
	log(`📊 Action Success Rate: ${totalActions > 0 ? ((totalSuccessfulActions / totalActions) * 100).toFixed(1) : 0}%`, null);
	log(`🤖 Meeple Performance:`, null);
	log(`  ├─ ✅ Completed successfully: ${successful}`, null);
	if (timedOut > 0) log(`  ├─ ⏰ Timed out: ${timedOut}`, null);
	if (crashed > 0) log(`  ├─ 💥 Crashed: ${crashed}`, null);
	if (failed > 0) log(`  └─ ❌ Failed to start: ${failed}`, null);
	log(``, null); // Empty line
	log(`🎉 All meeples have completed their digital adventures!`, null);

	return finalResults;
}

/**
 * Simulate a single user session
 * @param {string} url - Target URL
 * @param {boolean} headless - Run in headless mode
 * @param {boolean} inject - Inject Mixpanel
 * @param {boolean} past - Simulate past time
 * @param {number} maxActions - Maximum actions per session
 * @param {string} usersHandle - User identifier
 * @param {Object} opts - Additional options
 * @param {Function} logFunction - Logging function
 */
export async function simulateUser(url, headless = true, inject = true, past = false, maxActions = null, usersHandle = null, opts = {}, logFunction = console.log) {
	// Create user-specific logger that automatically includes the usersHandle
	const log = usersHandle ? (message) => logFunction(message, usersHandle) : logFunction;

	// Generate a unique location for this meeple
	function generateLocation() {
		const cities = [
			[40.7128, -74.0060], // New York
			[51.5074, -0.1278],  // London
			[35.6762, 139.6503], // Tokyo
			[48.8566, 2.3522],   // Paris
			[34.0522, -118.2437], // Los Angeles
			[-33.8688, 151.2093], // Sydney
			[55.7558, 37.6173],  // Moscow
			[39.9042, 116.4074], // Beijing
			[19.0760, 72.8777],  // Mumbai
			[-23.5505, -46.6333] // São Paulo
		];

		const city = cities[Math.floor(Math.random() * cities.length)];
		const radius = 2; // degrees (~200km)

		const lat = city[0] + (Math.random() - 0.5) * radius;
		const lon = city[1] + (Math.random() - 0.5) * radius;

		return {
			lat: parseFloat(lat.toFixed(6)),
			lon: parseFloat(lon.toFixed(6))
		};
	}

	const meepleLocation = generateLocation();
	log(`🌍 <span style="color: #80E1D9;">${usersHandle}</span> location: ${meepleLocation.lat}, ${meepleLocation.lon}`);

	// Add location to opts for this meeple
	const meepleOpts = { ...opts, location: meepleLocation };

	const totalTimeout = 10 * 60 * 1000;  // max 10 min / user
	const timeoutPromise = new Promise((resolve) =>
		setTimeout(() => {
			resolve({ timedOut: true, error: 'Session timeout' });
		}, totalTimeout)
	);

	let browser;

	// Define the user session simulation promise
	const simulationPromise = (async () => {
		try {
			browser = await launchBrowser(headless, log);
			const page = await createPage(browser, log);
			page.MIXPANEL_TOKEN = MIXPANEL_TOKEN


			// Validate and navigate to URL
			try {
				new URL(url); // This will throw if URL is invalid
			} catch (urlError) {
				throw new Error(`Invalid URL provided: ${url} - ${urlError.message}`);
			}

			await navigateToUrl(page, url, log);
			// Set up page environment
			await ensurePageSetup(page, usersHandle, inject, meepleOpts, log);
			await sleep(randomBetween(50, 250)); // Random sleep to simulate human behavior (was 100-500ms)

			const pageInfo = await getPageInfo(page, log);
			log(`📄 Page loaded: "${pageInfo.title}"`);

			// Identify hot zones for intelligent targeting
			const hotZones = await identifyHotZones(page, log);
			log(`🎯 <span style="color: #7856FF;">Hot zones identified:</span> ${hotZones.length} priority elements`);
			
			// Select persona and generate action sequence
			const persona = selectPersona(log);
			const actionSequence = generatePersonaActionSequence(persona, maxActions);
			
			log(`🎭 <span style="color: #7856FF;">Persona:</span> ${persona}, ${actionSequence.length} actions planned`);

			const startTime = Date.now();
			const actionResults = await simulateUserSession(page, actionSequence, hotZones, persona, usersHandle, meepleOpts, log);
			
			await closeBrowser(browser);
			
			const durationSec = Math.round((Date.now() - startTime) / 1000);
			log(`⏱️ <span style="color: #7856FF;">Session completed in ${durationSec}s</span>`);
			
			return {
				actions: actionResults,
				duration: durationSec,
				persona,
				success: true
			};

		} catch (error) {
			if (browser) {
				await closeBrowser(browser);
			}
			log(`🚨 <span style="color: #CC332B;">Session error:</span> ${error.message}`);
			return { error: error.message, timedOut: false };
		}
	})();

	// Use Promise.race to handle timeout
	try {
		return await Promise.race([simulationPromise, timeoutPromise]);
	} catch (error) {
		if (browser) {
			try {
				await closeBrowser(browser);
			} catch (closeError) {
				log(`⚠️ Browser close error: ${closeError.message}`);
			}
		}
		return { error: error.message || 'Unknown error', timedOut: false };
	}
}

/**
 * Execute the main user session with action sequence
 * @param {Page} page - Puppeteer page object
 * @param {Array} actionSequence - Array of actions to perform
 * @param {Array} hotZones - Array of identified hot zones
 * @param {string} persona - Selected persona type
 * @param {string} usersHandle - User identifier
 * @param {Object} opts - Options object
 * @param {Function} log - Logging function
 * @returns {Promise<Array>} Array of completed actions
 */
async function simulateUserSession(page, actionSequence, hotZones, persona, usersHandle, opts, log) {
	const actionResults = [];
	const actionHistory = [];
	const hoverHistory = []; // Track hover interactions for return visit behavior
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = 5;
	let currentUrl = page.url(); // Track URL changes for hot zone re-detection

	const actionEmojis = {
		click: '🖱️',
		exploratoryClick: '🎯',
		rageClick: '😡',
		scroll: '📜',
		mouse: '🖱️',
		randomMouse: '🎲',
		randomScroll: '🎯',
		hover: '👁️',
		wait: '⏸️',
		form: '📝',
		back: '⬅️',
		forward: '➡️'
	};

	for (const [index, originalAction] of actionSequence.entries()) {
		// Apply context-aware action selection
		const action = getContextAwareAction(actionHistory, originalAction, log);
		
		const emoji = actionEmojis[action] || '🎯';
		const contextNote = action !== originalAction ? ` <span style="color: #888;">(adapted from ${originalAction})</span>` : '';
		log(`  ├─ ${emoji} <span style="color: #FF7557;">Action ${index + 1}/${actionSequence.length}</span>: ${action}${contextNote}`);

		let funcToPerform;
		// Check for URL changes and re-identify hot zones if needed
		const newUrl = page.url();
		if (newUrl !== currentUrl) {
			log(`🔄 URL changed, re-identifying hot zones...`);
			hotZones.length = 0; // Clear existing hot zones
			const newHotZones = await identifyHotZones(page, log);
			hotZones.push(...newHotZones);
			currentUrl = newUrl;
			log(`🎯 Updated: ${hotZones.length} hot zones identified`);
		}

		switch (action) {
			case "click":
			case "exploratoryClick":
				funcToPerform = () => clickStuff(page, hotZones, log);
				break;
			case "rageClick":
				funcToPerform = () => rageClick(page, log);
				break;
			case "scroll":
				funcToPerform = () => intelligentScroll(page, hotZones, log);
				break;
			case "mouse":
				funcToPerform = () => naturalMouseMovement(page, hotZones, log);
				break;
			case "randomMouse":
				funcToPerform = () => randomMouse(page, log);
				break;
			case "randomScroll":
				funcToPerform = () => randomScroll(page, log);
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
			case "wait":
				funcToPerform = () => wait();
				break;
			default:
				funcToPerform = () => wait();
				break;
		}

		try {
			// Ensure page setup before each action
			await ensurePageSetup(page, usersHandle, opts.inject !== false, opts, log);

			// Execute action with timeout
			const actionTimeout = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Action timeout')), 30000)
			);

			await Promise.race([funcToPerform(), actionTimeout]);
			
			actionResults.push(action);
			consecutiveFailures = 0; // Reset failure count on success
			actionHistory.push({
				action,
				success: true,
				timestamp: Date.now()
			});

		} catch (actionError) {
			consecutiveFailures++;
			log(`    ├─ ⚠️ <span style="color: #F8BC3B;">Action failed:</span> ${actionError.message}`);
			
			actionHistory.push({
				action,
				success: false,
				error: actionError.message,
				timestamp: Date.now()
			});

			// Circuit breaker: stop if too many consecutive failures
			if (consecutiveFailures >= maxConsecutiveFailures) {
				log(`    └─ 🚨 <span style="color: #CC332B;">Too many consecutive failures (${consecutiveFailures}), terminating session</span>`);
				break;
			}
		}

		// Random sleep between actions
		await sleep(randomBetween(500, 2000));
	}

	return actionResults;
}

// performScroll function removed - unused (intelligentScroll from interactions.js is used instead)