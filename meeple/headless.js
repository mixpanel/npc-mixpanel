// @ts-nocheck - This file heavily manipulates browser DOM elements with runtime types --- IGNORE ---
import dotenv from 'dotenv';
dotenv.config();
import pLimit from 'p-limit';
import u from 'ak-tools';

/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

// Import from new modular structure
import { ensurePageSetup } from './security.js';
import { selectPersona, pickNextAction } from './personas.js';
import {
	wait,
	contextPause,
	createMouseState,
	exploratoryClick,
	rageClick,
	clickStuff,
	intelligentScroll,
	naturalMouseMovement,
	hoverOverElements,
	navigateToNewPage,
	deadClick,
	confusedBehavior
} from './interactions.js';
import { interactWithForms } from './forms.js';
import { navigateBack, navigateForward } from './navigation.js';
import { identifyHotZones } from './hotzones.js';
import {
	launchBrowser,
	createPage,
	navigateToUrl,
	getPageInfo,
	closeBrowser,
	applyNetworkThrottling,
	enableChaosMode
} from './browser.js';
import { executeSequence } from './sequences.js';
import { forceSpoofTimeInBrowser, registerMeepleProps } from './analytics.js';
import { personas } from './entities.js';
import { generatePhaseSchedule, getPhaseForProgress, applyPhaseModifiers } from './phases.js';
import { randomBetween, sleep, isDomainMatch } from './utils.js';

const { NODE_ENV = '' } = process.env;
let { MIXPANEL_TOKEN = '' } = process.env;
if (!NODE_ENV) throw new Error('NODE_ENV is required');

/**
 * Main function to simulate user behavior.
 * @param {import('../index.js').MeepleParams} PARAMS - Configuration parameters
 * @param {import('../index.js').LogFunction} [logFunction] - Optional logging function for real-time updates
 * @returns {Promise<import('../index.js').SimulationResult[]>} Array of simulation results
 */
export default async function main(PARAMS = {}, logFunction = null) {
	// Guard against missing logger for tests - fallback to console.log
	const log = logFunction || (message => console.log(message));
	let {
		url = 'https://mixpanel.github.io/fixpanel/',
		users = 10,
		concurrency = 10,
		headless = true,
		inject = true,
		past = false,
		token = '',
		maxActions = null,
		masking = false,
		sequences = null,
		// Friction behaviors
		networkProfile = 'fast',
		chaosMode = false,
		chaosFailRate = 0.15,
		formMistakes = false,
		// 1.1.0 persona controls
		persona: personaOverride = null,
		personaWeights = null
	} = PARAMS;

	if (url === 'fixpanel') url = `https://mixpanel.github.io/fixpanel/`;
	if (users > 25) users = 25;
	if (concurrency > 10) concurrency = 10;
	const limit = pLimit(concurrency);
	if (token) MIXPANEL_TOKEN = token;
	if (NODE_ENV === 'production') headless = true; // Always headless in production

	// Prepare sequence distribution if sequences are provided
	let sequenceNames = [];
	if (sequences && typeof sequences === 'object') {
		sequenceNames = Object.keys(sequences);
		log(
			`🎯 <span style="color: #7856FF;">Deterministic sequences detected:</span> ${sequenceNames.length} sequence(s) available`
		);
		sequenceNames.forEach(name => {
			const seq = sequences[name];
			log(
				`  ├─ "${name}": ${seq.description || 'No description'} (temp: ${seq.temperature || 5}, ${seq.actions?.length || 0} actions)`
			);
		});
	}

	const userPromises = Array.from({ length: users }, (_, i) => {
		return limit(() => {
			// Generate unique username for this meeple
			const usersHandle = u.makeName(3, '-');

			// Select sequence for this user if sequences are available
			let selectedSequence = null;
			let selectedSequenceName = null;
			if (sequenceNames.length > 0) {
				// Distribute sequences evenly among users, with cycling if more users than sequences
				selectedSequenceName = sequenceNames[i % sequenceNames.length];
				selectedSequence = sequences[selectedSequenceName];
				log(
					`🎯 <span style="color: #9B59B6;">${usersHandle} assigned sequence:</span> "${selectedSequenceName}"`,
					usersHandle
				);
			}

			log(
				`🚀 <span style="color: #7856FF; font-weight: bold;">Spawning ${usersHandle}</span> (${i + 1}/${users}) on <span style="color: #80E1D9;">${url}</span>...`,
				usersHandle
			);

			// Return the promise directly from simulateUser, handling success/error cases
			return simulateUser(
				url,
				headless,
				inject,
				past,
				maxActions,
				usersHandle,
				{
					masking,
					sequence: selectedSequence,
					sequenceName: selectedSequenceName,
					networkProfile,
					chaosMode,
					chaosFailRate,
					formMistakes,
					personaOverride,
					personaWeights
				},
				log
			)
				.then(result => {
					if (result && !result.error && !result.timedOut) {
						log(
							`✅ <span style="color: #07B096;">${usersHandle} completed!</span> Session data captured.`,
							usersHandle
						);
						log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					} else if (result && result.timedOut) {
						log(
							`⏰ <span style="color: #F8BC3B;">${usersHandle} timed out</span> - but simulation continues`,
							usersHandle
						);
						log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					} else {
						log(
							`⚠️ <span style="color: #F8BC3B;">${usersHandle} completed with issues</span> - but simulation continues`,
							usersHandle
						);
						log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					}

					return result || { error: 'Unknown error', user: i + 1 };
				})
				.catch(e => {
					const errorMsg = e.message || 'Unknown error';
					log(
						`❌ <span style="color: #CC332B;">${usersHandle} failed:</span> ${errorMsg} - <span style="color: #888;">continuing with other users</span>`,
						usersHandle
					);
					log(`🔚 ${usersHandle} simulation complete.`, usersHandle); // Final completion message for tab closure
					return { error: errorMsg, user: i + 1, crashed: true };
				});
		});
	});

	// Use Promise.allSettled instead of Promise.all to prevent one failure from stopping everything
	const results = await Promise.allSettled(userPromises);

	// Process results and provide summary
	// @ts-ignore
	const successful = results.filter(
		r => r.status === 'fulfilled' && r.value && !r.value.error && !r.value.crashed
	).length;
	// @ts-ignore
	const timedOut = results.filter(r => r.status === 'fulfilled' && r.value && r.value.timedOut).length;
	// @ts-ignore
	const crashed = results.filter(r => r.status === 'fulfilled' && r.value && r.value.crashed).length;
	const failed = results.filter(r => r.status === 'rejected').length;

	// Enhanced simulation summary for general tab
	log(
		`📊 <span style="color: #7856FF;">Simulation Summary:</span> ${successful}/${users} successful, ${timedOut} timed out, ${crashed} crashed, ${failed} rejected`
	);

	// Calculate total actions performed
	let totalActions = 0;
	let totalSuccessfulActions = 0;

	// Return the actual results, filtering out any undefined values
	const finalResults = results
		.map(r => {
			if (r.status === 'fulfilled') {
				const result = r.value;
				if (result && result.actions) {
					totalActions += result.actions.length;
					totalSuccessfulActions += result.actions.filter(action => action.success !== false).length;
				}
				return result;
			} else {
				log(`⚠️ <span style="color: #CC332B;">Promise rejected:</span> ${r.reason?.message || 'Unknown error'}`);
				return {
					error: r.reason?.message || 'Promise rejected',
					crashed: true
				};
			}
		})
		.filter(Boolean);

	// Send detailed summary to general tab (null meepleId)
	log(``, null); // Empty line
	log(`🎯 <span style="color: #07B096;">Mission Accomplished!</span>`, null);
	log(`📈 Total Actions Performed: ${totalActions}`, null);
	log(`✅ Successful Actions: ${totalSuccessfulActions}`, null);
	log(
		`📊 Action Success Rate: ${totalActions > 0 ? ((totalSuccessfulActions / totalActions) * 100).toFixed(1) : 0}%`,
		null
	);
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
 * @param {boolean} [headless=true] - Run in headless mode
 * @param {boolean} [inject=true] - Inject Mixpanel
 * @param {boolean} [past=false] - Simulate past time
 * @param {number|null} [maxActions=null] - Maximum actions per session
 * @param {string|null} [usersHandle=null] - User identifier
 * @param {import('../index.js').MeepleOptions} [opts={}] - Additional options
 * @param {import('../index.js').LogFunction} [logFunction=console.log] - Logging function
 * @returns {Promise<import('../index.js').SimulationResult>} Simulation result
 */
export async function simulateUser(
	url,
	headless = true,
	inject = true,
	past = false,
	maxActions = null,
	usersHandle = null,
	opts = {},
	logFunction = console.log
) {
	// Create user-specific logger that automatically includes the usersHandle
	const log = usersHandle ? message => logFunction(message, usersHandle) : logFunction;

	// Generate a unique location for this meeple
	function generateLocation() {
		const cities = [
			[40.7128, -74.006], // New York
			[51.5074, -0.1278], // London
			[35.6762, 139.6503], // Tokyo
			[48.8566, 2.3522], // Paris
			[34.0522, -118.2437], // Los Angeles
			[-33.8688, 151.2093], // Sydney
			[55.7558, 37.6173], // Moscow
			[39.9042, 116.4074], // Beijing
			[19.076, 72.8777], // Mumbai
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

	const totalTimeout = 10 * 60 * 1000; // max 10 min / user
	const timeoutPromise = new Promise(resolve =>
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
			page.MIXPANEL_TOKEN = MIXPANEL_TOKEN;

			// Spoof Date.now() in browser BEFORE navigation so site's Mixpanel SDK
			// uses past timestamps. Must run before navigateToUrl.
			if (past) {
				await forceSpoofTimeInBrowser(page, log);
			}

			// Apply friction behaviors if configured
			if (meepleOpts.networkProfile && meepleOpts.networkProfile !== 'fast') {
				await applyNetworkThrottling(page, meepleOpts.networkProfile, log);
			}
			if (meepleOpts.chaosMode) {
				await enableChaosMode(page, meepleOpts.chaosFailRate || 0.15, log);
			}

			// Validate and navigate to URL
			let navigationUrl;
			try {
				const urlObj = new URL(url);

				// Add meeple tracking parameters for Mixpanel analytics
				urlObj.searchParams.set('IS_MEEPLE', 'true');
				urlObj.searchParams.set('MEEPLE_ID', usersHandle);
				if (opts.sequenceName) {
					urlObj.searchParams.set('SEQUENCE', opts.sequenceName);
				}

				navigationUrl = urlObj.toString();
			} catch (urlError) {
				throw new Error(`Invalid URL provided: ${url} - ${urlError.message}`);
			}

			await navigateToUrl(page, navigationUrl, log, meepleOpts);
			// Set up page environment
			await ensurePageSetup(page, usersHandle, inject, meepleOpts, log);
			await sleep(randomBetween(50, 250)); // Random sleep to simulate human behavior (was 100-500ms)

			const pageInfo = await getPageInfo(page, log);
			log(`📄 Page loaded: "${pageInfo.title}"`);

			// Identify hot zones for intelligent targeting
			const hotZones = await identifyHotZones(page);
			log(`🎯 <span style="color: #7856FF;">Hot zones identified:</span> ${hotZones.length} priority elements`);

			// Select persona — honoring optional API override / custom frequency weights
			const persona = selectPersona(log, {
				override: meepleOpts.personaOverride || null,
				weights: meepleOpts.personaWeights || null
			});
			let actionResults;
			const startTime = Date.now();

			// Check if a deterministic sequence is provided
			let circuitBreakerTriggered = false;
			let failedActions = [];

			if (meepleOpts.sequence && meepleOpts.sequenceName) {
				log(`🎯 <span style="color: #9B59B6;">Executing deterministic sequence:</span> "${meepleOpts.sequenceName}"`);
				log(`🎭 <span style="color: #7856FF;">Persona:</span> ${persona} (for fallback actions)`);

				// Execute the deterministic sequence
				const sequenceResult = await executeSequence(
					page,
					meepleOpts.sequence,
					hotZones,
					persona,
					usersHandle,
					meepleOpts,
					log
				);

				// Handle new return format from executeSequence
				actionResults = sequenceResult.actionResults || sequenceResult;
				circuitBreakerTriggered = sequenceResult.circuitBreakerTriggered || false;
				failedActions = sequenceResult.failedActions || [];
			} else {
				// Duration-driven session — picks one action at a time, paced to fit persona's
				// sessionDuration window. maxActions still acts as a hard ceiling if provided.
				log(`🎭 <span style="color: #7856FF;">Persona:</span> ${persona} (duration-driven session)`);

				actionResults = await simulateUserSession(
					page,
					hotZones,
					persona,
					usersHandle,
					{ ...meepleOpts, maxActions },
					log
				);
			}

			await closeBrowser(browser);

			const durationSec = Math.round((Date.now() - startTime) / 1000);
			log(`⏱️ <span style="color: #7856FF;">Session completed in ${durationSec}s</span>`);

			const result = {
				actions: actionResults,
				duration: durationSec,
				persona,
				sequence: meepleOpts.sequenceName || null,
				success: true
			};

			// Add circuit breaker metadata if a sequence was executed
			if (meepleOpts.sequence && meepleOpts.sequenceName) {
				result.circuit_breaker_triggered = circuitBreakerTriggered;
				if (failedActions.length > 0) {
					result.failed_actions = failedActions;
				}
			}

			return result;
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
 * Execute the main user session — duration-driven loop with phase-modulated action selection.
 *
 * Each tick:
 *   1. Compute current phase from elapsed/target ratio
 *   2. Apply phase modifiers to persona's base action weights
 *   3. Pick next action (with safety valve against catatonic non-click streaks)
 *   4. Execute action
 *   5. Pause between actions via contextPause (tier depends on prev/next/phase/persona)
 *
 * Loop exit conditions:
 *   - elapsedTime >= targetDuration (the normal exit)
 *   - opts.maxActions hard ceiling reached (when provided)
 *   - consecutive failures >= maxConsecutiveFailures
 *
 * @param {Page} page - Puppeteer page object
 * @param {Array} hotZones - Array of identified hot zones
 * @param {string} persona - Selected persona type
 * @param {string} usersHandle - User identifier
 * @param {Object} opts - Options object (may include maxActions, chaosMode, etc.)
 * @param {Function} log - Logging function
 * @returns {Promise<Array>} Array of completed action names
 */
async function simulateUserSession(page, hotZones, persona, usersHandle, opts, log) {
	const personaConfig = personas[persona] || {};
	const [minMin, maxMin] = personaConfig.sessionDuration || [2, 5];
	const targetDurationMs = (minMin + Math.random() * (maxMin - minMin)) * 60 * 1000;
	const phaseSchedule = generatePhaseSchedule();
	const sessionStart = Date.now();
	const baseWeights = personaConfig.actionWeights || {};
	const hardCeiling = opts.maxActions || null;
	const mouseState = createMouseState(page.viewport());

	// Domain boundary recovery — page.url() is post-navigation, use it as genesis
	const genesisUrl = page.url();
	let genesisDomain = '';
	try {
		genesisDomain = new URL(genesisUrl).hostname;
	} catch {
		// genesisUrl might be about:blank — leave empty, isDomainMatch handles it
	}

	// Login-trap recovery: per-URL-path consecutive form-fill failure counter
	const formFailures = new Map();
	const FORM_FAILURE_THRESHOLD = 3;

	log(
		`⏱️ <span style="color: #7856FF;">Target session duration:</span> ${(targetDurationMs / 1000).toFixed(0)}s ` +
			`(persona: ${persona}, range: ${minMin}-${maxMin}min)`
	);

	const actionResults = [];
	const actionHistory = []; // [{ action, success, timestamp }]
	const hoverHistory = [];
	let consecutiveFailures = 0;
	let consecutiveNonClicks = 0;
	const maxConsecutiveFailures = 5;
	let currentUrl = page.url();
	let currentPhase = 'arrival';
	let actionIndex = 0;

	// Action counts for Mixpanel super props (updated periodically)
	const actionCounts = {
		click: 0,
		scroll: 0,
		hover: 0,
		navigate: 0,
		form: 0,
		mouse: 0,
		other: 0
	};
	const visitedPaths = new Set();
	visitedPaths.add(pageUrlPath(page));

	// Register super props at session start (Mixpanel is injected by ensurePageSetup above)
	if (opts.inject !== false) {
		await registerMeepleProps(
			page,
			{
				meeple: true,
				meeple_id: usersHandle,
				meeple_persona: persona,
				meeple_starting_page: genesisUrl,
				meeple_session_target_duration_sec: Math.round(targetDurationMs / 1000),
				meeple_phase: 'arrival',
				meeple_actions: { ...actionCounts }
			},
			log
		);
	}

	const actionEmojis = {
		click: '🖱️',
		exploratoryClick: '🎯',
		rageClick: '😡',
		scroll: '📜',
		mouse: '🖱️',
		hover: '👁️',
		wait: '⏸️',
		form: '📝',
		back: '⬅️',
		forward: '➡️',
		navigate: '🧭',
		deadClick: '💀',
		confusedBehavior: '🤔'
	};

	while (Date.now() - sessionStart < targetDurationMs) {
		if (hardCeiling && actionIndex >= hardCeiling) {
			log(`    └─ 🛑 maxActions ceiling (${hardCeiling}) reached`);
			break;
		}

		const elapsed = Date.now() - sessionStart;
		const progress = elapsed / targetDurationMs;
		const newPhase = getPhaseForProgress(progress, phaseSchedule);
		if (newPhase !== currentPhase) {
			log(
				`🌀 <span style="color: #9B59B6;">Phase transition:</span> ${currentPhase} → ${newPhase} ` +
					`<span style="color: #888;">(${(progress * 100).toFixed(0)}%)</span>`
			);
			currentPhase = newPhase;
		}

		// Phase-modulated weights for this tick
		const tickWeights = applyPhaseModifiers(baseWeights, currentPhase, personaConfig.phaseModifiers);

		// Action selection — chaos mode may inject friction behaviors
		const recentActionNames = actionHistory.slice(-10).map(h => h.action);
		let action;
		if (opts.chaosMode) {
			const roll = Math.random();
			if (roll < 0.1) action = 'deadClick';
			else if (roll < 0.15) action = 'confusedBehavior';
			else action = pickNextAction(tickWeights, persona, recentActionNames, consecutiveNonClicks);
		} else {
			action = pickNextAction(tickWeights, persona, recentActionNames, consecutiveNonClicks);
		}

		const previousAction = actionHistory.length ? actionHistory[actionHistory.length - 1].action : null;
		const emoji = actionEmojis[action] || '🎯';
		const elapsedSec = (elapsed / 1000).toFixed(0);
		const targetSec = (targetDurationMs / 1000).toFixed(0);
		log(
			`  ├─ ${emoji} <span style="color: #FF7557;">Action ${actionIndex + 1}</span> ` +
				`<span style="color: #888;">[${elapsedSec}s/${targetSec}s · ${currentPhase}]</span>: ${action}`
		);

		// Re-identify hot zones if URL changed
		const newUrl = page.url();
		if (newUrl !== currentUrl) {
			log(`🔄 URL changed, re-identifying hot zones...`);
			hotZones.length = 0;
			const newHotZones = await identifyHotZones(page);
			hotZones.push(...newHotZones);
			currentUrl = newUrl;
			visitedPaths.add(pageUrlPath(page));
			log(`🎯 Updated: ${hotZones.length} hot zones identified`);
		}

		const funcToPerform = resolveActionHandler(
			action,
			page,
			hotZones,
			persona,
			hoverHistory,
			mouseState,
			genesisDomain,
			opts,
			log
		);

		try {
			await ensurePageSetup(page, usersHandle, opts.inject !== false, opts, log);

			const actionTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Action timeout')), 30000));
			const actionResult = await Promise.race([funcToPerform(), actionTimeout]);

			actionResults.push(action);
			consecutiveFailures = 0;
			actionHistory.push({ action, success: true, timestamp: Date.now() });

			if (action === 'click') consecutiveNonClicks = 0;
			else consecutiveNonClicks++;

			// Bump per-action counter for super props
			if (Object.prototype.hasOwnProperty.call(actionCounts, action)) actionCounts[action]++;
			else actionCounts.other++;

			// Login-trap recovery: track form failures by URL path
			if (action === 'form') {
				const path = pageUrlPath(page);
				if (actionResult === false) {
					const count = (formFailures.get(path) || 0) + 1;
					formFailures.set(path, count);
					log(`    ├─ 📝 Form failure ${count}/${FORM_FAILURE_THRESHOLD} on ${path}`);
					if (count >= FORM_FAILURE_THRESHOLD && genesisUrl && page.url() !== genesisUrl) {
						log(`    └─ 🪤 <span style="color: #CC332B;">Login trap detected</span> on ${path} — escaping to genesis`);
						await escapeToGenesis(page, genesisUrl, log);
						formFailures.clear();
					}
				} else if (actionResult === true) {
					formFailures.delete(path);
				}
			}
		} catch (actionError) {
			consecutiveFailures++;
			log(`    ├─ ⚠️ <span style="color: #F8BC3B;">Action failed:</span> ${actionError.message}`);
			actionHistory.push({ action, success: false, error: actionError.message, timestamp: Date.now() });

			if (action !== 'click') consecutiveNonClicks++;

			if (consecutiveFailures >= maxConsecutiveFailures) {
				log(
					`    └─ 🚨 <span style="color: #CC332B;">Too many consecutive failures (${consecutiveFailures}), terminating session</span>`
				);
				break;
			}
		}

		// Domain boundary check after any action that could navigate (click/navigate/exploratory/back/forward)
		if (genesisDomain && /^(click|exploratoryClick|navigate|back|forward|deadClick)$/.test(action)) {
			if (!isDomainMatch(page.url(), genesisDomain)) {
				await enforceDomainBoundary(page, genesisUrl, genesisDomain, log);
			}
		}

		actionIndex++;

		// Periodic super-props update (every ~10 actions)
		if (opts.inject !== false && actionIndex > 0 && actionIndex % 10 === 0) {
			await registerMeepleProps(
				page,
				{
					meeple_phase: currentPhase,
					meeple_actions: { ...actionCounts },
					meeple_pages_visited: visitedPaths.size
				},
				log
			);
		}

		// Inter-action pause — tier depends on previous/next/phase/persona
		await contextPause(previousAction, action, currentPhase, persona);
	}

	const actualDurationSec = (Date.now() - sessionStart) / 1000;

	// Final super-props update — includes actual duration and full visit summary
	if (opts.inject !== false) {
		await registerMeepleProps(
			page,
			{
				meeple_phase: 'complete',
				meeple_session_actual_duration_sec: Math.round(actualDurationSec),
				meeple_pages_visited: visitedPaths.size,
				meeple_actions: { ...actionCounts }
			},
			log
		);
	}

	log(
		`📊 <span style="color: #07B096;">Session complete:</span> ${actionResults.length} actions in ${actualDurationSec.toFixed(1)}s ` +
			`(target: ${(targetDurationMs / 1000).toFixed(0)}s, final phase: ${currentPhase}, pages: ${visitedPaths.size})`
	);

	return actionResults;
}

/**
 * Resolve an action name to a callable handler. Unknown actions fall back to wait().
 */
function resolveActionHandler(action, page, hotZones, persona, hoverHistory, mouseState, genesisDomain, opts, log) {
	switch (action) {
		case 'click':
			return () => clickStuff(page, hotZones, log, mouseState);
		case 'exploratoryClick':
			return () => exploratoryClick(page, log, mouseState);
		case 'rageClick':
			return () => rageClick(page, log, mouseState);
		case 'scroll':
			// 'randomScroll' was folded into intelligentScroll in 1.1.0 (Phase 3).
			return () => intelligentScroll(page, hotZones, log, mouseState);
		case 'mouse':
		case 'moveMouse':
			// 'randomMouse' was removed in 1.1.0 (Phase 3) — fold into naturalMouseMovement.
			return () => naturalMouseMovement(page, hotZones, log, mouseState);
		case 'hover':
			return () => hoverOverElements(page, hotZones, persona, hoverHistory, log, mouseState);
		case 'form':
			return () => interactWithForms(page, log, { formMistakes: opts.formMistakes, persona });
		case 'navigate':
			return () => navigateToNewPage(page, mouseState, genesisDomain, log);
		case 'deadClick':
			return () => deadClick(page, hotZones, log, mouseState);
		case 'confusedBehavior':
			return () => confusedBehavior(page, log, mouseState);
		case 'back':
			return () => navigateBack(page, log);
		case 'forward':
			return () => navigateForward(page, log);
		case 'wait':
			return () => wait();
		default:
			return () => wait();
	}
}

/**
 * Get the path component of the current page URL for keying form-failure counters.
 * Falls back to "/" on parse errors.
 */
function pageUrlPath(page) {
	try {
		return new URL(page.url()).pathname || '/';
	} catch {
		return '/';
	}
}

/**
 * If the meeple has wandered off the genesis domain, try to recover via goBack
 * up to 2 times. If still off-domain, navigate directly to the genesis URL.
 */
async function enforceDomainBoundary(page, genesisUrl, genesisDomain, log) {
	const offUrl = page.url();
	log(`🛡️ <span style="color: #F8BC3B;">Off-domain:</span> ${offUrl} (genesis: ${genesisDomain}) — recovering...`);
	for (let i = 0; i < 2; i++) {
		try {
			await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
			await sleep(400);
			if (isDomainMatch(page.url(), genesisDomain)) {
				log(`    └─ ↩️ <span style="color: #07B096;">Back-nav recovered:</span> ${page.url()}`);
				return true;
			}
		} catch {
			break;
		}
	}
	log(`    └─ 🏠 <span style="color: #80E1D9;">Returning to genesis URL:</span> ${genesisUrl}`);
	try {
		await page.goto(genesisUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		return true;
	} catch (e) {
		log(`    └─ ⚠️ Genesis recovery failed: ${e.message}`);
		return false;
	}
}

/**
 * Navigate directly to the genesis URL. Used by login-trap recovery.
 */
async function escapeToGenesis(page, genesisUrl, log) {
	try {
		await page.goto(genesisUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		log(`    └─ 🏠 <span style="color: #80E1D9;">Escaped to genesis:</span> ${genesisUrl}`);
	} catch (e) {
		log(`    └─ ⚠️ Escape to genesis failed: ${e.message}`);
	}
}
