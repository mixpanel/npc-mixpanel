/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').ElementHandle} ElementHandle */

import {
	primaryButtonSelectors,
	regularButtonSelectors,
	navigationSelectors,
	contentSelectors,
	formTestData,
	actionWords,
	interactiveSelectors
} from './entities.js';
import { randomBetween } from './utils.js';

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
		delay = Math.random() * 400 + 100; // 100-500ms (was 200-1000ms)
	} else if (waitType < 0.9) {
		// Medium pause (30% of the time)
		delay = Math.random() * 1000 + 500; // 500-1500ms (was 1-3 seconds)
	} else {
		// Longer pause (10% of the time)
		delay = Math.random() * 2000 + 1000; // 1-3 seconds (was 2-6 seconds)
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
 * @param {Page} page - Puppeteer page object
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
 * @param {Page} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function exploratoryClick(page, log = console.log) {
	try {
		const viewport = await page.viewport();
		
		// Try to find content areas first
		const contentElements = await page.$$(contentSelectors);
		
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
 * @param {Page} page - Puppeteer page object
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
		const currentPos = await page.evaluate((vp) => {
			return { x: window.mouseX || vp.width / 2, y: window.mouseY || vp.height / 2 };
		}, viewport);
		
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
			
			// Variable delay between rage clicks (25-100ms, was 50-200ms)
			if (i < clickCount - 1) {
				const interClickDelay = 25 + Math.random() * 75;
				await new Promise(resolve => setTimeout(resolve, interClickDelay));
			}
		}
		
		// Update final mouse position
		await page.evaluate((x, y) => {
			window.mouseX = x;
			window.mouseY = y;
		}, boundedPos.x, boundedPos.y);
		
		// Brief pause after rage clicking (frustration/recovery time)
		const recoveryTime = 250 + Math.random() * 500; // 0.25-0.75s (was 0.5-1.5s)
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
 * @param {Page} page - Puppeteer page object
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
 * @param {Page} page - Puppeteer page object
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
 * @param {Page} page - Puppeteer page object
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

/**
 * Smart click targeting - prioritizes elements users actually click
 * @param  {import('puppeteer').Page} page
 */
export async function clickStuff(page, hotZones = [], log = console.log) {
	try {
		// If we have hot zones, prefer them (80% chance to use hot zone)
		if (hotZones.length > 0 && Math.random() < 0.8) {
			// Select from hot zones with weighted probability based on priority
			const weightedHotZones = [];
			hotZones.forEach(zone => {
				for (let i = 0; i < zone.priority; i++) {
					weightedHotZones.push(zone);
				}
			});

			const selectedZone = weightedHotZones[Math.floor(Math.random() * weightedHotZones.length)];

			// More natural click positioning within the hot zone
			const targetX = selectedZone.x + (Math.random() - 0.5) * 2 * selectedZone.width * CLICK_FUZZINESS.HOT_ZONE;
			const targetY = selectedZone.y + (Math.random() - 0.5) * 2 * selectedZone.height * CLICK_FUZZINESS.HOT_ZONE;

			// Slower, more realistic mouse movement to target
			await moveMouse(page,
				Math.random() * page.viewport().width,
				Math.random() * page.viewport().height,
				targetX,
				targetY,
				selectedZone.width,
				selectedZone.height,
				log
			);

			// More realistic pause before clicking (humans don't click immediately)
			await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100)); // 100-400ms (was 200-800ms)

			// Natural click with slight delay
			await page.mouse.click(targetX, targetY, {
				delay: Math.random() * 50 + 25, // 25-75ms (was 50-150ms)
				count: 1,
				button: 'left'
			});

			log(`    └─ 👆 <span style="color: #07B096;">Clicked hot zone</span> ${selectedZone.tag}: "<span style="color: #FEDE9B;">${selectedZone.text}</span>" <span style="color: #888;">(priority: ${selectedZone.priority})</span>`);

			// Pause after click to see results
			await new Promise(resolve => setTimeout(resolve, Math.random() * 350 + 150)); // 150-500ms (was 300-1000ms)
			return true;
		}

		// Fallback: Get all potentially clickable elements with priority scoring
		const targetInfo = await page.evaluate((selectors) => {
			const elements = [];

			// Priority 1: Primary action buttons (highest priority)
			const primaryButtons = document.querySelectorAll(selectors.primary);
			primaryButtons.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 10,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			// Priority 2: Regular buttons and obvious clickables
			const buttons = document.querySelectorAll(selectors.regular);
			buttons.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 7,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			// Priority 3: Navigation and menu items
			const navItems = document.querySelectorAll(selectors.navigation);
			navItems.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 5,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			// Priority 4: Content headings and cards (lower priority)
			const contentElements = document.querySelectorAll(selectors.content);
			contentElements.forEach(el => {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
					elements.push({
						priority: 2,
						selector: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						text: el.textContent?.trim().substring(0, 50) || '',
						tag: el.tagName.toLowerCase()
					});
				}
			});

			return elements;
		}, {
			primary: primaryButtonSelectors,
			regular: regularButtonSelectors,
			navigation: navigationSelectors,
			content: contentSelectors
		});

		if (targetInfo.length === 0) return false;

		// Weight selection by priority (higher priority = more likely to be selected)
		const weightedElements = [];
		targetInfo.forEach(info => {
			// Add element multiple times based on priority for weighted selection
			for (let i = 0; i < info.priority; i++) {
				weightedElements.push(info);
			}
		});

		const selectedInfo = weightedElements[Math.floor(Math.random() * weightedElements.length)];
		const rect = selectedInfo.rect;

		// More natural click positioning within the element
		const targetX = rect.x + (rect.width * 0.5) + (Math.random() - 0.5) * 2 * rect.width * CLICK_FUZZINESS.REGULAR_ELEMENT;
		const targetY = rect.y + (rect.height * 0.5) + (Math.random() - 0.5) * 2 * rect.height * CLICK_FUZZINESS.REGULAR_ELEMENT;

		// Natural mouse movement to target
		await moveMouse(page,
			Math.random() * page.viewport().width,
			Math.random() * page.viewport().height,
			targetX,
			targetY,
			rect.width,
			rect.height,
			log
		);

		// More realistic pause before clicking (humans take time to aim)
		await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100)); // 100-400ms (was 200-800ms)

		// Natural click with more realistic timing
		await page.mouse.click(targetX, targetY, {
			delay: Math.random() * 50 + 25, // 25-75ms (was 50-150ms)
			count: 1,
			button: 'left'
		});

		log(`    └─ 👆 <span style="color: #07B096;">Clicked</span> ${selectedInfo.tag}: "<span style="color: #FEDE9B;">${selectedInfo.text}</span>" <span style="color: #888;">(priority: ${selectedInfo.priority})</span>`);

		// Click multiplier logic - 25% chance to perform additional rapid clicks
		if (Math.random() < 0.25) {
			const additionalClicks = Math.floor(Math.random() * 2) + 1; // 1-2 additional clicks

			for (let i = 0; i < additionalClicks; i++) {
				// Brief pause between rapid clicks
				await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50)); // 50-150ms (was 100-300ms)

				// Nearby click with smaller fuzziness (frustrated clicking behavior)
				const nearbyX = rect.x + (rect.width * 0.5) + (Math.random() - 0.5) * rect.width * 0.3;
				const nearbyY = rect.y + (rect.height * 0.5) + (Math.random() - 0.5) * rect.height * 0.3;

				// Ensure click stays within viewport bounds
				const bounded = boundClickPosition(nearbyX, nearbyY, page.viewport());
				await page.mouse.click(bounded.x, bounded.y);
				log(`    ├─ 👆 <span style="color: #DA6B16;">Rapid click ${i + 1}/${additionalClicks}</span> near target (frustrated/double-tap behavior)`);
			}
		}

		// Pause after click to see results (more realistic)
		await new Promise(resolve => setTimeout(resolve, Math.random() * 350 + 150)); // 150-500ms (was 300-1000ms)

		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Intelligent scrolling that feels natural and content-aware
 */
export async function intelligentScroll(page, hotZones = [], log = console.log) {
	try {
		const scrollInfo = await page.evaluate(() => {
			const scrollHeight = document.documentElement.scrollHeight;
			const viewportHeight = window.innerHeight;
			const currentScroll = window.pageYOffset;
			const maxScroll = scrollHeight - viewportHeight;

			// Check if we can scroll
			if (scrollHeight <= viewportHeight) return null;

			// Find scroll targets (content sections)
			const sections = document.querySelectorAll('article, section, .content, main, [class*="post"], [class*="card"]');
			const targets = [];

			sections.forEach(section => {
				const rect = section.getBoundingClientRect();
				if (rect.height > 100) { // Only substantial content
					targets.push({
						top: section.offsetTop,
						height: rect.height
					});
				}
			});

			return {
				scrollHeight,
				viewportHeight,
				currentScroll,
				maxScroll,
				targets: targets.slice(0, 5) // Limit to first 5 sections
			};
		});

		if (!scrollInfo) return false;

		let targetScroll;

		// If we have hot zones, prefer scrolling towards them (70% chance)
		if (hotZones.length > 0 && Math.random() < 0.7) {
			// Find hot zones that are not currently visible
			const currentViewportTop = scrollInfo.currentScroll;
			const currentViewportBottom = scrollInfo.currentScroll + scrollInfo.viewportHeight;

			const targetZones = hotZones.filter(zone => {
				return zone.y < currentViewportTop - 100 || zone.y > currentViewportBottom + 100;
			});

			if (targetZones.length > 0) {
				// Scroll towards a high-priority hot zone
				const sortedZones = targetZones.sort((a, b) => b.priority - a.priority);
				const targetZone = sortedZones[Math.floor(Math.random() * Math.min(3, sortedZones.length))]; // Pick from top 3
				targetScroll = targetZone.y - (scrollInfo.viewportHeight * 0.3); // Center zone in viewport
				log(`    └─ 📜 <span style="color: #F8BC3B;">Scrolling toward hot zone:</span> ${targetZone.tag} "${targetZone.text}"`);
			} else {
				// All hot zones visible, do regular content scroll
				if (scrollInfo.targets.length > 0) {
					const target = scrollInfo.targets[Math.floor(Math.random() * scrollInfo.targets.length)];
					targetScroll = target.top - (scrollInfo.viewportHeight * 0.1);
				} else {
					const scrollDirection = Math.random() < 0.8 ? 1 : -1;
					const scrollDistance = scrollInfo.viewportHeight * (0.3 + Math.random() * 0.7);
					targetScroll = scrollInfo.currentScroll + (scrollDistance * scrollDirection);
				}
			}
		} else if (scrollInfo.targets.length > 0 && Math.random() < 0.7) {
			// 70% chance to scroll to content section
			const target = scrollInfo.targets[Math.floor(Math.random() * scrollInfo.targets.length)];
			targetScroll = target.top - (scrollInfo.viewportHeight * 0.1); // Leave some margin
		} else {
			// Random scroll
			const scrollDirection = Math.random() < 0.8 ? 1 : -1; // 80% down, 20% up
			const scrollDistance = scrollInfo.viewportHeight * (0.3 + Math.random() * 0.7); // 30-100% of viewport
			targetScroll = scrollInfo.currentScroll + (scrollDistance * scrollDirection);
		}

		// Clamp to valid range
		targetScroll = Math.max(0, Math.min(scrollInfo.maxScroll, targetScroll));

		// Smooth scroll
		await page.evaluate((target) => {
			window.scrollTo({
				top: target,
				behavior: 'smooth'
			});
		}, targetScroll);

		// Wait for scroll to complete (more realistic timing)
		await new Promise(resolve => setTimeout(resolve, Math.random() * 350 + 400)); // 400-750ms (was 800-1500ms)

		log(`    └─ 📜 <span style="color: #BCF0F0;">Scrolled</span> to position <span style="color: #FEDE9B;">${Math.round(targetScroll)}</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Natural mouse movement without clicking - simulates reading/hovering behavior
 */
export async function naturalMouseMovement(page, hotZones = [], log = console.log) {
	try {
		let target;

		// 60% chance to move near hot zones for more realistic mouse tracking
		if (hotZones.length > 0 && Math.random() < 0.6) {
			// Select a hot zone but don't actually interact with it - just move near it
			const zone = hotZones[Math.floor(Math.random() * hotZones.length)];
			target = {
				x: zone.x + (Math.random() - 0.5) * 160, // Move near but not exactly on the hot zone
				y: zone.y + (Math.random() - 0.5) * 120,
				source: 'near hot zone'
			};
		} else {
			// Move to readable content areas
			const contentInfo = await page.evaluate(() => {
				const elements = document.querySelectorAll('p, h1, h2, h3, article, [class*="content"], [class*="text"]');
				const targets = [];

				elements.forEach(el => {
					const rect = el.getBoundingClientRect();
					if (rect.width > 100 && rect.height > 20 && rect.top < window.innerHeight && rect.top > 0) {
						targets.push({
							x: rect.x + rect.width * 0.5,
							y: rect.y + rect.height * 0.5,
							width: rect.width,
							height: rect.height
						});
					}
				});

				return targets.slice(0, 10); // Limit to first 10 elements
			});

			if (contentInfo.length === 0) return false;

			const contentTarget = contentInfo[Math.floor(Math.random() * contentInfo.length)];
			target = {
				x: contentTarget.x + (Math.random() - 0.5) * contentTarget.width * 0.6,
				y: contentTarget.y + (Math.random() - 0.5) * contentTarget.height * 0.6,
				source: 'content area'
			};
		}

		// Ensure target is within viewport
		target.x = Math.max(50, Math.min(page.viewport().width - 50, target.x));
		target.y = Math.max(50, Math.min(page.viewport().height - 50, target.y));

		await moveMouse(page,
			Math.random() * page.viewport().width,
			Math.random() * page.viewport().height,
			target.x,
			target.y,
			100,
			30,
			log
		);

		// Longer, more realistic pause (users move mouse then pause to read/think)
		await new Promise(resolve => setTimeout(resolve, Math.random() * 600 + 400)); // 400-1000ms (was 800-2000ms)

		// Track mouse movement for heatmap data
		await trackMouseMovement(page, target, log);

		log(`    └─ 🖱️ <span style="color: #80E1D9;">Mouse moved</span> to ${target.source} <span style="color: #888;">(reading/scanning behavior)</span> - <span style="color: #4ECDC4;">heatmap tracked</span>`);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Hover over elements to trigger dropdowns, tooltips, etc.
 */
export async function hoverOverElements(page, hotZones = [], persona = null, hoverHistory = [], log = console.log) {
	try {
		let target;

		// Return visit behavior - sometimes revisit previously hovered elements
		if (hoverHistory.length > 0 && Math.random() < 0.25) { // 25% chance to return to previous element
			const recentElements = hoverHistory.slice(-5); // Consider last 5 hovered elements
			const revisitTarget = recentElements[Math.floor(Math.random() * recentElements.length)];

			// Check if the previous element is still valid and visible
			const isValidForRevisit = await page.evaluate((prevTarget) => {
				const element = document.querySelector(prevTarget.selector);
				if (!element) return false;

				const rect = element.getBoundingClientRect();
				return rect.width > 30 && rect.height > 20 && rect.top < window.innerHeight && rect.top > 0;
			}, revisitTarget);

			if (isValidForRevisit) {
				target = {
					...revisitTarget,
					isRevisit: true
				};
				log(`    └─ 🔄 <span style="color: #7856FF;">Revisiting element</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(return visit)</span> - <span style="color: #4ECDC4;">realistic heatmap pattern</span>`);
			}
		}

		// If we have hot zones, prefer them (75% chance to use hot zone)
		if (hotZones.length > 0 && Math.random() < 0.75) {
			// Filter to currently visible hot zones
			const visibleZones = hotZones.filter(zone => {
				return zone.y > 0 && zone.y < page.viewport().height;
			});

			if (visibleZones.length > 0) {
				// Weight by priority for selection
				const weightedZones = [];
				visibleZones.forEach(zone => {
					for (let i = 0; i < zone.priority; i++) {
						weightedZones.push(zone);
					}
				});

				target = weightedZones[Math.floor(Math.random() * weightedZones.length)];
				log(`    └─ 🎯 <span style="color: #F8BC3B;">Hovering hot zone</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(priority: ${target.priority})</span>`);
			}
		}

		// Fallback: find regular hover targets
		if (!target) {
			const hoverTargets = await page.evaluate((selectors) => {
				const elements = document.querySelectorAll(selectors.join(', '));
				const targets = [];

				elements.forEach(el => {
					const rect = el.getBoundingClientRect();
					if (rect.width > 50 && rect.height > 20 && rect.top < window.innerHeight && rect.top > 0) {
						targets.push({
							x: rect.x + rect.width / 2,
							y: rect.y + rect.height / 2,
							width: rect.width,
							height: rect.height,
							text: el.textContent?.trim().substring(0, 30) || '',
							tag: el.tagName.toLowerCase()
						});
					}
				});

				return targets.slice(0, 20); // Limit to first 20 for performance
			}, interactiveSelectors);

			if (hoverTargets.length === 0) return false;
			target = hoverTargets[Math.floor(Math.random() * hoverTargets.length)];
		}

		// Move to element
		await moveMouse(page,
			Math.random() * page.viewport().width,
			Math.random() * page.viewport().height,
			target.x + (Math.random() - 0.5) * 20,
			target.y + (Math.random() - 0.5) * 20,
			target.width || 100,
			target.height || 30,
			log
		);

		// Calculate realistic hover duration based on content type and persona
		const hoverDuration = calculateHoverDuration(target, persona);

		// Enhanced logging for heatmap data generation
		const durationSeconds = (hoverDuration / 1000).toFixed(1);
		const dwellCategory = hoverDuration < 2000 ? 'quick' :
			hoverDuration < 5000 ? 'medium' :
				hoverDuration < 10000 ? 'long' : 'very_long';

		log(`    ├─ 🔥 <span style="color: #FF6B6B;">Dwelling for ${durationSeconds}s</span> (${dwellCategory} dwell) - <span style="color: #4ECDC4;">generating heatmap data</span>`);

		// Simulate reading-pattern micro-movements during hover (interleaved with the hover duration)
		await simulateReadingMovements(page, target, hoverDuration, persona, log);

		// Track explicit hover dwell event with Mixpanel
		await trackHoverDwellEvent(page, target, hoverDuration, persona, log);

		if (!target.priority) {
			log(`    └─ 🎯 <span style="color: #FEDE9B;">Hovered</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(${hoverDuration}ms)</span>`);
		} else {
			log(`    └─ 🎯 <span style="color: #FEDE9B;">Hovered hot zone</span> ${target.tag}: "<span style="color: #FEDE9B;">${target.text}</span>" <span style="color: #888;">(${hoverDuration}ms, priority: ${target.priority})</span>`);
		}

		// Add to hover history if not a revisit (to prevent infinite loops)
		if (!target.isRevisit) {
			const historyEntry = {
				x: target.x,
				y: target.y,
				width: target.width,
				height: target.height,
				text: target.text,
				tag: target.tag,
				priority: target.priority,
				selector: target.selector || `${target.tag}:contains("${target.text?.substring(0, 20)}")`,
				timestamp: Date.now(),
				hoverDuration: hoverDuration
			};

			hoverHistory.push(historyEntry);

			// Keep only the last 10 entries to prevent memory issues
			if (hoverHistory.length > 10) {
				hoverHistory.shift();
			}

			log(`      └─ 📊 <span style="color: #4ECDC4;">Heatmap data captured:</span> dwell event + movement tracking + history (${hoverHistory.length}/10 entries)`);
		}

		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Calculate realistic hover duration based on content type and persona
 */
function calculateHoverDuration(target, persona) {
	// Base durations by content type (in milliseconds) - reduced by ~50%
	const contentTypeDurations = {
		// Reading content - longer hover times
		text: { min: 1500, max: 4000 },
		paragraph: { min: 2000, max: 6000 },
		article: { min: 2500, max: 7500 },

		// Interactive elements - moderate hover times
		button: { min: 1000, max: 3000 },
		link: { min: 750, max: 2500 },
		form: { min: 1500, max: 3500 },

		// Media content - variable hover times
		image: { min: 1000, max: 4000 },
		video: { min: 1500, max: 5000 },

		// Navigation - shorter hover times
		nav: { min: 500, max: 1500 },
		menu: { min: 750, max: 2000 },

		// Default for unknown content
		default: { min: 1000, max: 3000 }
	};

	// Determine content type based on target properties
	let contentType = 'default';
	if (target.text && target.text.length > 100) contentType = 'paragraph';
	else if (target.text && target.text.length > 50) contentType = 'text';
	else if (target.tag === 'button' || target.text?.toLowerCase().includes('button')) contentType = 'button';
	else if (target.tag === 'a') contentType = 'link';
	else if (target.tag === 'img') contentType = 'image';
	else if (target.tag === 'video') contentType = 'video';
	else if (target.tag === 'form' || target.tag === 'input' || target.tag === 'textarea') contentType = 'form';
	else if (target.tag === 'nav' || target.text?.toLowerCase().includes('nav')) contentType = 'nav';

	// Get base duration range
	const baseDuration = contentTypeDurations[contentType];

	// Persona-based modifiers
	const personaModifiers = {
		// High engagement personas - longer hover times
		researcher: 1.5,
		ruleSlawyer: 1.4,
		discoverer: 1.3,
		comparison: 1.2,
		rolePlayer: 1.2,

		// Medium engagement personas
		shopper: 1.1,
		explorer: 1.0,
		methodical: 1.1,
		reader: 1.3,

		// Low engagement personas - shorter hover times
		powerUser: 0.7,
		taskFocused: 0.6,
		decisive: 0.5,
		mobileHabits: 0.4,
		murderHobo: 0.3,

		// Variable engagement
		skimmer: 0.8,
		minMaxer: 0.9
	};

	// Apply persona modifier
	const modifier = personaModifiers[persona] || 1.0;
	const adjustedMin = Math.round(baseDuration.min * modifier);
	const adjustedMax = Math.round(baseDuration.max * modifier);

	// Add some randomness for naturalism
	const baseHoverTime = Math.random() * (adjustedMax - adjustedMin) + adjustedMin;

	// Add micro-variations (±10%) for more realistic timing
	const variation = baseHoverTime * 0.1;
	const finalDuration = baseHoverTime + (Math.random() - 0.5) * 2 * variation;

	return Math.max(400, Math.round(finalDuration)); // Minimum 400ms hover (was 800ms)
}

// shortPause function removed - unused (use wait() instead)

/**
 * Perform random mouse movement
 * @param {Page} page - Puppeteer page object  
 * @param {Function} log - Logging function
 * @returns {Promise<boolean>} - Success status
 */
export async function randomMouse(page, log = console.log) {
	try {
		const viewport = await page.viewport();
		const startX = Math.random() * viewport.width;
		const startY = Math.random() * viewport.height;
		const endX = Math.random() * viewport.width;
		const endY = Math.random() * viewport.height;
		
		await moveMouse(page, startX, startY, endX, endY, 50, 50, log);
		return true;
	} catch (error) {
		log(`⚠️ Random mouse error: ${error.message}`);
		return false;
	}
}

/**
 * Perform random scrolling on the page
 * @param {Page} page - Puppeteer page object
 * @param {Function} log - Logging function  
 * @returns {Promise<boolean>} - Success status
 */
export async function randomScroll(page, log = console.log) {
	try {
		const scrollDistance = randomBetween(-500, 500);
		await page.evaluate((distance) => {
			window.scrollBy(0, distance);
		}, scrollDistance);
		log(`📜 Random scroll: ${scrollDistance}px`);
		return true;
	} catch (error) {
		log(`⚠️ Random scroll error: ${error.message}`);
		return false;
	}
}