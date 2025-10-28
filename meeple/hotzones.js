/**
 * Hot Zone Detection Module
 * Extracted from utils/headless.js for better code organization
 *
 * Enhanced hot zone detection optimized for marketing landing pages
 * Incorporates research-based improvements while maintaining simplicity
 */

/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import { interactiveSelectors, actionWords } from './entities.js';

/**
 * Helper function to check if two rectangles overlap
 * @param {Object} rect1 - First rectangle with bounds
 * @param {Object} rect2 - Second rectangle with bounds
 * @returns {boolean} True if rectangles overlap
 */
function rectsOverlap(rect1, rect2) {
	return !(
		rect1.right < rect2.left ||
		rect1.left > rect2.right ||
		rect1.bottom < rect2.top ||
		rect1.top > rect2.bottom
	);
}

/**
 * Enhanced visual prominence scoring based on research
 * @param {Element} element - DOM element to score
 * @param {DOMRect} rect - Element's bounding rectangle
 * @param {Function} getCachedStyle - Function to get cached computed styles
 * @param {Array<string>} actionWords - Array of action words for CTA detection
 * @returns {number} Visual prominence score
 */
function calculateVisualProminence(element, rect, getCachedStyle, actionWords) {
	let score = 0;
	const style = getCachedStyle(element);

	// 1. Size and position scoring (F-pattern weighted)
	const area = rect.width * rect.height;
	const viewportArea = window.innerWidth * window.innerHeight;
	const relativeSize = area / viewportArea;

	// Boost scores for F-pattern positioning (top and left areas)
	const fPatternBoost = rect.top < window.innerHeight * 0.3 ? 1.5 : rect.left < window.innerWidth * 0.4 ? 1.2 : 1;

	if (relativeSize > 0.02)
		score += 3 * fPatternBoost; // Large CTAs
	else if (relativeSize > 0.01)
		score += 2 * fPatternBoost; // Medium buttons
	else if (relativeSize > 0.005)
		score += 1 * fPatternBoost; // Standard links
	else if (relativeSize < 0.001) score -= 2; // Too small

	// 2. Visual hierarchy scoring
	const zIndex = parseInt(style.zIndex) || 0;
	if (zIndex > 1000)
		score += 3; // Modals, popups
	else if (zIndex > 100)
		score += 2; // Floating elements
	else if (zIndex > 10) score += 1; // Elevated elements

	// Color contrast scoring (simplified)
	const bgColor = style.backgroundColor;
	const hasHighContrast = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
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
	const matchedWords = actionWords.filter(word => text.includes(word));
	score += matchedWords.length * 2;

	// Short, punchy text is often a CTA
	if (text.length > 0 && text.length < 25) score += 1;

	return Math.round(score * 10) / 10;
}

/**
 * Check if element is actually visible and interactive
 * @param {Element} el - DOM element to check
 * @param {DOMRect} rect - Element's bounding rectangle
 * @param {CSSStyleDeclaration} style - Element's computed style
 * @returns {boolean} True if element is interactive
 */
function isElementInteractive(el, rect, style) {
	// Skip if hidden
	if (
		style.display === 'none' ||
		style.visibility === 'hidden' ||
		// @ts-ignore
		style.opacity === '0' ||
		el.disabled ||
		el.hidden
	) {
		return false;
	}

	// Check if behind modal/overlay
	if (
		document.querySelector('[role="dialog"]:not([aria-hidden="true"])') ||
		document.querySelector('.modal.show, .modal.open, .modal.active')
	) {
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

/**
 * Enhanced hot zone detection optimized for marketing landing pages
 * Incorporates research-based improvements while maintaining simplicity
 *
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Array>} Array of hot zone objects with coordinates and metadata
 */
export async function identifyHotZones(page) {
	try {
		return await page.evaluate(
			(interactiveSelectors, actionWords) => {
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
					const fPatternBoost =
						rect.top < window.innerHeight * 0.3 ? 1.5 : rect.left < window.innerWidth * 0.4 ? 1.2 : 1;

					if (relativeSize > 0.02)
						score += 3 * fPatternBoost; // Large CTAs
					else if (relativeSize > 0.01)
						score += 2 * fPatternBoost; // Medium buttons
					else if (relativeSize > 0.005)
						score += 1 * fPatternBoost; // Standard links
					else if (relativeSize < 0.001) score -= 2; // Too small

					// 2. Visual hierarchy scoring
					const zIndex = parseInt(style.zIndex) || 0;
					if (zIndex > 1000)
						score += 3; // Modals, popups
					else if (zIndex > 100)
						score += 2; // Floating elements
					else if (zIndex > 10) score += 1; // Elevated elements

					// Color contrast scoring (simplified)
					const bgColor = style.backgroundColor;
					const hasHighContrast = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
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
					const matchedWords = actionWords.filter(word => text.includes(word));
					score += matchedWords.length * 2;

					// Short, punchy text is often a CTA
					if (text.length > 0 && text.length < 25) score += 1;

					// 6. ENHANCED: Form element scoring
					const tagName = element.tagName.toLowerCase();
					const role = element.getAttribute('role');
					const type = element.type || '';

					// Form inputs and interactive elements get bonus points
					if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
						score += 3; // Forms are important interactive elements
						if (!element.disabled && !element.readOnly) score += 1;
					}

					// Radio groups and checkboxes
					if (role === 'radiogroup' || role === 'checkbox' || type === 'checkbox' || type === 'radio') {
						score += 3;
					}

					// Form containers
					if (
						tagName === 'form' ||
						element.classList.contains('form-group') ||
						element.classList.contains('input-group')
					) {
						score += 2; // Form containers are good targets
					}

					return Math.round(score * 10) / 10;
				}

				// Check if element is actually visible and interactive
				function isElementInteractive(el, rect, style) {
					// Skip if hidden
					if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || el.hidden) {
						return false;
					}

					// ENHANCED: Form elements can be interactive even if disabled (we can still detect them)
					const tagName = el.tagName.toLowerCase();
					const isFormElement =
						tagName === 'input' ||
						tagName === 'textarea' ||
						tagName === 'select' ||
						tagName === 'form' ||
						el.getAttribute('role') === 'radiogroup' ||
						el.getAttribute('role') === 'checkbox';

					// Disabled forms are still visible targets (just not interactable)
					if (!isFormElement && el.disabled) {
						return false;
					}

					// Check if behind modal/overlay
					if (
						document.querySelector('[role="dialog"]:not([aria-hidden="true"])') ||
						document.querySelector('.modal.show, .modal.open, .modal.active')
					) {
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
					return !(
						rect1.right < rect2.left ||
						rect1.left > rect2.right ||
						rect1.bottom < rect2.top ||
						rect1.top > rect2.bottom
					);
				}

				// Enhanced selector list incorporating ARIA and modern patterns
				// ENHANCED: Now includes form elements as hot zones
				const formSelectors = [
					'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="hidden"])',
					'textarea',
					'select',
					'[role="radiogroup"]',
					'[role="checkbox"]',
					'form',
					'.form-group',
					'.input-group'
				];

				// Analyze elements with batching for performance
				const allElements = [];

				// Add interactive elements
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

				// Add form elements
				formSelectors.forEach(selector => {
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
					if (
						rect.width > 20 &&
						rect.height > 15 &&
						rect.top < window.innerHeight &&
						rect.bottom > 0 &&
						rect.left < window.innerWidth &&
						rect.right > 0 &&
						isElementInteractive(el, rect, style)
					) {
						const visualProminence = calculateVisualProminence(el, rect);

						// Marketing pages often have prominent CTAs
						const baseThreshold = 4; // Lower threshold for marketing sites

						if (visualProminence >= baseThreshold) {
							// ENHANCED: Add form-specific metadata
							const tagName = el.tagName.toLowerCase();
							const role = el.getAttribute('role');
							const isFormElement =
								tagName === 'input' ||
								tagName === 'textarea' ||
								tagName === 'select' ||
								tagName === 'form' ||
								role === 'radiogroup' ||
								role === 'checkbox';

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
								tag: tagName,
								href: el.href || null,
								ariaRole: role,
								ariaLabel: el.getAttribute('aria-label'),
								// Form-specific metadata
								isForm: isFormElement,
								formType: isFormElement ? el.type || tagName : null,
								formName: isFormElement ? el.name : null,
								formPlaceholder: isFormElement ? el.placeholder : null
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

					if (!hasOverlap && filteredZones.length < 25) {
						// Allow more hot zones
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
			},
			interactiveSelectors,
			actionWords
		);
	} catch (error) {
		console.error('Hot zone detection failed:', error);
		return [];
	}
}

// Export helper functions for testing and external use
export { rectsOverlap, calculateVisualProminence, isElementInteractive };
