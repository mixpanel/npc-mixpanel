import u from 'ak-tools';
import injectMixpanel from '../utils/injectMixpanel.js';
import { relaxedCSP } from './entities.js';

/**
 * Retry utility function for operations that may fail
 * @param {Function} operation - The operation to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} delay - Delay between retries in milliseconds
 * @returns {Promise<any>} - Result of the operation
 */
export async function retry(operation, maxRetries = 3, delay = 1000) {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await operation();
		} catch (error) {
			if (i === maxRetries - 1) throw error;
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
}

/**
 * Inject Mixpanel into the browser page with multiple fallback strategies
 * @param {Object} page - Puppeteer page object
 * @param {string} username - Username for tracking
 * @param {Object} opts - Options object with masking settings
 * @param {Function} log - Logging function
 */
export async function jamMixpanelIntoBrowser(page, username, opts = {}, log = console.log) {
	const { MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN } = page;
	await retry(async () => {
		try {
			// Primary injection method using function injection
			const injectionResult = await page.evaluate(
				(injectMixpanelCode, username, opts, MIXPANEL_TOKEN) => {
					try {
						// Create a function from the string and execute it
						const injectFunction = new Function('return ' + injectMixpanelCode)();
						return injectFunction(MIXPANEL_TOKEN, username, opts);
					} catch (error) {
						return { success: false, error: error.message };
					}
				},
				injectMixpanel.toString(),
				username,
				opts,
				MIXPANEL_TOKEN
			);

			if (injectionResult && injectionResult.success) {
				log(`✅ Mixpanel injected successfully for ${username}`);
				return true;
			}
			if (injectionResult && !injectionResult.success) {
				log(`⚠️ Primary injection failed for ${username}: ${injectionResult.error}`);
			}

			// Fallback method using createElement if direct injection fails
			log(`⚠️ Primary injection failed for ${username} trying fallback...`);

			const fallbackResult = await page.evaluate(
				(injectMixpanelCode, username, opts, MIXPANEL_TOKEN) => {
					try {
						// Suppress CSP violation errors during injection
						const originalConsoleError = console.error;
						console.error = function (...args) {
							const message = args.join(' ');
							if (message.includes('Content Security Policy') ||
								message.includes('CSP') ||
								message.includes('eval')) {
								return; // Suppress CSP-related errors
							}
							originalConsoleError.apply(console, args);
						};

						// Try createElement approach
						const script = document.createElement('script');
						script.textContent = `(${injectMixpanelCode})('${MIXPANEL_TOKEN}', '${username}', ${JSON.stringify(opts)})`;
						document.head.appendChild(script);

						// Restore original console.error after a delay
						setTimeout(() => {
							console.error = originalConsoleError;
						}, 1000);

						return { success: true, method: 'createElement' };
					} catch (error) {
						return { success: false, error: error.message };
					}
				},
				injectMixpanel.toString(),
				username,
				opts,
				MIXPANEL_TOKEN
			);

			if (fallbackResult && fallbackResult.success) {
				log(`✅ Mixpanel injected via fallback method for ${username}`);
				return true;
			}

			throw new Error(`Both injection methods failed: ${JSON.stringify(fallbackResult)}`);

		} catch (error) {
			log(`❌ Mixpanel injection error for ${username}: ${error.message}`);
			throw error;
		}
	}, 2, 500);
}

/**
 * Fast CSP check and relaxation - only applies if needed (no-op if already relaxed)
 * @param {Object} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function ensureCSPRelaxed(page, log = console.log) {
	try {
		const isRelaxed = await page.evaluate(() => {
			return window.CSP_RELAXED === true;
		});

		if (isRelaxed) {
			return; // Already relaxed, no-op
		}

		await relaxCSP(page, log);
	} catch (error) {
		log(`⚠️ CSP relaxation check failed: ${error.message}`);
		// Continue anyway, better to try than fail
	}
}

/**
 * Fast Mixpanel check and injection - only injects if needed (no-op if already working)
 * @param {Object} page - Puppeteer page object
 * @param {string} username - Username for tracking
 * @param {Object} opts - Options object with masking settings
 * @param {Function} log - Logging function
 */
export async function ensureMixpanelInjected(page, username, opts = {}, log = console.log) {
	try {
		const isInjected = await page.evaluate(() => {
			return typeof window.mixpanel !== 'undefined' && window.mixpanel.track;
		});

		if (isInjected) {
			return; // Already injected, no-op
		}

		await jamMixpanelIntoBrowser(page, username, opts, log);
	} catch (error) {
		log(`⚠️ Mixpanel injection check failed for ${username}: ${error.message}`);
		// Continue anyway, better to try than fail
	}
}

/**
 * Comprehensive CSP and security bypass
 * @param {Object} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function relaxCSP(page, log = console.log) {
	try {
		// Browser-level CSP bypass
		await page.setBypassCSP(true);

		// Request interception to modify security headers
		// await page.setRequestInterception(true);

		// page.on('request', (request) => {
		// 	try {
		// 		request.continue();
		// 	}
		// 	catch (error) {
		// 		// Ignore request processing errors
		// 	}
		// });

		// page.on('response', async (response) => {
		// 	try {
		// 		if (response.request().resourceType() === 'document') {
		// 			// Note: We can't modify headers after response, but we can log for debugging
		// 			const headers = response.headers();
		// 			if (headers['content-security-policy']) {
		// 				// CSP is present but we've bypassed it at browser level
		// 			}
		// 		}
		// 	} catch (error) {
		// 		// Ignore response processing errors
		// 	}
		// });

		// Page context CSP bypass injection
		await page.evaluateOnNewDocument(() => {
			// Mark page as CSP relaxed for future checks
			window.CSP_RELAXED = true;
			window.CSP_WAS_RELAXED = true;
			window.CSP_RELAXED_TIMESTAMP = Date.now();
			window.CSP_EVAL_WORKING = true;

			// Override CSP-related functions if they exist
			if (window.eval) {
				window.originalEval = window.eval;
			}
		});

		// Also set flags in current page context if page is already loaded
		await page.evaluate(() => {
			window.CSP_RELAXED = true;
			window.CSP_WAS_RELAXED = true;
			window.CSP_RELAXED_TIMESTAMP = Date.now();
			window.CSP_EVAL_WORKING = true;

			if (window.eval && !window.originalEval) {
				window.originalEval = window.eval;
			}
		});

		// Inject the relaxed CSP script
		await page.addScriptTag({ content: relaxedCSP });

		// Set permissions for common origins
		const context = page.browser().defaultBrowserContext();
		await context.overridePermissions(page.url(), [
			'camera',
			'microphone',
			'geolocation',
			'notifications'
		]);

		log(`🔓 CSP relaxed and permissions set`);

	} catch (error) {
		log(`⚠️ CSP relaxation error: ${error.message}`);
		// Continue anyway - some sites might still work
	}
}

/**
 * Combined function to ensure both CSP relaxation and Mixpanel injection
 * @param {Object} page - Puppeteer page object
 * @param {string} username - Username for tracking
 * @param {boolean} inject - Whether to inject Mixpanel
 * @param {Object} opts - Options object with masking settings
 * @param {Function} log - Logging function
 */
export async function ensurePageSetup(page, username, inject = true, opts = {}, log = console.log) {
	try {
		// Check if CSP is already relaxed
		const cspStatus = await page.evaluate(() => {
			return {
				relaxed: window.CSP_WAS_RELAXED || false,
				timestamp: window.CSP_RELAXED_TIMESTAMP || 0
			};
		});

		// Only relax CSP if not already done
		if (!cspStatus.relaxed) {
			await ensureCSPRelaxed(page, log);
		}

		// Check if Mixpanel is already injected
		const mixpanelStatus = inject ? await page.evaluate(() => {
			return {
				injected: window.MIXPANEL_WAS_INJECTED || false,
				available: typeof window.mixpanel !== 'undefined' && window.mixpanel.track
			};
		}) : { injected: true, available: false };

		// Only inject Mixpanel if requested and not already done
		if (inject && !mixpanelStatus.injected && !mixpanelStatus.available) {
			await ensureMixpanelInjected(page, username, opts, log);
		}

		log(`✅ Page setup complete for ${username} (inject: ${inject})`);
	} catch (error) {
		log(`⚠️ Page setup error for ${username}: ${error.message}`);
		// Don't throw - let the session continue
	}
}