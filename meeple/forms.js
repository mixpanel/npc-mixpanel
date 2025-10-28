/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import { formTestData } from './entities.js';

// Click fuzziness configuration for form interactions
export const CLICK_FUZZINESS = {
	FORM_FIELD: 0.35 // ±35% for form field clicks
};

// Sleep utility for consistency
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * SHARED FORM UTILITIES - Used by both normal meeples and sequences
 */

/**
 * Fill a text input or textarea with realistic typing
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - The input/textarea element
 * @param {string} text - Text to type (optional, will use test data if not provided)
 * @param {Function} log - Logging function
 * @returns {Promise<boolean>} Success status
 */
export async function fillTextInput(page, element, text = null, log = console.log) {
	try {
		// Scroll element into view
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		// Get element info for test data selection
		const elementInfo = await page.evaluate(
			el => ({
				type: el.type || 'text',
				placeholder: el.placeholder || '',
				tagName: el.tagName.toLowerCase()
			}),
			element
		);

		// Use provided text or select from test data
		let textToType = text;
		if (!textToType) {
			const termType = ['email', 'search', 'password', 'url', 'tel', 'number'].includes(elementInfo.type)
				? elementInfo.type
				: 'text';
			const availableTerms = formTestData[termType] || formTestData.text;
			textToType = availableTerms[Math.floor(Math.random() * availableTerms.length)];
		}

		// Click into the field
		await element.click({ clickCount: 3 }); // Triple-click to select all
		await sleep(randomBetween(50, 150));

		// Type with realistic speed and occasional typos
		for (const char of textToType) {
			// Occasionally make a typo and correct it (5% chance)
			if (Math.random() < 0.05) {
				const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
				await page.keyboard.type(wrongChar);
				await sleep(randomBetween(50, 100));
				await page.keyboard.press('Backspace');
				await sleep(randomBetween(25, 75));
			}

			await page.keyboard.type(char);
			await sleep(randomBetween(25, 75));
		}

		await sleep(randomBetween(100, 300));
		return true;
	} catch (error) {
		log(`    └─ ⚠️ <span style="color: #F8BC3B;">Text input failed:</span> ${error.message}`);
		return false;
	}
}

/**
 * Select an option from a dropdown/select element
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - The select element
 * @param {string} value - Value to select (optional, will pick random if not provided)
 * @param {Function} log - Logging function
 * @returns {Promise<boolean>} Success status
 */
export async function fillSelectDropdown(page, element, value = null, log = console.log) {
	try {
		// Scroll element into view
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 300));

		// Select by value if provided, otherwise pick random
		if (value) {
			await element.select(value);
		} else {
			await page.evaluate(el => {
				if (el.options && el.options.length > 1) {
					const randomIndex = Math.floor(Math.random() * el.options.length);
					el.selectedIndex = randomIndex;
					el.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}, element);
		}

		await sleep(randomBetween(100, 300));
		return true;
	} catch (error) {
		log(`    └─ ⚠️ <span style="color: #F8BC3B;">Select dropdown failed:</span> ${error.message}`);
		return false;
	}
}

/**
 * Click a checkbox or toggle element
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - The checkbox element
 * @param {Function} log - Logging function
 * @returns {Promise<boolean>} Success status
 */
export async function toggleCheckbox(page, element, log = console.log) {
	try {
		// Scroll element into view
		await element.scrollIntoViewIfNeeded();
		await sleep(randomBetween(100, 200));

		// Get bounding box for natural clicking
		const box = await element.boundingBox();
		if (!box) {
			throw new Error('Element has no bounding box');
		}

		// Click with fuzziness
		const fuzziness = 0.25;
		const clickX = box.x + box.width * (0.5 + (Math.random() - 0.5) * fuzziness);
		const clickY = box.y + box.height * (0.5 + (Math.random() - 0.5) * fuzziness);

		await page.mouse.move(clickX, clickY);
		await sleep(randomBetween(50, 100));
		await page.mouse.click(clickX, clickY);
		await sleep(randomBetween(200, 400));

		return true;
	} catch (error) {
		log(`    └─ ⚠️ <span style="color: #F8BC3B;">Checkbox toggle failed:</span> ${error.message}`);
		return false;
	}
}

/**
 * Interact with a radio group by clicking one or more radio options
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} radioGroupElement - The radiogroup container element
 * @param {number} clicksCount - Number of times to click (simulates changing mind, default 2)
 * @param {Function} log - Logging function
 * @returns {Promise<boolean>} Success status
 */
export async function fillRadioGroup(page, radioGroupElement, clicksCount = 2, log = console.log) {
	try {
		// Scroll element into view
		await radioGroupElement.scrollIntoViewIfNeeded();
		await sleep(randomBetween(200, 400));

		// Get info about the radio group
		const radioInfo = await page.evaluate(el => {
			const radios = el.querySelectorAll('input[type="radio"], [role="radio"]');
			return {
				radioCount: radios.length,
				hasRadios: radios.length > 0
			};
		}, radioGroupElement);

		if (!radioInfo.hasRadios) {
			return false;
		}

		// Click random radio options multiple times (simulates user changing their mind)
		for (let i = 0; i < clicksCount; i++) {
			const radioOptions = await radioGroupElement.$$('input[type="radio"], [role="radio"]');

			if (radioOptions.length > 0) {
				const randomIndex = Math.floor(Math.random() * radioOptions.length);
				const radioOption = radioOptions[randomIndex];

				try {
					await radioOption.scrollIntoViewIfNeeded();
					await sleep(randomBetween(100, 200));

					const box = await radioOption.boundingBox();
					if (box) {
						const fuzziness = 0.25;
						const clickX = box.x + box.width * (0.5 + (Math.random() - 0.5) * fuzziness);
						const clickY = box.y + box.height * (0.5 + (Math.random() - 0.5) * fuzziness);

						await page.mouse.move(clickX, clickY);
						await sleep(randomBetween(50, 100));
						await page.mouse.click(clickX, clickY);
						await sleep(randomBetween(200, 400));
					}
				} catch (radioError) {
					// Continue to next click attempt
				}
			}
		}

		return true;
	} catch (error) {
		log(`    └─ ⚠️ <span style="color: #F8BC3B;">Radio group interaction failed:</span> ${error.message}`);
		return false;
	}
}

/**
 * Intelligently fill any form element based on its type
 * @param {Page} page - Puppeteer page object
 * @param {ElementHandle} element - The form element
 * @param {Object} options - Options like {text, value, clicksPerGroup}
 * @param {Function} log - Logging function
 * @returns {Promise<boolean>} Success status
 */
export async function fillFormElement(page, element, options = {}, log = console.log) {
	try {
		const elementInfo = await page.evaluate(el => {
			const tagName = el.tagName.toLowerCase();
			const type = el.type || tagName;
			const role = el.getAttribute('role');

			return { tagName, type, role };
		}, element);

		// Route to appropriate handler
		if (elementInfo.role === 'radiogroup') {
			return await fillRadioGroup(page, element, options.clicksPerGroup || 2, log);
		} else if (elementInfo.type === 'checkbox' || elementInfo.role === 'checkbox') {
			return await toggleCheckbox(page, element, log);
		} else if (elementInfo.tagName === 'select') {
			return await fillSelectDropdown(page, element, options.value, log);
		} else if (elementInfo.tagName === 'textarea' || elementInfo.tagName === 'input') {
			return await fillTextInput(page, element, options.text, log);
		}

		return false;
	} catch (error) {
		log(`    └─ ⚠️ <span style="color: #F8BC3B;">Form element fill failed:</span> ${error.message}`);
		return false;
	}
}

/**
 * Interact with forms - search boxes, email inputs, etc.
 * ENHANCED: Now supports ALL form element types including radios and checkboxes
 */
export async function interactWithForms(page, log = console.log) {
	try {
		// Check if page is still responsive
		await page.evaluate(() => document.readyState);

		const formElements = await page.evaluate(() => {
			// ENHANCED: Now includes checkboxes, radio groups, and all interactive form elements
			const allElements = Array.from(
				document.querySelectorAll(`
				input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="hidden"]),
				textarea,
				select,
				[role="radiogroup"],
				[role="checkbox"]
			`)
			);

			return allElements
				.filter(el => {
					const rect = el.getBoundingClientRect();
					const style = window.getComputedStyle(el);
					const role = el.getAttribute('role');

					// Radio groups and checkboxes have special handling
					if (role === 'radiogroup' || role === 'checkbox') {
						return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
					}

					// Standard visibility check for other form elements
					return (
						rect.width > 0 &&
						rect.height > 0 &&
						!el.disabled &&
						!el.readOnly &&
						style.visibility !== 'hidden' &&
						style.display !== 'none' &&
						rect.bottom > 0 &&
						rect.top < document.documentElement.scrollHeight
					);
				})
				.map((el, index) => {
					const rect = el.getBoundingClientRect();
					const role = el.getAttribute('role');

					return {
						selector: el.tagName.toLowerCase() + (el.type ? `[type="${el.type}"]` : ''),
						type: el.type || el.tagName.toLowerCase(),
						role: role,
						placeholder: el.placeholder || '',
						name: el.name || '',
						id: el.id || '',
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						isInViewport: rect.top >= 0 && rect.top < window.innerHeight,
						index: index
					};
				});
		});

		if (formElements.length === 0) {
			log(`    └─ 📝 <span style="color: #888;">No interactive form elements found</span>`);
			return false;
		}

		log(`    └─ 📝 Found ${formElements.length} form element(s) to interact with`);

		// Pick a random form element to interact with
		const target = formElements[Math.floor(Math.random() * formElements.length)];

		// Get the actual element handle using robust selector strategies
		const element = await page.evaluateHandle(targetInfo => {
			let el = null;

			// Strategy 1: Try ID selector (if valid)
			if (targetInfo.id) {
				try {
					el = document.getElementById(targetInfo.id);
					if (el) return el;
				} catch (e) {
					/* continue */
				}
			}

			// Strategy 2: Try name selector
			if (targetInfo.name) {
				try {
					el = document.querySelector(`${targetInfo.selector}[name="${targetInfo.name}"]`);
					if (el) return el;
				} catch (e) {
					/* continue */
				}
			}

			// Strategy 3: Try role selector for special elements
			if (targetInfo.role) {
				try {
					const roleElements = Array.from(document.querySelectorAll(`[role="${targetInfo.role}"]`));
					if (roleElements[targetInfo.index]) return roleElements[targetInfo.index];
				} catch (e) {
					/* continue */
				}
			}

			// Strategy 4: Use index-based selection as fallback
			try {
				const elements = Array.from(document.querySelectorAll(targetInfo.selector));
				if (elements[targetInfo.index]) return elements[targetInfo.index];
			} catch (e) {
				/* continue */
			}

			return null;
		}, target);

		// Convert evaluateHandle result to ElementHandle
		const elementHandle = element.asElement();
		if (!elementHandle) {
			log(`    └─ ⚠️ <span style="color: #F8BC3B;">Could not find form element</span>`);
			return false;
		}

		// Use shared utilities to fill the form element based on type
		let success = false;
		let action = '';

		if (target.role === 'radiogroup') {
			success = await fillRadioGroup(page, elementHandle, 2, log);
			action = `🔘 <span style="color: #9B59B6;">Radio group selected</span>`;
		} else if (target.type === 'checkbox' || target.role === 'checkbox') {
			success = await toggleCheckbox(page, elementHandle, log);
			action = `☑️ <span style="color: #2ECC71;">Checkbox toggled</span>`;
		} else if (target.type === 'select') {
			success = await fillSelectDropdown(page, elementHandle, null, log);
			action = `🔽 <span style="color: #9B59B6;">Select option chosen</span>`;
		} else {
			// Text input, textarea, or other input types
			success = await fillTextInput(page, elementHandle, null, log);

			// Sometimes submit (30%), sometimes just leave it
			if (Math.random() < 0.3) {
				await page.keyboard.press('Enter');
				action = `📝 <span style="color: #07B096;">Form submitted</span> in ${target.type} field`;
			} else {
				action = `📝 <span style="color: #80E1D9;">Form filled</span> in ${target.type} field <span style="color: #888;">(abandoned)</span>`;
			}
		}

		if (success) {
			log(`    └─ ${action}`);
		}

		return success;
	} catch (error) {
		// Log specific error but don't crash
		if (error.message && !error.message.includes('Target closed')) {
			log(`    └─ ⚠️ <span style="color: #F8BC3B;">Form interaction failed:</span> ${error.message}`);
		}
		return false;
	}
}
