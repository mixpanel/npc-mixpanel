import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { retry } from './security.js';
dayjs.extend(utc);

/** 
 * @typedef {import('puppeteer').Page}	Page
 */


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
		if (!hostname || hostname.trim() === '') {
			return '[empty-hostname]';
		}
		
		// Handle IP addresses - return as-is
		if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
			return hostname;
		}
		
		const parts = hostname.toLowerCase().split('.');
		
		// Handle single part hostnames (like localhost)
		if (parts.length === 1) {
			return hostname;
		}
		
		// Handle special cases for common TLD patterns
		if (parts.length >= 3) {
			const lastTwo = parts.slice(-2).join('.');
			const lastThree = parts.slice(-3).join('.');
			
			// Handle common double TLDs like .co.uk, .com.au
			const doubleTlds = ['co.uk', 'com.au', 'org.uk', 'net.au', 'gov.uk'];
			if (doubleTlds.includes(lastTwo)) {
				return lastThree;
			}
			
			// Handle special cases like github.io, blogspot.com
			const specialCases = ['github.io', 'blogspot.com'];
			if (specialCases.includes(lastTwo)) {
				return lastThree;
			}
		}
		
		if (parts.length >= 2) {
			return parts.slice(-2).join('.');
		}
		
		return hostname;
	} catch (error) {
		return hostname;
	}
}

/**
 * Force spoof time in browser by injecting time manipulation code
 * @param {Page} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function forceSpoofTimeInBrowser(page, log = console.log) {
	const spoofedTimestamp = getRandomTimestampWithinLast5Days(log);
	const spoofTimeFunctionString = spoofTime.toString();
	log(`	├─ 🕰️ Spoofing time to: ${dayjs(spoofedTimestamp).toISOString()}`);

	await retry(async () => {
		await page.evaluateOnNewDocument((timestamp, spoofTimeFn) => {
			// eslint-disable-next-line no-new-func
			const injectedFunction = new Function(`return (${spoofTimeFn})`)();
			injectedFunction(timestamp);
		}, spoofedTimestamp, spoofTimeFunctionString);
	});
}

// The time spoofing function that will be serialized and injected
function spoofTime(startTimestamp) {
	function DO_TIME_SPOOF() {
		const actualDate = Date;
		const actualNow = Date.now;
		const actualPerformanceNow = performance.now;

		// Calculate the offset
		const offset = actualNow() - startTimestamp;

		// Override Date constructor
		function FakeDate(...args) {
			if (args.length === 0) {
				return new actualDate(actualNow() - offset);
			}
			// @ts-ignore
			return new actualDate(...args);
		}

		// Copy static methods
		FakeDate.now = () => actualNow() - offset;
		FakeDate.parse = actualDate.parse;
		FakeDate.UTC = actualDate.UTC;

		// Override instance methods
		FakeDate.prototype = actualDate.prototype;

		// Override Date.now
		Date.now = () => actualNow() - offset;

		// Override performance.now
		performance.now = function () {
			const timeSincePageLoad = actualPerformanceNow.call(performance);
			return (actualNow() - offset) - (Date.now() - timeSincePageLoad);
		};

		// Replace window Date
		// @ts-ignore
		window.Date = FakeDate;

		return { spoof: true };
	}
	return DO_TIME_SPOOF();
}