import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

/**
 * Generate a random timestamp within the last 5 days for time simulation
 * @param {Function} log - Logging function
 * @returns {number} - Unix timestamp in milliseconds
 */
export function getRandomTimestampWithinLast5Days(log = console.log) {
	const now = Date.now();
	const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);
	const randomTime = fiveDaysAgo + Math.random() * (now - fiveDaysAgo);
	
	const formattedTime = dayjs(randomTime).utc().format('YYYY-MM-DD HH:mm:ss UTC');
	log(`⏰ Simulating past time: ${formattedTime}`);
	
	return randomTime;
}

/**
 * Extract top-level domain from hostname for analytics categorization
 * @param {string} hostname - The hostname to extract TLD from
 * @returns {string} - Top-level domain
 */
export function extractTopLevelDomain(hostname) {
	try {
		const parts = hostname.toLowerCase().split('.');
		if (parts.length >= 2) {
			return parts.slice(-2).join('.');
		}
		return hostname;
	} catch (error) {
		return hostname;
	}
}