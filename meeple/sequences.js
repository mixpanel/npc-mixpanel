// @ts-nocheck - This file has DOM manipulation and complex type issues with sequences
/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import { wait, naturalMouseMovement, intelligentScroll, exploratoryClick, createMouseState } from './interactions.js';
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
		debug = false
	} = sequenceSpec;

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

				const result = await executeSequenceAction(page, action, hotZones, log, debug);
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
				const randomResult = await executeRandomAction(page, hotZones, persona, log, mouseState);
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
			await addHumanBehavior(page, hotZones, persona, log, mouseState);
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
async function executeSequenceAction(page, action, hotZones, log, debug = false) {
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
	const startTime = Date.now();
	let currentUrl;

	try {
		// Get current URL for error reporting
		try {
			currentUrl = await page.url();
		} catch (urlError) {
			currentUrl = 'unknown';
		}

		// Validate action has required fields
		if (!actionType || !selector) {
			throw new Error(`Invalid action: missing action type or selector`);
		}

		if (debug) {
			log(`🔍 <span style="color: #95A5A6;">Debug: Looking for element "${selector}" on ${currentUrl}</span>`);
		}

		// Special handling for fillOutForm - it finds multiple elements
		if (actionType.toLowerCase() === 'filloutform') {
			const result = await executeFillOutForm(page, selector, clicksPerGroup, log);
			const duration = Date.now() - startTime;
			let pageUrl = 'unknown';
			try {
				pageUrl = await page.url();
			} catch (urlError) {
				// Ignore URL fetch errors
			}
			return {
				...result,
				action: actionType,
				selector,
				clicksPerGroup: clicksPerGroup || undefined,
				duration,
				timestamp: startTime,
				page_url: pageUrl
			};
		}

		// Wait for element to be available with timeout
		const element = await waitForElement(page, selector, log, debug);
		if (!element) {
			if (debug) {
				log(`❌ <span style="color: #E74C3C;">Debug: Element not found after timeout</span>`);
			}
			throw new Error(`Element not found: ${selector}`);
		}

		if (debug) {
			log(`✓ <span style="color: #27AE60;">Debug: Element found, preparing to interact</span>`);
		}

		// Handle requireActive flag for click actions
		if (requireActive && actionType.toLowerCase() === 'click') {
			const isActive = await page.evaluate(el => {
				return !el.disabled && !el.classList.contains('disabled');
			}, element);
			if (!isActive) {
				log(`⏭️ <span style="color: #F39C12;">Skipping click:</span> ${selector} is not active`);
				let pageUrl = 'unknown';
				try {
					pageUrl = await page.url();
				} catch (urlError) {
					// Ignore URL fetch errors
				}
				return {
					success: true,
					skipped: true,
					action: actionType,
					selector,
					duration: Date.now() - startTime,
					timestamp: startTime,
					page_url: pageUrl
				};
			}
		}

		let result;

		// Handle navigation expectations
		if (expectsNavigation) {
			if (debug) {
				log(`🧭 <span style="color: #3498DB;">Debug: Action expects navigation, setting up listeners</span>`);
			}
			// Set up navigation promise before executing action
			const navigationPromise = page
				.waitForNavigation({
					timeout: navigationTimeout,
					waitUntil: 'domcontentloaded'
				})
				.catch(err => {
					if (debug) {
						log(`⚠️ <span style="color: #F39C12;">Debug: Navigation timeout or error: ${err.message}</span>`);
					}
					return null;
				});

			// Execute the action
			switch (actionType.toLowerCase()) {
				case 'click':
					result = await executeClick(page, element, selector, log, debug);
					break;
				case 'type':
					if (!text) throw new Error('Type action requires text field');
					result = await executeType(page, element, selector, text, log, debug);
					break;
				case 'select':
					if (!value) throw new Error('Select action requires value field');
					result = await executeSelect(page, element, selector, value, log, debug);
					break;
				default:
					throw new Error(`Unsupported action type: ${actionType}`);
			}

			// Wait for navigation to complete
			await navigationPromise;
			let newUrl = 'unknown';
			try {
				newUrl = await page.url();
			} catch (urlError) {
				// Ignore URL fetch errors
			}
			if (debug) {
				log(`🧭 <span style="color: #27AE60;">Debug: Navigation completed to ${newUrl}</span>`);
			}
		} else {
			// Normal execution without navigation handling
			switch (actionType.toLowerCase()) {
				case 'click':
					result = await executeClick(page, element, selector, log, debug);
					break;
				case 'type':
					if (!text) throw new Error('Type action requires text field');
					result = await executeType(page, element, selector, text, log, debug);
					break;
				case 'select':
					if (!value) throw new Error('Select action requires value field');
					result = await executeSelect(page, element, selector, value, log, debug);
					break;
				default:
					throw new Error(`Unsupported action type: ${actionType}`);
			}
		}

		const duration = Date.now() - startTime;
		let pageUrl = 'unknown';
		try {
			pageUrl = await page.url();
		} catch (urlError) {
			// Ignore URL fetch errors
		}
		return {
			...result,
			action: actionType,
			selector,
			text: text || undefined,
			value: value || undefined,
			duration,
			timestamp: startTime,
			page_url: pageUrl
		};
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
async function waitForElement(page, selector, log, debug = false) {
	try {
		if (debug) {
			log(`🔍 <span style="color: #95A5A6;">Debug: Waiting for selector with 5s timeout...</span>`);
		}
		// Wait for element with timeout
		await page.waitForSelector(selector, { timeout: 5000, visible: true });
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
async function executeClick(page, element, selector, log, debug = false) {
	try {
		// Scroll element into view if needed
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		// Get element bounds for natural clicking
		const box = await element.boundingBox();
		if (!box) {
			throw new Error('Element has no bounding box');
		}

		// Add some randomness to click position (human-like behavior)
		const fuzziness = 0.35; // ±35%
		const clickX = box.x + box.width * (0.5 + (Math.random() - 0.5) * fuzziness);
		const clickY = box.y + box.height * (0.5 + (Math.random() - 0.5) * fuzziness);

		// Move mouse naturally to the element first
		await page.mouse.move(clickX, clickY);
		await sleep(randomBetween(50, 150));

		// Perform the click
		await page.mouse.click(clickX, clickY);
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
async function executeType(page, element, selector, text, log, debug = false) {
	try {
		// Scroll element into view and focus
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		// Clear existing content first
		await element.click({ clickCount: 3 }); // Triple-click to select all
		await sleep(randomBetween(50, 150));

		// Type text with human-like delays
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
	// Random delay between actions (500ms to 2000ms)
	const baseDelay = randomBetween(500, 2000);
	await sleep(baseDelay);

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

			const { action: actionType, selector, text, value } = action;

			if (!actionType || typeof actionType !== 'string') {
				errors.push(`Action ${index + 1} must have a valid action type`);
			} else if (!['click', 'type', 'select', 'filloutform'].includes(actionType.toLowerCase())) {
				errors.push(`Action ${index + 1} has unsupported action type: ${actionType}`);
			}

			if (!selector || typeof selector !== 'string') {
				errors.push(`Action ${index + 1} must have a valid selector`);
			}

			if (actionType === 'type' && (!text || typeof text !== 'string')) {
				errors.push(`Action ${index + 1} (type) must have a text field`);
			}

			if (actionType === 'select' && (!value || typeof value !== 'string')) {
				errors.push(`Action ${index + 1} (select) must have a value field`);
			}
		});
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
