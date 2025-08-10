import {
	primaryButtonSelectors,
	regularButtonSelectors,
	navigationSelectors,
	contentSelectors,
	formTestData,
	actionWords,
	interactiveSelectors
} from './entities.js';

// Click fuzziness configuration for different interaction types
export const CLICK_FUZZINESS = {
	HOT_ZONE: 0.5,        // ±50% (increased from ±30%)
	REGULAR_ELEMENT: 0.4,  // ±40% (increased from ±20%)
	FORM_FIELD: 0.35,     // ±35% (increased from ±20%)
	EXPLORATORY: 0.6      // ±60% for random exploratory clicks
};

/**
 * Utility function to ensure clicks stay within viewport bounds
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate 
 * @param {Object} viewport - Viewport dimensions
 * @returns {Object} - Bounded coordinates
 */
export function boundClickPosition(x, y, viewport) {
	return {
		x: Math.max(0, Math.min(viewport.width, x)),
		y: Math.max(0, Math.min(viewport.height, y))
	};
}

/**
 * Simple coin flip utility
 * @returns {boolean} - True or false randomly
 */
export function coinFlip() {
	return Math.random() < 0.5;
}

/**
 * Natural wait function with variable timing
 * @returns {Promise} - Resolves after random delay
 */
export async function wait() {
	const waitType = Math.random();
	let delay;
	
	if (waitType < 0.6) {
		// Quick pause (60% of the time)
		delay = Math.random() * 800 + 200; // 200-1000ms
	} else if (waitType < 0.9) {
		// Medium pause (30% of the time)
		delay = Math.random() * 2000 + 1000; // 1-3 seconds
	} else {
		// Longer pause (10% of the time)
		delay = Math.random() * 4000 + 2000; // 2-6 seconds
	}
	
	await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Calculate point on a cubic bezier curve
 * @param {Object} p0 - Start point {x, y}
 * @param {Object} p1 - Control point 1 {x, y}
 * @param {Object} p2 - Control point 2 {x, y}
 * @param {Object} p3 - End point {x, y}
 * @param {number} t - Parameter (0 to 1)
 * @returns {Object} - Point on curve {x, y}
 */
export function bezierPoint(p0, p1, p2, p3, t) {
	const cX = 3 * (p1.x - p0.x);
	const bX = 3 * (p2.x - p1.x) - cX;
	const aX = p3.x - p0.x - cX - bX;
	
	const cY = 3 * (p1.y - p0.y);
	const bY = 3 * (p2.y - p1.y) - cY;
	const aY = p3.y - p0.y - cY - bY;
	
	return {
		x: aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0.x,
		y: aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0.y
	};
}

/**
 * Generate humanized mouse movement path with natural imperfections
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 * @param {number} steps - Number of steps in the path
 * @returns {Array} - Array of {x, y} points
 */
export function generateHumanizedPath(startX, startY, endX, endY, steps) {
	const path = [];
	const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
	
	// Adjust steps based on distance - more steps for longer movements
	const adjustedSteps = Math.max(steps, Math.floor(distance / 10));
	
	// Control points for bezier curve to create natural arcs
	const midX = (startX + endX) / 2;
	const midY = (startY + endY) / 2;
	
	// Add some randomness to the control points
	const controlOffset = Math.min(distance * 0.2, 50);
	const control1X = midX + (Math.random() - 0.5) * controlOffset;
	const control1Y = midY + (Math.random() - 0.5) * controlOffset;
	const control2X = midX + (Math.random() - 0.5) * controlOffset;
	const control2Y = midY + (Math.random() - 0.5) * controlOffset;
	
	const p0 = { x: startX, y: startY };
	const p1 = { x: control1X, y: control1Y };
	const p2 = { x: control2X, y: control2Y };
	const p3 = { x: endX, y: endY };
	
	for (let i = 0; i <= adjustedSteps; i++) {
		const t = i / adjustedSteps;
		const point = bezierPoint(p0, p1, p2, p3, t);
		
		// Add natural tremor - small random variations
		const tremor = Math.min(3, distance * 0.01);
		point.x += (Math.random() - 0.5) * tremor;
		point.y += (Math.random() - 0.5) * tremor;
		
		// Add occasional micro-corrections (humans don't move perfectly straight)
		if (i > 0 && i < adjustedSteps && Math.random() < 0.1) {
			const correction = Math.min(5, distance * 0.02);
			point.x += (Math.random() - 0.5) * correction;
			point.y += (Math.random() - 0.5) * correction;
		}
		
		path.push(point);
	}
	
	return path;
}

/**
 * Natural mouse movement with humanized path
 * @param {Object} page - Puppeteer page object
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} endX - Ending X coordinate
 * @param {number} endY - Ending Y coordinate
 * @param {Function} log - Logging function
 */
export async function moveMouse(page, startX, startY, endX, endY, log = null) {
	try {
		const steps = Math.max(10, Math.floor(Math.random() * 20) + 10);
		const path = generateHumanizedPath(startX, startY, endX, endY, steps);
		
		for (let i = 0; i < path.length; i++) {
			const point = path[i];
			await page.mouse.move(point.x, point.y);
			
			// Variable delay between movements for natural feel
			const delay = Math.random() * 10 + 5; // 5-15ms
			await new Promise(resolve => setTimeout(resolve, delay));
		}
		return true;
	} catch (error) {
		if (log) log(`⚠️ Mouse movement error: ${error.message}`);
		return false;
	}
}

/**
 * Perform exploratory clicking in content areas
 * @param {Object} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function exploratoryClick(page, log = console.log) {
	try {
		const viewport = await page.viewport();
		
		// Try to find content areas first
		const contentElements = await page.$$(contentSelectors.join(', '));
		
		let targetX, targetY;
		
		if (contentElements.length > 0 && Math.random() < 0.7) {
			// Click in a content area (70% of the time)
			const element = contentElements[Math.floor(Math.random() * contentElements.length)];
			const box = await element.boundingBox();
			
			if (box && box.width > 0 && box.height > 0) {
				const fuzziness = CLICK_FUZZINESS.REGULAR_ELEMENT;
				const fuzzX = (Math.random() - 0.5) * 2 * fuzziness * box.width;
				const fuzzY = (Math.random() - 0.5) * 2 * fuzziness * box.height;
				
				targetX = box.x + box.width / 2 + fuzzX;
				targetY = box.y + box.height / 2 + fuzzY;
			}
		}
		
		// Fallback to random position in content area
		if (!targetX || !targetY) {
			const fuzziness = CLICK_FUZZINESS.EXPLORATORY;
			const marginX = viewport.width * 0.1; // 10% margin
			const marginY = viewport.height * 0.1;
			
			targetX = marginX + Math.random() * (viewport.width - 2 * marginX);
			targetY = marginY + Math.random() * (viewport.height - 2 * marginY);
			
			// Add fuzziness
			targetX += (Math.random() - 0.5) * 2 * fuzziness * 50;
			targetY += (Math.random() - 0.5) * 2 * fuzziness * 50;
		}
		
		// Ensure click stays in viewport
		const boundedPos = boundClickPosition(targetX, targetY, viewport);
		
		// Get current mouse position for natural movement
		const currentPos = await page.evaluate(() => {
			return { x: window.mouseX || 0, y: window.mouseY || 0 };
		});
		
		// Natural mouse movement to target
		await moveMouse(page, currentPos.x || 100, currentPos.y || 100, boundedPos.x, boundedPos.y, log);
		
		// Click with natural timing
		await page.mouse.click(boundedPos.x, boundedPos.y, {
			delay: Math.random() * 50 + 25 // 25-75ms click duration
		});
		
		log(`🎯 Exploratory click at (${Math.round(boundedPos.x)}, ${Math.round(boundedPos.y)})`);
		
		// Update mouse position for tracking
		await page.evaluate((x, y) => {
			window.mouseX = x;
			window.mouseY = y;
		}, boundedPos.x, boundedPos.y);
		
	} catch (error) {
		log(`⚠️ Exploratory click failed: ${error.message}`);
	}
}

/**
 * Track mouse movement for heatmap data
 * @param {Object} page - Puppeteer page object
 * @param {Object} target - Target element information
 * @param {Function} log - Logging function
 */
export async function trackMouseMovement(page, target, log = null) {
	try {
		// Track mouse movement via Mixpanel if available
		await page.evaluate((targetData) => {
			if (typeof window.mixpanel !== 'undefined' && window.mixpanel.track) {
				window.mixpanel.track('Mouse Movement', {
					target_element: targetData.tagName || 'unknown',
					target_text: (targetData.innerText || '').substring(0, 100),
					target_id: targetData.id || null,
					target_class: targetData.className || null,
					x: targetData.x || 0,
					y: targetData.y || 0
				});
			}
		}, target);
		
		if (log) log(`🖱️ Mouse movement tracked`);
	} catch (error) {
		if (log) log(`⚠️ Mouse movement tracking error: ${error.message}`);
	}
}

/**
 * Simulate reading movements during hover
 * @param {Object} page - Puppeteer page object
 * @param {Object} target - Target element information
 * @param {number} hoverDuration - Duration of hover in milliseconds
 * @param {string} persona - User persona affecting reading behavior
 * @param {Function} log - Logging function
 */
export async function simulateReadingMovements(page, target, hoverDuration, persona, log) {
	// Determine reading behavior based on persona
	let readingIntensity = 1.0; // Default intensity
	
	if (persona === 'researcher' || persona === 'powerUser') {
		readingIntensity = 1.5; // More thorough reading
	} else if (persona === 'quickBrowser' || persona === 'impulse') {
		readingIntensity = 0.7; // Faster, less thorough
	}
	
	const movements = Math.floor((hoverDuration / 1000) * readingIntensity * 3); // 3 movements per second base
	
	for (let i = 0; i < movements; i++) {
		const progress = i / movements;
		
		// Simulate reading pattern - left to right, top to bottom
		const readingX = target.x + (target.width * 0.1) + (target.width * 0.8 * (progress % 1));
		const readingY = target.y + (target.height * 0.2) + (target.height * 0.6 * Math.floor(progress * 3) / 3);
		
		// Add natural micro-movements
		const jitterX = (Math.random() - 0.5) * 8;
		const jitterY = (Math.random() - 0.5) * 4;
		
		const finalX = readingX + jitterX;
		const finalY = readingY + jitterY;
		
		try {
			await page.mouse.move(finalX, finalY);
			await new Promise(resolve => setTimeout(resolve, hoverDuration / movements));
		} catch (error) {
			// Continue with remaining movements even if one fails
		}
	}
}

/**
 * Track hover dwell event with comprehensive data
 * @param {Object} page - Puppeteer page object
 * @param {Object} target - Target element information
 * @param {number} hoverDuration - Duration of hover in milliseconds
 * @param {string} persona - User persona
 * @param {Function} log - Logging function
 */
export async function trackHoverDwellEvent(page, target, hoverDuration, persona, log = null) {
	try {
		// Simulate reading movements during hover
		await simulateReadingMovements(page, target, hoverDuration, persona, log);
		
		// Track the dwell event
		await page.evaluate((targetData, duration, personaType) => {
			if (typeof window.mixpanel !== 'undefined' && window.mixpanel.track) {
				window.mixpanel.track('Hover Dwell', {
					target_element: targetData.tagName || 'unknown',
					target_text: (targetData.innerText || '').substring(0, 200),
					target_id: targetData.id || null,
					target_class: targetData.className || null,
					dwell_duration: duration,
					persona: personaType,
					x: targetData.x || 0,
					y: targetData.y || 0,
					width: targetData.width || 0,
					height: targetData.height || 0,
					viewport_width: window.innerWidth,
					viewport_height: window.innerHeight
				});
			}
		}, target, hoverDuration, persona);
		
		if (log) log(`👁️ Hover dwell tracked (${hoverDuration}ms, persona: ${persona})`);
	} catch (error) {
		if (log) log(`⚠️ Hover dwell tracking error: ${error.message}`);
	}
}