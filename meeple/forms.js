/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import { formTestData } from './entities.js';
import u from 'ak-tools';

// Click fuzziness configuration for form interactions
const CLICK_FUZZINESS = {
	FORM_FIELD: 0.35     // ±35% for form field clicks
};

/**
 * Interact with forms - search boxes, email inputs, etc.
 */
export async function interactWithForms(page, log = console.log) {
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
		const targetX = target.rect.x + (target.rect.width * 0.5) + u.rand(-target.rect.width * CLICK_FUZZINESS.FORM_FIELD, target.rect.width * CLICK_FUZZINESS.FORM_FIELD);
		const targetY = target.rect.y + (target.rect.height * 0.5) + u.rand(-target.rect.height * CLICK_FUZZINESS.FORM_FIELD, target.rect.height * CLICK_FUZZINESS.FORM_FIELD);

		await page.mouse.click(targetX, targetY);
		await u.sleep(u.rand(100, 300));

		// Choose realistic search terms based on input type
		const searchTerms = formTestData;

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