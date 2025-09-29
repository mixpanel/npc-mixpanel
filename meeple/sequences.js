/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import { wait, naturalMouseMovement, intelligentScroll, exploratoryClick } from './interactions.js';
import { interactWithForms } from './forms.js';
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
	const { description, temperature = 5, 'chaos-range': chaosRange = [1, 1], actions = [] } = sequenceSpec;

	log(`🎯 <span style="color: #7856FF;">Sequence:</span> ${description}`);
	log(`🌡️ <span style="color: #F39C12;">Temperature:</span> ${temperature}/10, Chaos: [${chaosRange[0]}-${chaosRange[1]}]`);

	// Calculate effective temperature with chaos multiplier
	const chaosMultiplier = randomBetween(chaosRange[0], chaosRange[1]) / 10;
	const effectiveTemperature = Math.max(0, Math.min(10, temperature * chaosMultiplier));

	log(`🎲 <span style="color: #9B59B6;">Effective temperature:</span> ${effectiveTemperature.toFixed(2)}/10`);

	const actionResults = [];
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = 3;

	for (const [index, action] of actions.entries()) {
		try {
			// Check if we should follow the sequence or go random based on temperature
			const followSequence = Math.random() * 10 < effectiveTemperature;

			if (followSequence) {
				log(`📋 <span style="color: #3498DB;">Action ${index + 1}/${actions.length}:</span> ${action.action} ${action.selector || ''}`);

				const result = await executeSequenceAction(page, action, hotZones, log);
				actionResults.push(result);

				if (result.success) {
					consecutiveFailures = 0;
				} else {
					consecutiveFailures++;
					log(`⚠️ <span style="color: #E67E22;">Action failed, continuing...</span>`);
				}
			} else {
				log(`🎲 <span style="color: #9B59B6;">Temperature bypass - random action instead</span>`);
				// Execute a random action instead
				const randomResult = await executeRandomAction(page, hotZones, persona, log);
				actionResults.push(randomResult);
			}

			// Stop if too many consecutive failures
			if (consecutiveFailures >= maxConsecutiveFailures) {
				log(`🛑 <span style="color: #E74C3C;">Too many consecutive failures, stopping sequence</span>`);
				break;
			}

			// Add realistic delays and non-state-changing actions between sequence actions
			await addHumanBehavior(page, hotZones, persona, log);

		} catch (error) {
			log(`🚨 <span style="color: #E74C3C;">Sequence action error:</span> ${error.message}`);
			actionResults.push({
				action: action.action,
				selector: action.selector,
				success: false,
				error: error.message,
				timestamp: Date.now()
			});
			consecutiveFailures++;
		}

		// Break out early if we've hit too many failures
		if (consecutiveFailures >= maxConsecutiveFailures) {
			break;
		}
	}

	log(`✅ <span style="color: #27AE60;">Sequence completed:</span> ${actionResults.length} actions executed`);
	return actionResults;
}

/**
 * Execute a specific sequence action (click, type, select)
 * @param {Page} page - Puppeteer page object
 * @param {Object} action - Action specification
 * @param {Array} hotZones - Hot zones for fallback targeting
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} Action result
 */
async function executeSequenceAction(page, action, hotZones, log) {
	const { action: actionType, selector, text, value } = action;
	const startTime = Date.now();

	try {
		// Validate action has required fields
		if (!actionType || !selector) {
			throw new Error(`Invalid action: missing action type or selector`);
		}

		// Wait for element to be available with timeout
		const element = await waitForElement(page, selector, log);
		if (!element) {
			throw new Error(`Element not found: ${selector}`);
		}

		let result;
		switch (actionType.toLowerCase()) {
			case 'click':
				result = await executeClick(page, element, selector, log);
				break;
			case 'type':
				if (!text) throw new Error('Type action requires text field');
				result = await executeType(page, element, selector, text, log);
				break;
			case 'select':
				if (!value) throw new Error('Select action requires value field');
				result = await executeSelect(page, element, selector, value, log);
				break;
			default:
				throw new Error(`Unsupported action type: ${actionType}`);
		}

		const duration = Date.now() - startTime;
		return {
			...result,
			action: actionType,
			selector,
			text: text || undefined,
			value: value || undefined,
			duration,
			timestamp: startTime
		};

	} catch (error) {
		const duration = Date.now() - startTime;
		return {
			action: actionType,
			selector,
			text: text || undefined,
			value: value || undefined,
			success: false,
			error: error.message,
			duration,
			timestamp: startTime
		};
	}
}

/**
 * Wait for an element to be available and visible
 * @param {Page} page - Puppeteer page object
 * @param {string} selector - CSS selector
 * @param {Function} log - Logging function
 * @returns {Promise<ElementHandle|null>} Element handle or null
 */
async function waitForElement(page, selector, log) {
	try {
		// Wait for element with timeout
		await page.waitForSelector(selector, { timeout: 5000, visible: true });
		return await page.$(selector);
	} catch (error) {
		// Try alternative selectors or fallback strategies
		log(`🔍 <span style="color: #F39C12;">Element not immediately found, trying alternatives...</span>`);

		// Try waiting a bit longer
		await sleep(1000);
		const element = await page.$(selector);
		if (element) {
			// Check if element is visible
			const isVisible = await page.evaluate(el => {
				const rect = el.getBoundingClientRect();
				const style = window.getComputedStyle(el);
				return rect.width > 0 && rect.height > 0 &&
					style.visibility !== 'hidden' && style.display !== 'none';
			}, element);

			if (isVisible) {
				return element;
			}
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
 * @returns {Promise<Object>} Action result
 */
async function executeClick(page, element, selector, log) {
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
 * @returns {Promise<Object>} Action result
 */
async function executeType(page, element, selector, text, log) {
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
 * @returns {Promise<Object>} Action result
 */
async function executeSelect(page, element, selector, value, log) {
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
 * Execute a random action when temperature causes sequence bypass
 * @param {Page} page - Puppeteer page object
 * @param {Array} hotZones - Hot zones for targeting
 * @param {string} persona - Selected persona
 * @param {Function} log - Logging function
 * @returns {Promise<Object>} Action result
 */
async function executeRandomAction(page, hotZones, persona, log) {
	const randomActions = [
		() => exploratoryClick(page, log),
		() => naturalMouseMovement(page, hotZones, log),
		() => intelligentScroll(page, hotZones, log),
		() => interactWithForms(page, log)
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
async function addHumanBehavior(page, hotZones, persona, log) {
	// Random delay between actions (500ms to 2000ms)
	const baseDelay = randomBetween(500, 2000);
	await sleep(baseDelay);

	// Occasionally add non-state-changing actions (30% chance)
	if (Math.random() < 0.3) {
		const behaviorActions = [
			() => naturalMouseMovement(page, hotZones, log),
			() => intelligentScroll(page, hotZones, log),
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
		if (!Array.isArray(chaosRange) || chaosRange.length !== 2 ||
			typeof chaosRange[0] !== 'number' || typeof chaosRange[1] !== 'number') {
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
			} else if (!['click', 'type', 'select'].includes(actionType.toLowerCase())) {
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