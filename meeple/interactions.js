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
 * Generate highly realistic humanized mouse movement path
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 * @param {number} targetWidth - Width of target element (for Fitts' law)
 * @param {number} targetHeight - Height of target element (for Fitts' law)
 * @returns {Array} - Array of {x, y, timing} points with realistic timing
 */
export function generateHumanizedPath(startX, startY, endX, endY, targetWidth = 50, targetHeight = 50) {
	const path = [];
	const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
	
	// More steps for smoother movement (30-80 based on distance)
	const baseSteps = Math.max(30, Math.min(80, Math.floor(distance / 8)));
	const adjustedSteps = baseSteps + Math.floor(Math.random() * 10); // Add randomness
	
	// Fitts' Law: Movement time increases with distance and decreases with target size
	const targetSize = Math.min(targetWidth, targetHeight);
	const difficultyIndex = Math.log2(distance / targetSize + 1);
	const baseMoveTime = 50 + (difficultyIndex * 80); // 50-600ms base time
	const totalMoveTime = baseMoveTime + (Math.random() - 0.5) * baseMoveTime * 0.3; // ±30% variation
	
	// Create more dynamic control points for realistic arcs
	const angle = Math.atan2(endY - startY, endX - startX);
	const perpAngle = angle + Math.PI / 2;
	
	// Varying arc styles based on distance and randomness
	const arcIntensity = Math.min(distance * 0.3, 120) * (0.3 + Math.random() * 0.7);
	const arcDirection = Math.random() < 0.5 ? 1 : -1;
	
	// Control points that create more natural curves
	const t1 = 0.2 + Math.random() * 0.3; // 20-50% along the path
	const t2 = 0.5 + Math.random() * 0.3; // 50-80% along the path
	
	const control1X = startX + (endX - startX) * t1 + Math.cos(perpAngle) * arcIntensity * arcDirection * 0.7;
	const control1Y = startY + (endY - startY) * t1 + Math.sin(perpAngle) * arcIntensity * arcDirection * 0.7;
	const control2X = startX + (endX - startX) * t2 + Math.cos(perpAngle) * arcIntensity * arcDirection * 0.3;
	const control2Y = startY + (endY - startY) * t2 + Math.sin(perpAngle) * arcIntensity * arcDirection * 0.3;
	
	const p0 = { x: startX, y: startY };
	const p1 = { x: control1X, y: control1Y };
	const p2 = { x: control2X, y: control2Y };
	const p3 = { x: endX, y: endY };
	
	for (let i = 0; i <= adjustedSteps; i++) {
		const progress = i / adjustedSteps;
		
		// Ease-in-out timing for acceleration/deceleration
		const easeProgress = progress < 0.5 ? 
			2 * progress * progress : 
			1 - Math.pow(-2 * progress + 2, 2) / 2;
		
		const point = bezierPoint(p0, p1, p2, p3, easeProgress);
		
		// Progressive tremor (more at start, stabilizes toward end)
		const tremorIntensity = Math.max(2, 8 * (1 - progress * 0.7)); // 8px -> 2px
		const tremorX = (Math.random() - 0.5) * tremorIntensity * (0.5 + Math.random());
		const tremorY = (Math.random() - 0.5) * tremorIntensity * (0.5 + Math.random());
		
		point.x += tremorX;
		point.y += tremorY;
		
		// Micro-corrections (more frequent early in movement)
		if (i > 0 && i < adjustedSteps - 5 && Math.random() < (0.15 * (1 - progress * 0.8))) {
			const correctionScale = Math.min(12, distance * 0.05) * (1 - progress * 0.6);
			point.x += (Math.random() - 0.5) * correctionScale;
			point.y += (Math.random() - 0.5) * correctionScale;
		}
		
		// Add slight overshoot for final approach (last 10% of movement)
		if (progress > 0.9 && progress < 1.0) {
			const overshootFactor = (progress - 0.9) * 10; // 0 to 1
			const overshootDecay = 1 - overshootFactor; // 1 to 0
			const overshootX = (endX - startX) * 0.02 * overshootDecay * Math.random();
			const overshootY = (endY - startY) * 0.02 * overshootDecay * Math.random();
			point.x += overshootX;
			point.y += overshootY;
		}
		
		// Calculate timing for this point (variable speed)
		let pointTiming;
		if (progress < 0.1) {
			// Slow start
			pointTiming = totalMoveTime * 0.3 * (progress / 0.1);
		} else if (progress < 0.85) {
			// Faster middle section
			pointTiming = totalMoveTime * (0.3 + 0.4 * ((progress - 0.1) / 0.75));
		} else {
			// Decelerate for precision
			pointTiming = totalMoveTime * (0.7 + 0.3 * ((progress - 0.85) / 0.15));
		}
		
		path.push({
			x: point.x,
			y: point.y,
			timing: Math.max(1, pointTiming) // Ensure minimum 1ms timing
		});
	}
	
	// Ensure final point is exactly on target (with minor tremor)
	if (path.length > 0) {
		const finalTremor = 1 + Math.random();
		path[path.length - 1].x = endX + (Math.random() - 0.5) * finalTremor;
		path[path.length - 1].y = endY + (Math.random() - 0.5) * finalTremor;
	}
	
	return path;
}

/**
 * Ultra-realistic mouse movement with advanced timing
 * @param {Object} page - Puppeteer page object
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} endX - Ending X coordinate
 * @param {number} endY - Ending Y coordinate
 * @param {number} targetWidth - Width of target element (default 50)
 * @param {number} targetHeight - Height of target element (default 50)
 * @param {Function} log - Logging function
 */
export async function moveMouse(page, startX, startY, endX, endY, targetWidth = 50, targetHeight = 50, log = null) {
	try {
		const path = generateHumanizedPath(startX, startY, endX, endY, targetWidth, targetHeight);
		let lastTiming = 0;
		
		for (let i = 0; i < path.length; i++) {
			const point = path[i];
			await page.mouse.move(Math.round(point.x), Math.round(point.y));
			
			// Use the calculated timing from the path
			const timingDelta = point.timing - lastTiming;
			const actualDelay = Math.max(1, Math.round(timingDelta));
			
			// Add minor random variations to timing (±20%)
			const finalDelay = actualDelay + (Math.random() - 0.5) * actualDelay * 0.2;
			await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.round(finalDelay))));
			
			lastTiming = point.timing;
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
		
		// Natural mouse movement to target (estimate element size for Fitts' law)
		const estimatedWidth = (targetX && targetY) ? 100 : 50; // Larger for content elements
		const estimatedHeight = (targetX && targetY) ? 30 : 30;
		await moveMouse(page, currentPos.x || 100, currentPos.y || 100, boundedPos.x, boundedPos.y, estimatedWidth, estimatedHeight, log);
		
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
 * Perform rage clicking - multiple rapid clicks when frustrated
 * @param {Object} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function rageClick(page, log = console.log) {
	try {
		const viewport = await page.viewport();
		
		// Try to find clickable elements that might be causing frustration
		const frustratingSelectors = [
			'button:not([disabled])',
			'[role="button"]',
			'a[href]',
			'input[type="submit"]',
			'input[type="button"]',
			'.btn',
			'.button',
			'[onclick]'
		].join(', ');
		
		const clickableElements = await page.$$(frustratingSelectors);
		let targetX, targetY, targetWidth = 80, targetHeight = 30;
		
		if (clickableElements.length > 0 && Math.random() < 0.8) {
			// 80% chance to rage click on an actual element
			const element = clickableElements[Math.floor(Math.random() * clickableElements.length)];
			const box = await element.boundingBox();
			
			if (box && box.width > 0 && box.height > 0) {
				targetX = box.x + box.width / 2;
				targetY = box.y + box.height / 2;
				targetWidth = box.width;
				targetHeight = box.height;
				
				// Add some frustration-based imprecision
				const frustrationOffset = 8;
				targetX += (Math.random() - 0.5) * frustrationOffset;
				targetY += (Math.random() - 0.5) * frustrationOffset;
			}
		}
		
		// Fallback to center area if no element found
		if (!targetX || !targetY) {
			targetX = viewport.width / 2 + (Math.random() - 0.5) * 200;
			targetY = viewport.height / 2 + (Math.random() - 0.5) * 200;
		}
		
		// Ensure target stays in viewport
		const boundedPos = boundClickPosition(targetX, targetY, viewport);
		
		// Get current mouse position
		const currentPos = await page.evaluate(() => {
			return { x: window.mouseX || viewport.width / 2, y: window.mouseY || viewport.height / 2 };
		});
		
		// Frustrated/aggressive movement to target (faster, less smooth)
		const frustratedPath = generateFrustratedMousePath(
			currentPos.x || viewport.width / 2, 
			currentPos.y || viewport.height / 2, 
			boundedPos.x, 
			boundedPos.y,
			targetWidth,
			targetHeight
		);
		
		// Execute frustrated movement
		let lastTiming = 0;
		for (let i = 0; i < frustratedPath.length; i++) {
			const point = frustratedPath[i];
			await page.mouse.move(Math.round(point.x), Math.round(point.y));
			
			const timingDelta = point.timing - lastTiming;
			const actualDelay = Math.max(1, Math.round(timingDelta * 0.7)); // 30% faster than normal
			await new Promise(resolve => setTimeout(resolve, actualDelay));
			
			lastTiming = point.timing;
		}
		
		// Perform multiple rapid clicks (3-7 clicks)
		const clickCount = 3 + Math.floor(Math.random() * 5); // 3-7 clicks
		log(`😡 Rage clicking ${clickCount} times at (${Math.round(boundedPos.x)}, ${Math.round(boundedPos.y)})`);
		
		for (let i = 0; i < clickCount; i++) {
			// Add slight position variation for each click (tremor from frustration)
			const clickX = boundedPos.x + (Math.random() - 0.5) * 6;
			const clickY = boundedPos.y + (Math.random() - 0.5) * 6;
			
			// Ensure clicks stay within reasonable bounds
			const finalClickPos = boundClickPosition(clickX, clickY, viewport);
			
			await page.mouse.click(finalClickPos.x, finalClickPos.y, {
				delay: Math.random() * 30 + 10 // 10-40ms click duration (shorter than normal)
			});
			
			// Variable delay between rage clicks (50-200ms)
			if (i < clickCount - 1) {
				const interClickDelay = 50 + Math.random() * 150;
				await new Promise(resolve => setTimeout(resolve, interClickDelay));
			}
		}
		
		// Update final mouse position
		await page.evaluate((x, y) => {
			window.mouseX = x;
			window.mouseY = y;
		}, boundedPos.x, boundedPos.y);
		
		// Brief pause after rage clicking (frustration/recovery time)
		const recoveryTime = 500 + Math.random() * 1000; // 0.5-1.5s
		await new Promise(resolve => setTimeout(resolve, recoveryTime));
		
	} catch (error) {
		log(`⚠️ Rage click failed: ${error.message}`);
	}
}

/**
 * Generate frustrated/aggressive mouse movement path
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 * @param {number} targetWidth - Width of target element
 * @param {number} targetHeight - Height of target element
 * @returns {Array} - Array of {x, y, timing} points with aggressive timing
 */
function generateFrustratedMousePath(startX, startY, endX, endY, targetWidth = 50, targetHeight = 50) {
	const path = [];
	const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
	
	// Fewer steps for more aggressive movement (20-40 steps)
	const adjustedSteps = Math.max(20, Math.min(40, Math.floor(distance / 15))) + Math.floor(Math.random() * 5);
	
	// Faster movement time (40-60% of normal)
	const targetSize = Math.min(targetWidth, targetHeight);
	const difficultyIndex = Math.log2(distance / targetSize + 1);
	const baseMoveTime = (30 + (difficultyIndex * 40)) * (0.4 + Math.random() * 0.2); // Much faster
	
	// More direct path with less smooth curves (frustrated = less patience for smooth arcs)
	const angle = Math.atan2(endY - startY, endX - startX);
	const perpAngle = angle + Math.PI / 2;
	const arcIntensity = Math.min(distance * 0.15, 60) * (0.2 + Math.random() * 0.4); // Less arc
	const arcDirection = Math.random() < 0.5 ? 1 : -1;
	
	const control1X = startX + (endX - startX) * 0.3 + Math.cos(perpAngle) * arcIntensity * arcDirection * 0.5;
	const control1Y = startY + (endY - startY) * 0.3 + Math.sin(perpAngle) * arcIntensity * arcDirection * 0.5;
	const control2X = startX + (endX - startX) * 0.7 + Math.cos(perpAngle) * arcIntensity * arcDirection * 0.2;
	const control2Y = startY + (endY - startY) * 0.7 + Math.sin(perpAngle) * arcIntensity * arcDirection * 0.2;
	
	const p0 = { x: startX, y: startY };
	const p1 = { x: control1X, y: control1Y };
	const p2 = { x: control2X, y: control2Y };
	const p3 = { x: endX, y: endY };
	
	for (let i = 0; i <= adjustedSteps; i++) {
		const progress = i / adjustedSteps;
		
		// More aggressive easing (less smooth)
		const easeProgress = progress < 0.3 ? 
			3 * progress * progress : 
			1 - Math.pow(-3 * progress + 3, 2) / 9;
		
		const point = bezierPoint(p0, p1, p2, p3, easeProgress);
		
		// Higher tremor from frustration/adrenaline
		const tremorIntensity = 4 + Math.random() * 8; // 4-12px tremor
		point.x += (Math.random() - 0.5) * tremorIntensity;
		point.y += (Math.random() - 0.5) * tremorIntensity;
		
		// More frequent corrections (less precision when frustrated)
		if (Math.random() < 0.2) {
			const correctionScale = 8 + Math.random() * 10;
			point.x += (Math.random() - 0.5) * correctionScale;
			point.y += (Math.random() - 0.5) * correctionScale;
		}
		
		// Calculate aggressive timing
		const pointTiming = baseMoveTime * progress;
		
		path.push({
			x: point.x,
			y: point.y,
			timing: Math.max(1, pointTiming)
		});
	}
	
	return path;
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