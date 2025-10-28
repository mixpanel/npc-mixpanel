/**
 * Select a random item from an array with weights
 * @param {Array} items - Array of items to choose from
 * @param {Array} weights - Array of weights corresponding to items
 * @returns {any} - Selected item
 */
export function weightedRandom(items, weights) {
	if (items.length !== weights.length) {
		throw new Error('Items and weights arrays must have the same length');
	}

	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	const random = Math.random() * totalWeight;

	let weightSum = 0;
	for (let i = 0; i < items.length; i++) {
		weightSum += weights[i];
		if (random <= weightSum) {
			return items[i];
		}
	}

	// Fallback to last item
	return items[items.length - 1];
}

/**
 * Simple coin flip utility (50/50 chance)
 * @returns {boolean} - True or false randomly
 */
export function coinFlip() {
	return Math.random() < 0.5;
}

/**
 * Generate random number within a range (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random number between min and max
 */
export function randomBetween(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float within a range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random float between min and max
 */
export function randomFloat(min, max) {
	return Math.random() * (max - min) + min;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise} - Resolves after the delay
 */
export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random delay for natural timing
 * @param {number} baseMs - Base delay in milliseconds
 * @param {number} variancePercent - Variance as percentage (0-1)
 * @returns {number} - Random delay in milliseconds
 */
export function randomDelay(baseMs, variancePercent = 0.3) {
	const variance = baseMs * variancePercent;
	return baseMs + (Math.random() - 0.5) * 2 * variance;
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Parameter (0 to 1)
 * @returns {number} - Interpolated value
 */
export function lerp(a, b, t) {
	return a + (b - a) * t;
}

/**
 * Calculate distance between two points
 * @param {number} x1 - X coordinate of first point
 * @param {number} y1 - Y coordinate of first point
 * @param {number} x2 - X coordinate of second point
 * @param {number} y2 - Y coordinate of second point
 * @returns {number} - Distance between points
 */
export function distance(x1, y1, x2, y2) {
	return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Shuffle an array in place (Fisher-Yates shuffle)
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
export function shuffle(array) {
	const arr = [...array]; // Create a copy
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}
