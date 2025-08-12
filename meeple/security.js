/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */

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
 * Inject Mixpanel into the browser page with multiple fallback strategies including Trusted Types support
 * @param {Page} page - Puppeteer page object
 * @param {string} username - Username for tracking
 * @param {Object} opts - Options object with masking settings
 * @param {Function} log - Logging function
 */
export async function jamMixpanelIntoBrowser(page, username, opts = {}, log = console.log) {
	const { MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN } = page;
	await retry(async () => {
		try {
			// Primary injection method using function injection with Trusted Types support
			const injectionResult = await page.evaluate(
				(injectMixpanelCode, username, opts, MIXPANEL_TOKEN) => {
					try {
						// Check if Trusted Types are enabled
						if (window.trustedTypes && window.trustedTypes.createPolicy) {
							// Create a Trusted Types policy for script injection
							let policy;
							try {
								policy = window.trustedTypes.createPolicy('mixpanel-injection', {
									createScript: (input) => input,
									createScriptURL: (input) => input
								});
							} catch (e) {
								// Policy might already exist, try to get it
								try {
									policy = window.trustedTypes.getPolicy('mixpanel-injection');
								} catch (e2) {
									// Fallback to default policy if available
									policy = window.trustedTypes.defaultPolicy;
								}
							}

							if (policy) {
								// Use Trusted Types policy to create script
								const script = document.createElement('script');
								const trustedScript = policy.createScript(`(${injectMixpanelCode})('${MIXPANEL_TOKEN}', '${username}', ${JSON.stringify(opts)})`);
								script.textContent = trustedScript;
								document.head.appendChild(script);
								return { success: true, method: 'trustedTypes' };
							}
						}

						// Fallback to function creation if Trusted Types not available or failed
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
				log(`✅ Mixpanel injected successfully for ${username} (method: ${injectionResult.method || 'function'})`);
				return true;
			}
			if (injectionResult && !injectionResult.success) {
				log(`⚠️ Primary injection failed for ${username}: ${injectionResult.error}`);
			}

			// Fallback method using direct eval with Trusted Types bypass
			log(`⚠️ Primary injection failed for ${username} trying Trusted Types bypass...`);

			const trustedTypesResult = await page.evaluate(
				(injectMixpanelCode, username, opts, MIXPANEL_TOKEN) => {
					try {
						// Suppress CSP violation errors during injection
						const originalConsoleError = console.error;
						console.error = function (...args) {
							const message = args.join(' ');
							if (message.includes('Content Security Policy') ||
								message.includes('CSP') ||
								message.includes('TrustedScript') ||
								message.includes('TrustedScriptURL') ||
								message.includes('eval')) {
								return; // Suppress security-related errors
							}
							originalConsoleError.apply(console, args);
						};

						// Try multiple Trusted Types bypass strategies
						let policy = null;
						
						// Strategy 1: Create permissive policy
						if (window.trustedTypes && window.trustedTypes.createPolicy) {
							try {
								policy = window.trustedTypes.createPolicy('mixpanel-bypass-' + Date.now(), {
									createScript: (input) => input,
									createScriptURL: (input) => input,
									createHTML: (input) => input
								});
							} catch (e) {
								// Policy creation failed, try other strategies
							}
						}

						// Strategy 2: Use existing permissive policies
						if (!policy && window.trustedTypes && window.trustedTypes.getPolicyNames) {
							const policies = window.trustedTypes.getPolicyNames();
							for (const policyName of policies) {
								try {
									const existingPolicy = window.trustedTypes.getPolicy(policyName);
									if (existingPolicy && existingPolicy.createScript) {
										policy = existingPolicy;
										break;
									}
								} catch (e) {
									// Continue trying other policies
								}
							}
						}

						// Strategy 3: Create script with policy if available
						if (policy) {
							try {
								const script = document.createElement('script');
								const scriptContent = `(${injectMixpanelCode})('${MIXPANEL_TOKEN}', '${username}', ${JSON.stringify(opts)})`;
								script.textContent = policy.createScript(scriptContent);
								document.head.appendChild(script);
								
								// Restore original console.error after a delay
								setTimeout(() => {
									console.error = originalConsoleError;
								}, 1000);
								
								return { success: true, method: 'trustedTypesPolicy' };
							} catch (e) {
								// Policy approach failed, try direct approach
							}
						}

						// Strategy 4: Direct injection via iframe context (bypass Trusted Types)
						try {
							const iframe = document.createElement('iframe');
							iframe.style.display = 'none';
							document.body.appendChild(iframe);
							
							const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
							const iframeScript = iframeDoc.createElement('script');
							iframeScript.textContent = `
								parent.window.MIXPANEL_INJECTION_CODE = \`${injectMixpanelCode}\`;
								try {
									(${injectMixpanelCode})('${MIXPANEL_TOKEN}', '${username}', ${JSON.stringify(opts)});
									parent.window.MIXPANEL_INJECTION_SUCCESS = true;
								} catch (e) {
									parent.window.MIXPANEL_INJECTION_ERROR = e.message;
								}
							`;
							iframeDoc.head.appendChild(iframeScript);
							
							// Clean up iframe
							setTimeout(() => {
								if (iframe.parentNode) {
									iframe.parentNode.removeChild(iframe);
								}
							}, 100);
							
							// Check if injection succeeded
							setTimeout(() => {
								if (window.MIXPANEL_INJECTION_SUCCESS) {
									return { success: true, method: 'iframe' };
								}
							}, 50);
							
						} catch (e) {
							// Iframe approach failed
						}

						// Strategy 5: Function constructor bypass with Promises
						try {
							const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
							const asyncInject = new AsyncFunction('injectCode', 'token', 'username', 'opts', `
								return new Promise((resolve, reject) => {
									try {
										const fn = new Function('return ' + injectCode)();
										const result = fn(token, username, opts);
										resolve(result);
									} catch (e) {
										reject(e);
									}
								});
							`);
							
							// Use .then() instead of await since we're in browser context
							return asyncInject(injectMixpanelCode, MIXPANEL_TOKEN, username, opts)
								.then(result => {
									// Restore original console.error after a delay
									setTimeout(() => {
										console.error = originalConsoleError;
									}, 1000);
									
									return result || { success: true, method: 'asyncFunction' };
								})
								.catch(e => {
									// Function constructor failed, continue to next strategy
									throw e;
								});
						} catch (e) {
							// Function constructor failed
						}

						// Restore original console.error
						setTimeout(() => {
							console.error = originalConsoleError;
						}, 1000);

						return { success: false, error: 'All Trusted Types bypass strategies failed' };
					} catch (error) {
						return { success: false, error: error.message };
					}
				},
				injectMixpanel.toString(),
				username,
				opts,
				MIXPANEL_TOKEN
			);

			if (trustedTypesResult && trustedTypesResult.success) {
				log(`✅ Mixpanel injected via Trusted Types bypass for ${username} (method: ${trustedTypesResult.method})`);
				return true;
			}

			// Final fallback: Try page.addScriptTag with external URL
			log(`⚠️ Trusted Types bypass failed for ${username}, trying external script injection...`);
			
			try {
				await page.addScriptTag({ 
					url: 'https://express-proxy-lmozz6xkha-uc.a.run.app/lib.min.js'
				});
				
				// Initialize Mixpanel after external script loads
				const externalResult = await page.evaluate(
					(username, opts, MIXPANEL_TOKEN) => {
						try {
							if (window.mixpanel && window.mixpanel.init) {
								window.mixpanel.init(MIXPANEL_TOKEN, {
									loaded: function(mp) {
										if (username) mp.identify(username);
										mp.start_session_recording();
									}
								});
								return { success: true, method: 'external' };
							}
							return { success: false, error: 'Mixpanel not available after external load' };
						} catch (error) {
							return { success: false, error: error.message };
						}
					},
					username,
					opts,
					MIXPANEL_TOKEN
				);
				
				if (externalResult && externalResult.success) {
					log(`✅ Mixpanel injected via external script for ${username}`);
					return true;
				}
			} catch (externalError) {
				// External injection failed too
			}

			throw new Error(`All injection methods failed: ${JSON.stringify(trustedTypesResult)}`);

		} catch (error) {
			log(`❌ Mixpanel injection error for ${username}: ${error.message}`);
			throw error;
		}
	}, 2, 500);
}

/**
 * Fast CSP check and relaxation - only applies if needed (no-op if already relaxed)
 * @param {Page} page - Puppeteer page object
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
 * @param {Page} page - Puppeteer page object
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
 * @param {Page} page - Puppeteer page object
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

		// Page context CSP bypass injection with Trusted Types support
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

			// Create permissive Trusted Types policy early
			if (window.trustedTypes && window.trustedTypes.createPolicy) {
				try {
					window.trustedTypes.createPolicy('mixpanel-global-bypass', {
						createScript: (input) => input,
						createScriptURL: (input) => input,
						createHTML: (input) => input
					});
				} catch (e) {
					// Policy might already exist or creation might be restricted
				}
			}

			// Store reference to bypass Trusted Types enforcement
			window.TRUSTED_TYPES_BYPASS = true;
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

			// Create permissive Trusted Types policy in current context too
			if (window.trustedTypes && window.trustedTypes.createPolicy) {
				try {
					window.trustedTypes.createPolicy('mixpanel-current-bypass', {
						createScript: (input) => input,
						createScriptURL: (input) => input,
						createHTML: (input) => input
					});
				} catch (e) {
					// Policy might already exist or creation might be restricted
				}
			}

			window.TRUSTED_TYPES_BYPASS = true;
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
 * @param {Page} page - Puppeteer page object
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