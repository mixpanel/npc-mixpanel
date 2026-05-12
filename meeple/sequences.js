// @ts-nocheck - This file has DOM manipulation and complex type issues with sequences
/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import {
	wait,
	naturalMouseMovement,
	intelligentScroll,
	exploratoryClick,
	createMouseState,
	getStartPos,
	updateMouseState,
	moveMouse,
	contextPause,
	hoverOverElements,
	navigateToNewPage
} from './interactions.js';
import { interactWithForms, fillRadioGroup, toggleCheckbox, fillSelectDropdown, fillTextInput } from './forms.js';
import { randomBetween, sleep } from './utils.js';

/**
 * Execute a deterministic sequence of actions with configurable temperature and chaos
 * @param {Page} page - Puppeteer page object
 * @param {import('../index.js').SequenceSpec} sequenceSpec - The sequence specification object
 * @param {import('../index.js').HotZone[]} hotZones - Array of identified hot zones for fallback targeting
 * @param {import('../index.js').PersonaType} persona - Selected persona type
 * @param {string} usersHandle - User identifier for logging
 * @param {import('../index.js').MeepleOptions} opts - Options object
 * @param {import('../index.js').LogFunction} log - Logging function
 * @returns {Promise<import('../index.js').SequenceActionResult[]>} Array of completed actions
 */
export async function executeSequence(page, sequenceSpec, hotZones, persona, usersHandle, opts, log) {
	const {
		description,
		temperature = 5,
		'chaos-range': chaosRange = [1, 1],
		actions = [],
		circuitBreaker = {},
		debug = false,
		// 1.1.x: per-sequence persona override (used for typing speed, dwell durations, pauses)
		persona: sequencePersonaRaw = null
	} = sequenceSpec;
	// Effective persona — sequence-level override wins; falls back to caller-provided persona.
	const effectivePersona = sequencePersonaRaw || persona;
	if (sequencePersonaRaw && sequencePersonaRaw !== persona) {
		log(
			`🎭 <span style="color: #9B59B6;">Sequence persona override:</span> ${sequencePersonaRaw} ` +
				`<span style="color: #888;">(caller persona was ${persona})</span>`
		);
	}

	// Circuit breaker configuration with defaults
	const { maxFailures = 3, resetOnSuccess = true, mode = 'terminate' } = circuitBreaker;

	log(`🎯 <span style="color: #7856FF;">Sequence:</span> ${description}`);
	log(
		`🌡️ <span style="color: #F39C12;">Temperature:</span> ${temperature}/10, Chaos: [${chaosRange[0]}-${chaosRange[1]}]`
	);

	if (debug) {
		log(`🐛 <span style="color: #E67E22;">Debug mode enabled:</span> Verbose logging active`);
		log(
			`🛡️ <span style="color: #E67E22;">Circuit breaker:</span> maxFailures=${maxFailures}, mode=${mode}, resetOnSuccess=${resetOnSuccess}`
		);
	}

	// Calculate effective temperature with chaos multiplier
	const chaosMultiplier = randomBetween(chaosRange[0], chaosRange[1]) / 10;
	const effectiveTemperature = Math.max(0, Math.min(10, temperature * chaosMultiplier));

	log(`🎲 <span style="color: #9B59B6;">Effective temperature:</span> ${effectiveTemperature.toFixed(2)}/10`);

	const actionResults = [];
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = maxFailures;
	let circuitBreakerTriggered = false;

	// 1.1.0: per-session cursor persistence so mouse doesn't teleport between sequence steps
	const mouseState = createMouseState(page.viewport());

	for (const [index, action] of actions.entries()) {
		try {
			// Check if we should follow the sequence or go random based on temperature
			const followSequence = Math.random() * 10 < effectiveTemperature;

			if (followSequence) {
				log(
					`📋 <span style="color: #3498DB;">Action ${index + 1}/${actions.length}:</span> ${action.action} ${action.selector || ''}`
				);

				const result = await executeSequenceAction(page, action, hotZones, log, debug, mouseState, effectivePersona);
				actionResults.push(result);

				// Handle success/failure based on circuit breaker config
				if (result.success || result.skipped) {
					if (resetOnSuccess) {
						if (consecutiveFailures > 0 && debug) {
							log(
								`✅ <span style="color: #27AE60;">Success - resetting failure counter from ${consecutiveFailures} to 0</span>`
							);
						}
						consecutiveFailures = 0;
					}
				} else {
					consecutiveFailures++;
					if (debug) {
						log(
							`⚠️ <span style="color: #E67E22;">Action failed (${consecutiveFailures}/${maxConsecutiveFailures})</span>`
						);
					} else {
						log(`⚠️ <span style="color: #E67E22;">Action failed, continuing...</span>`);
					}
				}
			} else {
				log(`🎲 <span style="color: #9B59B6;">Temperature bypass - random action instead</span>`);
				// Execute a random action instead
				const randomResult = await executeRandomAction(page, hotZones, effectivePersona, log, mouseState);
				actionResults.push(randomResult);
			}

			// Check circuit breaker
			if (consecutiveFailures >= maxConsecutiveFailures) {
				circuitBreakerTriggered = true;
				if (mode === 'terminate') {
					log(
						`🛑 <span style="color: #E74C3C;">Circuit breaker triggered: ${consecutiveFailures} consecutive failures, stopping sequence</span>`
					);
					break;
				} else if (mode === 'skip') {
					log(`⏭️ <span style="color: #F39C12;">Circuit breaker in skip mode: continuing despite failures</span>`);
					// Reset counter to avoid repeated messages
					consecutiveFailures = 0;
				}
			}

			// Add realistic delays and non-state-changing actions between sequence actions
			await addHumanBehavior(page, hotZones, effectivePersona, log, mouseState);
		} catch (error) {
			log(`🚨 <span style="color: #E74C3C;">Sequence action error:</span> ${error.message}`);
			let currentUrl = 'unknown';
			try {
				currentUrl = await page.url();
			} catch (urlError) {
				// Ignore URL fetch errors
			}
			actionResults.push({
				action: action.action,
				selector: action.selector,
				success: false,
				error: error.message,
				reason: 'exception',
				page_url: currentUrl,
				timestamp: Date.now()
			});
			consecutiveFailures++;
		}

		// Break out early if we've hit too many failures (terminate mode only)
		if (consecutiveFailures >= maxConsecutiveFailures && mode === 'terminate') {
			circuitBreakerTriggered = true;
			break;
		}
	}

	log(`✅ <span style="color: #27AE60;">Sequence completed:</span> ${actionResults.length} actions executed`);

	// Return results with circuit breaker metadata
	return {
		actionResults,
		circuitBreakerTriggered,
		failedActions: actionResults.filter(a => !a.success && !a.skipped)
	};
}

/**
 * Execute a specific sequence action (click, type, select)
 * @param {Page} page - Puppeteer page object
 * @param {Object} action - Action specification
 * @param {Array} hotZones - Hot zones for fallback targeting
 * @param {Function} log - Logging function
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} Action result
 */
async function executeSequenceAction(
	page,
	action,
	hotZones,
	log,
	debug = false,
	mouseState = null,
	sequencePersona = null
) {
	const {
		action: actionType,
		selector,
		text,
		value,
		clicksPerGroup,
		requireActive,
		expectsNavigation,
		navigationTimeout = 5000
	} = action;
	const lower = (actionType || '').toLowerCase();
	const startTime = Date.now();
	let currentUrl;

	try {
		try {
			currentUrl = await page.url();
		} catch {
			currentUrl = 'unknown';
		}

		if (!actionType) throw new Error('Invalid action: missing action type');

		if (debug) {
			log(
				`🔍 <span style="color: #95A5A6;">Debug: ${actionType} ${selector || '(no selector)'} on ${currentUrl}</span>`
			);
		}

		// ── Selectorless actions (1.1.x) ────────────────────────────────────
		if (lower === 'navigate') {
			const result = await executeNavigate(page, mouseState, log);
			return wrapResult(result, action, startTime, page);
		}
		if (lower === 'wait') {
			const result = await executeWait(page, action, sequencePersona, log);
			return wrapResult(result, action, startTime, page);
		}
		if (lower === 'scroll' && !selector) {
			const result = await executePageScroll(page, action, hotZones, mouseState, log);
			return wrapResult(result, action, startTime, page);
		}

		// Special handling for fillOutForm — finds multiple elements
		if (lower === 'filloutform') {
			if (!selector) throw new Error('fillOutForm requires selector');
			const result = await executeFillOutForm(page, selector, clicksPerGroup, log);
			return wrapResult({ ...result, clicksPerGroup: clicksPerGroup || undefined }, action, startTime, page);
		}

		// All remaining actions require a selector
		if (!selector) throw new Error(`${actionType} action requires a selector`);

		// ── Element resolution with resilience ──────────────────────────────
		let element = await waitForElement(page, selector, log, debug);
		let resilience = null;

		if (!element) {
			if (debug) log(`❌ <span style="color: #E74C3C;">Debug: ${selector} not found, entering resilience flow</span>`);

			// 1. Text-match fallback for clicks
			if (lower === 'click') {
				const fb = await tryTextMatchClick(page, action, mouseState, log, debug);
				if (fb && fb.success) {
					return wrapResult(fb, action, startTime, page);
				}
				resilience = 'text-match-failed';
			}

			// 2. Filler action + brief pause
			await runFillerAction(page, hotZones, mouseState, log);
			await sleep(randomBetween(1000, 3000));

			// 3. Retry with extended timeout
			element = await waitForElement(page, selector, log, debug, 10000);
			if (!element) {
				log(`⏭️ <span style="color: #F39C12;">Skipping ${actionType}:</span> ${selector} not found after retry`);
				return wrapResult(
					{
						success: false,
						skipped: true,
						reason: 'selector_not_found_after_retry',
						resilience: resilience || 'filler-retry'
					},
					action,
					startTime,
					page
				);
			}
			resilience = (resilience || '') + '|retry-hit';
		}

		// requireActive check (clicks only)
		if (requireActive && lower === 'click') {
			const isActive = await page.evaluate(el => !el.disabled && !el.classList.contains('disabled'), element);
			if (!isActive) {
				log(`⏭️ <span style="color: #F39C12;">Skipping click:</span> ${selector} is not active`);
				return wrapResult({ success: true, skipped: true }, action, startTime, page);
			}
		}

		// ── Execute with element ────────────────────────────────────────────
		let result;
		const navigationPromise = expectsNavigation
			? page.waitForNavigation({ timeout: navigationTimeout, waitUntil: 'domcontentloaded' }).catch(() => null)
			: null;

		switch (lower) {
			case 'click':
				result = await executeClick(page, element, selector, log, debug, mouseState);
				break;
			case 'type':
				if (!text) throw new Error('Type action requires text field');
				result = await executeType(page, element, selector, text, log, debug, mouseState);
				break;
			case 'select':
				if (!value) throw new Error('Select action requires value field');
				result = await executeSelect(page, element, selector, value, log, debug);
				break;
			case 'hover':
				result = await executeHover(page, element, selector, hotZones, sequencePersona, mouseState, log);
				break;
			case 'scroll':
				result = await executeScrollToElement(page, element, selector, action, mouseState, log);
				break;
			default:
				throw new Error(`Unsupported action type: ${actionType}`);
		}

		if (navigationPromise) {
			await navigationPromise;
			if (debug) {
				let newUrl = 'unknown';
				try {
					newUrl = await page.url();
				} catch {
					/* */
				}
				log(`🧭 <span style="color: #27AE60;">Debug: Navigation completed to ${newUrl}</span>`);
			}
		}

		if (resilience) result = { ...result, resilience };

		return wrapResult(result, action, startTime, page);
	} catch (error) {
		const duration = Date.now() - startTime;
		let pageUrl = currentUrl || 'unknown';
		try {
			pageUrl = await page.url();
		} catch (urlError) {
			// Use currentUrl or fallback to 'unknown'
		}

		// Determine specific failure reason
		let reason = 'unknown';
		if (error.message.includes('not found')) {
			reason = 'selector_not_found';
		} else if (error.message.includes('timeout')) {
			reason = 'timeout';
		} else if (error.message.includes('visible') || error.message.includes('hidden')) {
			reason = 'element_not_visible';
		} else if (error.message.includes('detached')) {
			reason = 'element_detached';
		}

		if (debug) {
			log(`❌ <span style="color: #E74C3C;">Debug: Action failed with reason: ${reason}</span>`);
		}

		return {
			action: actionType,
			selector,
			text: text || undefined,
			value: value || undefined,
			success: false,
			error: error.message,
			reason,
			duration,
			timestamp: startTime,
			page_url: pageUrl
		};
	}
}

/**
 * Wait for an element to be available and visible
 * @param {Page} page - Puppeteer page object
 * @param {string} selector - CSS selector
 * @param {Function} log - Logging function
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<ElementHandle|null>} Element handle or null
 */
async function waitForElement(page, selector, log, debug = false, timeout = 5000) {
	try {
		if (debug) {
			log(`🔍 <span style="color: #95A5A6;">Debug: Waiting for selector with ${timeout}ms timeout...</span>`);
		}
		// Wait for element with timeout
		await page.waitForSelector(selector, { timeout, visible: true });
		const element = await page.$(selector);
		if (debug && element) {
			log(`✓ <span style="color: #27AE60;">Debug: Element found and visible</span>`);
		}
		return element;
	} catch (error) {
		// Try alternative selectors or fallback strategies
		if (debug) {
			log(`🔍 <span style="color: #F39C12;">Debug: Initial wait failed, trying alternatives (${error.message})</span>`);
		} else {
			log(`🔍 <span style="color: #F39C12;">Element not immediately found, trying alternatives...</span>`);
		}

		// Try waiting a bit longer
		await sleep(1000);
		const element = await page.$(selector);
		if (element) {
			// Check if element is visible
			const isVisible = await page.evaluate(el => {
				const rect = el.getBoundingClientRect();
				const style = window.getComputedStyle(el);
				return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
			}, element);

			if (debug) {
				log(`🔍 <span style="color: #95A5A6;">Debug: Element exists, visibility=${isVisible}</span>`);
			}

			if (isVisible) {
				return element;
			}
		}

		if (debug) {
			log(`❌ <span style="color: #E74C3C;">Debug: Element not found or not visible after all attempts</span>`);
		}
		return null;
	}
}

/**
 * Execute a click action on an element
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - Target element
 * @param {string} selector - Original selector for logging
 * @param {Function} log - Logging function
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} Action result
 */
async function executeClick(page, element, selector, log, debug = false, mouseState = null) {
	try {
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		const box = await element.boundingBox();
		if (!box) throw new Error('Element has no bounding box');

		const fuzziness = 0.35;
		const clickX = box.x + box.width * (0.5 + (Math.random() - 0.5) * fuzziness);
		const clickY = box.y + box.height * (0.5 + (Math.random() - 0.5) * fuzziness);

		// Persistent cursor — move from last known position via humanized path
		const start = getStartPos(page, mouseState);
		await moveMouse(page, start.x, start.y, clickX, clickY, box.width, box.height, log);
		await sleep(randomBetween(50, 150));

		await page.mouse.click(clickX, clickY);
		updateMouseState(mouseState, clickX, clickY);
		await sleep(randomBetween(100, 300));

		log(`🖱️ <span style="color: #2ECC71;">Clicked:</span> ${selector}`);
		return { success: true };
	} catch (error) {
		log(`❌ <span style="color: #E74C3C;">Click failed:</span> ${selector} - ${error.message}`);
		return { success: false, error: error.message };
	}
}

/**
 * Execute a type action on an element
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - Target element
 * @param {string} selector - Original selector for logging
 * @param {string} text - Text to type
 * @param {Function} log - Logging function
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} Action result
 */
async function executeType(page, element, selector, text, log, debug = false, mouseState = null) {
	try {
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		// Move cursor to the field via humanized path before clicking, so the type
		// action doesn't teleport the mouse to the input.
		const box = await element.boundingBox();
		if (box) {
			const targetX = box.x + box.width / 2;
			const targetY = box.y + box.height / 2;
			const start = getStartPos(page, mouseState);
			await moveMouse(page, start.x, start.y, targetX, targetY, box.width, box.height, log);
			updateMouseState(mouseState, targetX, targetY);
		}

		await element.click({ clickCount: 3 });
		await sleep(randomBetween(50, 150));

		await element.type(text, { delay: randomBetween(50, 150) });
		await sleep(randomBetween(100, 300));

		log(`⌨️ <span style="color: #3498DB;">Typed:</span> "${text}" into ${selector}`);
		return { success: true };
	} catch (error) {
		log(`❌ <span style="color: #E74C3C;">Type failed:</span> ${selector} - ${error.message}`);
		return { success: false, error: error.message };
	}
}

/**
 * Execute a select action on a dropdown element
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - Target element
 * @param {string} selector - Original selector for logging
 * @param {string} value - Value to select
 * @param {Function} log - Logging function
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} Action result
 */
async function executeSelect(page, element, selector, value, log, debug = false) {
	try {
		// Scroll element into view
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		// Try to select by value
		await element.select(value);
		await sleep(randomBetween(100, 300));

		log(`🔽 <span style="color: #9B59B6;">Selected:</span> "${value}" in ${selector}`);
		return { success: true };
	} catch (error) {
		log(`❌ <span style="color: #E74C3C;">Select failed:</span> ${selector} - ${error.message}`);
		return { success: false, error: error.message };
	}
}

/**
 * Execute a fillOutForm action - fills out all form elements matching a selector
 * REFACTORED: Now uses shared utilities from forms.js for consistency
 * @param {Page} page - Puppeteer page object
 * @param {string} selector - CSS selector for form elements (e.g., "[role=radiogroup]")
 * @param {number} clicksPerGroup - Number of clicks per group element (default: 2)
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} Action result
 */
async function executeFillOutForm(page, selector, clicksPerGroup = 2, log) {
	try {
		// Find all matching elements
		const elements = await page.$$(selector);

		if (elements.length === 0) {
			log(`⚠️ <span style="color: #F39C12;">No elements found matching:</span> ${selector}`);
			return {
				success: false,
				error: 'No elements found',
				elementsProcessed: 0
			};
		}

		log(`📝 <span style="color: #3498DB;">Filling out form:</span> ${elements.length} element(s) matching ${selector}`);
		let successCount = 0;

		for (const [index, element] of elements.entries()) {
			try {
				// Determine element type
				const elementInfo = await page.evaluate(el => {
					const tagName = el.tagName.toLowerCase();
					const type = el.type || tagName;
					const role = el.getAttribute('role');

					// For radiogroups, find all radio buttons within
					if (role === 'radiogroup') {
						const radios = el.querySelectorAll('input[type="radio"], [role="radio"]');
						return {
							type: 'radiogroup',
							role,
							radioCount: radios.length,
							tagName
						};
					}

					return { type, role, tagName };
				}, element);

				// Use shared utilities from forms.js
				let success = false;

				if (elementInfo.role === 'radiogroup') {
					log(
						`🔘 <span style="color: #9B59B6;">Radio group ${index + 1}:</span> ${elementInfo.radioCount} options, clicking ${clicksPerGroup} times`
					);
					success = await fillRadioGroup(page, element, clicksPerGroup, log);
				} else if (elementInfo.type === 'checkbox' || elementInfo.role === 'checkbox') {
					success = await toggleCheckbox(page, element, log);
					if (success) log(`☑️ <span style="color: #2ECC71;">Toggled checkbox</span> ${index + 1}`);
				} else if (elementInfo.tagName === 'select') {
					success = await fillSelectDropdown(page, element, null, log);
					if (success) log(`🔽 <span style="color: #9B59B6;">Selected option</span> in dropdown ${index + 1}`);
				} else if (elementInfo.tagName === 'textarea' || elementInfo.tagName === 'input') {
					success = await fillTextInput(page, element, null, log);
					if (success) log(`⌨️ <span style="color: #3498DB;">Typed text</span> in field ${index + 1}`);
				}

				if (success) {
					successCount++;
				}
			} catch (elementError) {
				log(`⚠️ <span style="color: #F39C12;">Error with element ${index + 1}:</span> ${elementError.message}`);
			}
		}

		log(`✅ <span style="color: #27AE60;">Form filled:</span> ${successCount}/${elements.length} elements processed`);
		return {
			success: successCount > 0,
			elementsProcessed: successCount,
			totalElements: elements.length
		};
	} catch (error) {
		log(`❌ <span style="color: #E74C3C;">Fill form failed:</span> ${error.message}`);
		return { success: false, error: error.message, elementsProcessed: 0 };
	}
}

// ─── 1.1.x: New action handlers + resilience helpers ────────────────────

/**
 * Wrap an action result with the standard envelope (duration, timestamp, page_url, action meta).
 */
async function wrapResult(result, action, startTime, page) {
	let pageUrl = 'unknown';
	try {
		pageUrl = await page.url();
	} catch {
		/* ignore */
	}
	return {
		...result,
		action: action.action,
		selector: action.selector,
		text: action.text || undefined,
		value: action.value || undefined,
		duration: Date.now() - startTime,
		timestamp: startTime,
		page_url: pageUrl
	};
}

/** Selectorless navigate — wraps navigateToNewPage from interactions.js. */
async function executeNavigate(page, mouseState, log) {
	let originDomain = '';
	try {
		originDomain = new URL(page.url()).hostname;
	} catch {
		/* about:blank etc. */
	}
	const r = await navigateToNewPage(page, mouseState, originDomain, log);
	return r.navigated
		? { success: true, navigated: true, toUrl: r.toUrl, target: r.target }
		: { success: true, navigated: false, skipped: true, reason: 'no-nav-detected' };
}

/** Explicit wait — accepts {ms} or {tier: micro|read|think}. */
async function executeWait(page, action, sequencePersona, log) {
	if (typeof action.ms === 'number' && Number.isFinite(action.ms)) {
		const ms = Math.max(50, Math.min(30000, action.ms));
		await sleep(ms);
		log(`⏸️ <span style="color: #888;">Waited ${ms}ms</span>`);
		return { success: true, waited_ms: ms };
	}
	if (action.tier) {
		const tier = await contextPause(null, null, 'engagement', sequencePersona, null, action.tier);
		log(`⏸️ <span style="color: #888;">Waited (tier: ${tier})</span>`);
		return { success: true, waited_tier: tier };
	}
	// Validation should catch this; defensive default
	await sleep(1000);
	return { success: true, waited_ms: 1000 };
}

/** Page-level scroll (no selector) — uses intelligentScroll or directional wheel. */
async function executePageScroll(page, action, hotZones, mouseState, log) {
	if (action.direction || action.amount) {
		const vp = page.viewport();
		const half = Math.round(vp.height / 2);
		const full = vp.height;
		const dir = action.direction === 'up' ? -1 : 1;
		let amount = full;
		if (action.amount === 'half') amount = half;
		else if (typeof action.amount === 'number') amount = action.amount;
		try {
			await page.mouse.wheel({ deltaY: dir * amount });
		} catch {
			await page.evaluate(d => window.scrollBy(0, d), dir * amount);
		}
		await sleep(randomBetween(200, 600));
		log(`📜 <span style="color: #BCF0F0;">Scrolled ${dir * amount}px</span>`);
		return { success: true, scrolled_px: dir * amount };
	}
	const ok = await intelligentScroll(page, hotZones, log, mouseState);
	return ok ? { success: true } : { success: false, skipped: true, reason: 'nothing-to-scroll' };
}

/** Scroll a specific element into view (used when scroll action has a selector + element resolved). */
async function executeScrollToElement(page, element, selector, action, mouseState, log) {
	try {
		await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), element);
		await sleep(randomBetween(300, 700));
		log(`📜 <span style="color: #BCF0F0;">Scrolled element into view:</span> ${selector}`);
		// Optional polish: small wheel jitter for human-feel
		if (Math.random() < 0.4) {
			try {
				await page.mouse.wheel({ deltaY: randomBetween(-40, 40) });
			} catch {
				/* */
			}
		}
		// mouseState unchanged — scroll doesn't move cursor
		void mouseState;
		void action;
		return { success: true, scrolled_to: selector };
	} catch (error) {
		return { success: false, error: error.message };
	}
}

/** Hover over a specific element with reading-trace dwell. */
async function executeHover(page, element, selector, hotZones, persona, mouseState, log) {
	try {
		const box = await element.boundingBox();
		if (!box) return { success: false, error: 'no-bounding-box' };
		// Use the persona-aware hoverOverElements for the reading-trace pattern, but
		// constrain it to this specific target by passing a single-zone hotZones list.
		const targetZone = {
			x: box.x + box.width / 2,
			y: box.y + box.height / 2,
			width: box.width,
			height: box.height,
			priority: 10,
			text: '',
			tag: 'sequence-hover'
		};
		const hoverHistory = [];
		await hoverOverElements(page, [targetZone], persona, hoverHistory, log, mouseState);
		log(`👁️ <span style="color: #FEDE9B;">Hovered:</span> ${selector}`);
		void hotZones;
		return { success: true };
	} catch (error) {
		return { success: false, error: error.message };
	}
}

/**
 * Text-match fallback: when the CSS selector fails, try to find a clickable element
 * whose visible text matches the action's `textFallback` field (or text inferred from
 * quoted strings in the selector). Click via coords if found.
 */
async function tryTextMatchClick(page, action, mouseState, log, debug) {
	const candidates = collectFallbackText(action);
	if (candidates.length === 0) return null;

	const hit = await page.evaluate(texts => {
		const sel =
			'button, a, [role="button"], [role="link"], .btn, .nav-link, ' +
			'.genre-pill, .genre-card-large, .genre-select-card, .track-card, .artist-item, ' +
			'.btn-primary, .btn-header, [data-action], [data-nav]';
		const els = Array.from(document.querySelectorAll(sel));
		for (const t of texts) {
			const lc = t.toLowerCase();
			for (const el of els) {
				const r = el.getBoundingClientRect();
				if (r.width <= 0 || r.height <= 0) continue;
				const cs = window.getComputedStyle(el);
				if (cs.visibility === 'hidden' || cs.display === 'none') continue;
				const txt = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
					.trim()
					.toLowerCase();
				if (!txt) continue;
				if (txt.includes(lc)) {
					return {
						x: r.x + r.width / 2,
						y: r.y + r.height / 2,
						width: r.width,
						height: r.height,
						matchedText: el.textContent?.trim().substring(0, 60) || ''
					};
				}
			}
		}
		return null;
	}, candidates);

	if (!hit) {
		if (debug)
			log(
				`🔍 <span style="color: #95A5A6;">Text fallback: no element matched any of [${candidates.join(', ')}]</span>`
			);
		return null;
	}

	const start = getStartPos(page, mouseState);
	await moveMouse(page, start.x, start.y, hit.x, hit.y, hit.width, hit.height, log);
	await sleep(randomBetween(80, 200));
	await page.mouse.click(hit.x, hit.y);
	updateMouseState(mouseState, hit.x, hit.y);
	log(
		`🔁 <span style="color: #07B096;">Text-match fallback hit:</span> "<span style="color: #FEDE9B;">${hit.matchedText}</span>" ` +
			`<span style="color: #888;">(selector ${action.selector} missing)</span>`
	);
	return { success: true, fallback: 'text-match', matchedText: hit.matchedText };
}

/** Build the list of candidate strings for text-match fallback (textFallback first, then inferred). */
function collectFallbackText(action) {
	const out = [];
	if (typeof action.textFallback === 'string' && action.textFallback.trim()) {
		out.push(action.textFallback.trim());
	}
	// Infer from quoted strings inside the selector (e.g., [data-genre="lo-fi"] → "lo-fi")
	if (typeof action.selector === 'string') {
		const quoted = action.selector.match(/["']([^"']{2,40})["']/g);
		if (quoted) {
			for (const q of quoted) {
				const s = q.slice(1, -1).trim();
				if (s && !out.includes(s)) out.push(s);
			}
		}
	}
	return out;
}

/** Filler action — keeps the meeple producing events while the bad selector lingers. */
async function runFillerAction(page, hotZones, mouseState, log) {
	const fillers = [
		() => intelligentScroll(page, hotZones, log, mouseState),
		() => naturalMouseMovement(page, hotZones, log, mouseState)
	];
	const f = fillers[Math.floor(Math.random() * fillers.length)];
	try {
		await f();
	} catch {
		/* filler failures are non-fatal */
	}
}

/**
 * Execute a random action when temperature causes sequence bypass
 * @param {Page} page - Puppeteer page object
 * @param {Array} hotZones - Hot zones for targeting
 * @param {string} persona - Selected persona
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} Action result
 */
async function executeRandomAction(page, hotZones, persona, log, mouseState = null) {
	const randomActions = [
		() => exploratoryClick(page, log, mouseState),
		() => naturalMouseMovement(page, hotZones, log, mouseState),
		() => intelligentScroll(page, hotZones, log, mouseState),
		() => interactWithForms(page, log, { persona })
	];

	const randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];

	try {
		await randomAction();
		return {
			action: 'random',
			success: true,
			timestamp: Date.now()
		};
	} catch (error) {
		return {
			action: 'random',
			success: false,
			error: error.message,
			timestamp: Date.now()
		};
	}
}

/**
 * Add human-like behavior between sequence actions
 * @param {Page} page - Puppeteer page object
 * @param {Array} hotZones - Hot zones for targeting
 * @param {string} persona - Selected persona
 * @param {Function} log - Logging function
 */
async function addHumanBehavior(page, hotZones, persona, log, mouseState = null) {
	// 1.1.0: replace flat 500-2000ms delay with contextPause so sequences benefit
	// from the same persona/phase-aware pacing as duration-driven sessions.
	// Sequences don't track phase, so pin to 'engagement' (most action-dense phase)
	// and use generic prev/next so contextPause defaults to micro/read tier.
	await contextPause('click', 'click', 'engagement', persona);

	// Occasionally add non-state-changing actions (30% chance)
	if (Math.random() < 0.3) {
		const behaviorActions = [
			() => naturalMouseMovement(page, hotZones, log, mouseState),
			() => intelligentScroll(page, hotZones, log, mouseState),
			() => wait()
		];

		const behaviorAction = behaviorActions[Math.floor(Math.random() * behaviorActions.length)];
		try {
			await behaviorAction();
		} catch (error) {
			// Ignore errors in non-essential behavior actions
		}
	}
}

/**
 * Validate a sequence specification
 * @param {import('../index.js').SequenceSpec} sequenceSpec - Sequence specification to validate
 * @returns {import('../index.js').ValidationResult} Validation result with {valid: boolean, errors: string[]}
 */
export function validateSequence(sequenceSpec) {
	const errors = [];

	if (!sequenceSpec || typeof sequenceSpec !== 'object') {
		return { valid: false, errors: ['Sequence must be an object'] };
	}

	const { description, temperature, 'chaos-range': chaosRange, actions } = sequenceSpec;

	// Validate description
	if (description && typeof description !== 'string') {
		errors.push('Description must be a string');
	}

	// Validate temperature
	if (temperature !== undefined) {
		if (typeof temperature !== 'number' || temperature < 0 || temperature > 10) {
			errors.push('Temperature must be a number between 0 and 10');
		}
	}

	// Validate chaos-range
	if (chaosRange !== undefined) {
		if (
			!Array.isArray(chaosRange) ||
			chaosRange.length !== 2 ||
			typeof chaosRange[0] !== 'number' ||
			typeof chaosRange[1] !== 'number'
		) {
			errors.push('Chaos-range must be an array of two numbers');
		} else if (chaosRange[0] > chaosRange[1]) {
			errors.push('Chaos-range first value must be less than or equal to second value');
		}
	}

	// Validate actions
	if (!actions || !Array.isArray(actions)) {
		errors.push('Actions must be an array');
	} else {
		actions.forEach((action, index) => {
			if (!action || typeof action !== 'object') {
				errors.push(`Action ${index + 1} must be an object`);
				return;
			}

			const { action: actionType, selector, text, value, tier, ms } = action;
			const lower = typeof actionType === 'string' ? actionType.toLowerCase() : '';

			if (!actionType || typeof actionType !== 'string') {
				errors.push(`Action ${index + 1} must have a valid action type`);
				return;
			}

			// 1.1.x: extended action types
			const SELECTORLESS = ['navigate', 'wait'];
			const SELECTOR_OPTIONAL = ['scroll']; // scroll can target an element OR scroll the page
			const VALID_TYPES = ['click', 'type', 'select', 'filloutform', 'navigate', 'scroll', 'hover', 'wait'];

			if (!VALID_TYPES.includes(lower)) {
				errors.push(`Action ${index + 1} has unsupported action type: ${actionType}`);
				return;
			}

			// Selector requirements
			const selectorRequired = !SELECTORLESS.includes(lower) && !SELECTOR_OPTIONAL.includes(lower);
			if (selectorRequired && (!selector || typeof selector !== 'string')) {
				errors.push(`Action ${index + 1} (${actionType}) must have a valid selector`);
			}

			if (lower === 'type' && (!text || typeof text !== 'string')) {
				errors.push(`Action ${index + 1} (type) must have a text field`);
			}

			if (lower === 'select' && (!value || typeof value !== 'string')) {
				errors.push(`Action ${index + 1} (select) must have a value field`);
			}

			// Wait: must have exactly one of `tier` or `ms`
			if (lower === 'wait') {
				const hasTier = typeof tier === 'string';
				const hasMs = typeof ms === 'number' && Number.isFinite(ms);
				if (hasTier && hasMs) {
					errors.push(`Action ${index + 1} (wait) cannot have both 'tier' and 'ms'`);
				} else if (!hasTier && !hasMs) {
					errors.push(`Action ${index + 1} (wait) must have either 'tier' (micro|read|think) or 'ms' (number)`);
				} else if (hasTier && !['micro', 'read', 'think'].includes(tier)) {
					errors.push(`Action ${index + 1} (wait) tier must be one of: micro, read, think`);
				}
			}

			// Scroll: validate optional direction/amount if present
			if (lower === 'scroll') {
				if (action.direction !== undefined && !['up', 'down'].includes(action.direction)) {
					errors.push(`Action ${index + 1} (scroll) direction must be 'up' or 'down'`);
				}
				if (action.amount !== undefined) {
					const amt = action.amount;
					const valid = amt === 'page' || amt === 'half' || (typeof amt === 'number' && amt > 0);
					if (!valid) errors.push(`Action ${index + 1} (scroll) amount must be 'page', 'half', or a positive number`);
				}
			}

			// textFallback (clicks only, optional)
			if (action.textFallback !== undefined && typeof action.textFallback !== 'string') {
				errors.push(`Action ${index + 1} textFallback must be a string`);
			}
		});

		// Sequence-level persona override (optional)
		if (sequenceSpec.persona !== undefined) {
			if (typeof sequenceSpec.persona !== 'string') {
				errors.push('persona must be a string');
			}
			// Don't validate against personas list here — sequences.js doesn't import entities.js
			// at module load (would be circular). selectPersona handles unknown names gracefully.
		}
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Validate sequences object containing multiple named sequences
 * @param {import('../index.js').SequencesSpec} sequences - Object containing named sequence specifications
 * @returns {import('../index.js').ValidationResult} Validation result with {valid: boolean, errors: string[]}
 */
export function validateSequences(sequences) {
	if (!sequences || typeof sequences !== 'object') {
		return { valid: false, errors: ['Sequences must be an object'] };
	}

	const allErrors = [];
	const sequenceNames = Object.keys(sequences);

	if (sequenceNames.length === 0) {
		return { valid: false, errors: ['Sequences object cannot be empty'] };
	}

	sequenceNames.forEach(name => {
		const validation = validateSequence(sequences[name]);
		if (!validation.valid) {
			validation.errors.forEach(error => {
				allErrors.push(`Sequence "${name}": ${error}`);
			});
		}
	});

	return { valid: allErrors.length === 0, errors: allErrors };
}
