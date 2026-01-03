/** @typedef {import('puppeteer').Page} Page */
/** @typedef {import('puppeteer').Browser} Browser */

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
	await retry(
		async () => {
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
										createScript: input => input,
										createScriptURL: input => input
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
									const trustedScript = policy.createScript(
										`(${injectMixpanelCode})('${MIXPANEL_TOKEN}', '${username}', ${JSON.stringify(opts)})`
									);
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
								if (
									message.includes('Content Security Policy') ||
									message.includes('CSP') ||
									message.includes('TrustedScript') ||
									message.includes('TrustedScriptURL') ||
									message.includes('eval')
								) {
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
										createScript: input => input,
										createScriptURL: input => input,
										createHTML: input => input
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
								const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
								const asyncInject = new AsyncFunction(
									'injectCode',
									'token',
									'username',
									'opts',
									`
								return new Promise((resolve, reject) => {
									try {
										const fn = new Function('return ' + injectCode)();
										const result = fn(token, username, opts);
										resolve(result);
									} catch (e) {
										reject(e);
									}
								});
							`
								);

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
					// First try the standard approach
					await page.addScriptTag({
						url: 'https://express-proxy-lmozz6xkha-uc.a.run.app/lib.min.js'
					});

					// Wait a bit for it to load
					await new Promise(resolve => setTimeout(resolve, 1000));

					// Check if it loaded
					const scriptLoaded = await page.evaluate(() => {
						return typeof window.mixpanel !== 'undefined' && typeof window.mixpanel.init === 'function';
					});

					if (!scriptLoaded) {
						log(`⚠️ External script didn't load for ${username}, fetching and injecting inline...`);

						// Try to fetch and inject the script content directly from within the page context
						const inlineResult = await page.evaluate(async () => {
							let scriptContent = '';
							try {
								// Fetch the script from within the browser
								const response = await fetch('https://express-proxy-lmozz6xkha-uc.a.run.app/lib.min.js', {
									mode: 'cors',
									credentials: 'omit'
								});

								if (!response.ok) {
									throw new Error(`HTTP ${response.status}: ${response.statusText}`);
								}

								scriptContent = await response.text();
								console.log('[NPC] Fetched Mixpanel library, size:', scriptContent.length);

								// Create and execute script inline
								const scriptEl = document.createElement('script');
								scriptEl.textContent = scriptContent;
								document.head.appendChild(scriptEl);
								console.log('[NPC] Mixpanel library injected inline via fetch');
								return { success: true, method: 'fetch-inline' };
							} catch (e) {
								console.error('[NPC] Failed to fetch and inject script:', e.message);
								// If we have the script content, try eval as last resort
								if (scriptContent) {
									try {
										console.log('[NPC] Attempting eval injection as final fallback...');
										// eslint-disable-next-line no-eval
										eval(scriptContent);
										return { success: true, method: 'eval' };
									} catch (evalError) {
										console.error('[NPC] Eval injection also failed:', evalError.message);
									}
								}
								return { success: false, error: e.message };
							}
						});

						if (inlineResult && inlineResult.success) {
							log(`✅ Mixpanel injected inline for ${username} (method: ${inlineResult.method})`);
						}
					}

					// Initialize Mixpanel after external script loads
					const externalResult = await page.evaluate(
						(username, _opts, MIXPANEL_TOKEN) => {
							try {
								if (window.mixpanel && window.mixpanel.init) {
									window.mixpanel.init(MIXPANEL_TOKEN, {
										loaded: function (mp) {
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
		},
		2,
		500
	);
}

/**
 * Ensure localStorage and sessionStorage are accessible by applying bypasses
 * @param {Page} page - Puppeteer page object
 * @param {Function} log - Logging function
 */
export async function ensureStorageBypass(page, log = console.log) {
	try {
		// Skip on about:blank pages to avoid SecurityErrors
		const currentUrl = page.url();
		if (currentUrl === 'about:blank' || currentUrl.startsWith('about:')) {
			return; // Skip storage bypass on about: pages
		}

		// First check if bypass was already applied
		const bypassStatus = await page
			.evaluate(() => {
				// Wrap in try-catch to handle SecurityError when accessing localStorage
				try {
					return {
						// @ts-ignore - Custom property
						applied: window.STORAGE_BYPASS_APPLIED === true,
						canAccessStorage: (() => {
							try {
								// Try to access localStorage without using it
								return typeof window.localStorage === 'object';
							} catch (e) {
								return false;
							}
						})()
					};
				} catch (e) {
					return { applied: false, canAccessStorage: false };
				}
			})
			.catch(() => ({ applied: false, canAccessStorage: false }));

		// If bypass already applied, skip
		if (bypassStatus.applied) {
			return;
		}

		// Apply storage polyfill
		await page.evaluate(() => {
			try {
				// Mark that we're attempting bypass
				// @ts-ignore - Custom property
				window.STORAGE_BYPASS_APPLIED = true;

				// Create in-memory storage implementations
				const createStorage = () => {
					const storage = {};
					return {
						getItem: function (key) {
							return storage[key] || null;
						},
						setItem: function (key, value) {
							storage[key] = String(value);
						},
						removeItem: function (key) {
							delete storage[key];
						},
						clear: function () {
							Object.keys(storage).forEach(key => delete storage[key]);
						},
						key: function (index) {
							return Object.keys(storage)[index] || null;
						},
						get length() {
							return Object.keys(storage).length;
						}
					};
				};

				// Function to safely check if storage is accessible
				const isStorageAccessible = storageType => {
					try {
						// @ts-ignore - Dynamic property access
						const storage = window[storageType];
						const testKey = '__test__';
						// @ts-ignore - Storage methods
						storage.setItem(testKey, 'test');
						// @ts-ignore - Storage methods
						storage.removeItem(testKey);
						return true;
					} catch (e) {
						return false;
					}
				};

				// Apply localStorage polyfill if needed
				if (!isStorageAccessible('localStorage')) {
					const localStoragePolyfill = createStorage();

					// Try to override localStorage
					try {
						Object.defineProperty(window, 'localStorage', {
							value: localStoragePolyfill,
							writable: false,
							configurable: true
						});
					} catch (e) {
						// Fallback: direct assignment
						try {
							// @ts-ignore - Assigning to read-only property
							window.localStorage = localStoragePolyfill;
						} catch (e2) {
							// If even that fails, we'll just mark it as applied
						}
					}

					// Also expose as backup
					// @ts-ignore - Custom property
					window.__localStoragePolyfill = localStoragePolyfill;
				}

				// Apply sessionStorage polyfill if needed
				if (!isStorageAccessible('sessionStorage')) {
					const sessionStoragePolyfill = createStorage();

					try {
						Object.defineProperty(window, 'sessionStorage', {
							value: sessionStoragePolyfill,
							writable: false,
							configurable: true
						});
					} catch (e) {
						try {
							// @ts-ignore - Assigning to read-only property
							window.sessionStorage = sessionStoragePolyfill;
						} catch (e2) {
							// If even that fails, we'll just mark it as applied
						}
					}

					// Also expose as backup
					// @ts-ignore - Custom property
					window.__sessionStoragePolyfill = sessionStoragePolyfill;
				}

				// Mark successful bypass
				// @ts-ignore - Custom property
				window.STORAGE_BYPASS_SUCCESS = true;
			} catch (error) {
				// Even if we fail, mark as applied to avoid repeated attempts
				// @ts-ignore - Custom property
				window.STORAGE_BYPASS_APPLIED = true;
				// @ts-ignore - Custom property
				window.STORAGE_BYPASS_ERROR = error.message;
			}
		});

		// Only log success once per page
		const result = await page
			.evaluate(() => {
				return {
					// @ts-ignore - Custom property
					success: window.STORAGE_BYPASS_SUCCESS === true,
					// @ts-ignore - Custom property
					error: window.STORAGE_BYPASS_ERROR
				};
			})
			.catch(() => ({ success: false, error: 'Could not verify bypass status' }));

		if (result.success) {
			log('✅ Storage polyfill installed successfully');
		} else if (result.error) {
			// Silently continue - we don't want to spam logs
		}
	} catch (storageError) {
		// Silently continue - storage bypass is best effort
		// We don't want to spam the logs with repeated errors
	}
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
						createScript: input => input,
						createScriptURL: input => input,
						createHTML: input => input
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
						createScript: input => input,
						createScriptURL: input => input,
						createHTML: input => input
					});
				} catch (e) {
					// Policy might already exist or creation might be restricted
				}
			}

			window.TRUSTED_TYPES_BYPASS = true;
		});

		// Inject the relaxed CSP as a meta tag
		try {
			await page.evaluate(cspPolicy => {
				// Remove existing CSP meta tags
				const existingCSPTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
				existingCSPTags.forEach(tag => tag.remove());

				// Add new relaxed CSP meta tag
				const meta = document.createElement('meta');
				meta.setAttribute('http-equiv', 'Content-Security-Policy');
				meta.setAttribute('content', cspPolicy);
				document.head.appendChild(meta);

				console.log('✅ Relaxed CSP policy applied via meta tag');
			}, relaxedCSP);
		} catch (cspError) {
			log(`⚠️ CSP meta tag injection failed, trying alternative bypass...`);

			// Try alternative approach - set CSP via document modification
			await page.evaluate(cspPolicy => {
				try {
					// Strategy 1: Try to modify document CSP if possible
					console.log('⚙️ Applying CSP bypass strategies...');

					// Remove existing CSP restrictions by clearing meta tags
					const cspMetas = document.querySelectorAll('meta[http-equiv*="Content-Security-Policy" i]');
					cspMetas.forEach(meta => meta.remove());

					// Try to override any CSP via meta tag
					const newMeta = document.createElement('meta');
					newMeta.setAttribute('http-equiv', 'Content-Security-Policy');
					newMeta.setAttribute('content', cspPolicy);
					document.head.appendChild(newMeta);

					return { success: true, method: 'metaTagCSP' };
				} catch (error) {
					return { success: false, error: error.message };
				}
			}, relaxedCSP);
		}

		// Apply localStorage bypass for this page
		await ensureStorageBypass(page, log);

		// Set permissions for the current URL and common variations
		const context = page.browser().defaultBrowserContext();
		const currentUrl = page.url();
		const urlObj = new URL(currentUrl);
		const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;

		// Set permissions for current URL and common URL variations
		const urlsToPermit = [
			currentUrl,
			baseUrl,
			`${baseUrl}/`,
			`https://${urlObj.hostname}`,
			`https://www.${urlObj.hostname}`,
			urlObj.hostname.startsWith('www.')
				? `https://${urlObj.hostname.replace('www.', '')}`
				: `https://www.${urlObj.hostname}`
		];

		for (const url of urlsToPermit) {
			try {
				await context.overridePermissions(url, ['camera', 'microphone', 'geolocation', 'notifications']);
			} catch (e) {
				// Some URLs might be invalid, continue with others
			}
		}

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
		// Skip setup on about:blank pages entirely
		const currentUrl = page.url();
		if (currentUrl === 'about:blank' || currentUrl.startsWith('about:')) {
			return; // Skip all setup on about: pages
		}

		// Always ensure localStorage bypass is in place (critical for each navigation)
		await ensureStorageBypass(page, log);

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
		const mixpanelStatus = inject
			? await page.evaluate(() => {
					return {
						injected: window.MIXPANEL_WAS_INJECTED || false,
						available: typeof window.mixpanel !== 'undefined' && window.mixpanel.track
					};
				})
			: { injected: true, available: false };

		// Only inject Mixpanel if requested and not already done
		if (inject && !mixpanelStatus.injected && !mixpanelStatus.available) {
			await ensureMixpanelInjected(page, username, opts, log);
		}

		// Only log success for real pages
		if (!currentUrl.startsWith('chrome') && !currentUrl.startsWith('data:')) {
			log(`✅ Page setup complete for ${username} (inject: ${inject})`);
		}
	} catch (error) {
		// Only log errors for non-blank pages
		const currentUrl = page.url();
		if (currentUrl && !currentUrl.startsWith('about:') && !currentUrl.startsWith('chrome')) {
			log(`⚠️ Page setup error for ${username}: ${error.message}`);
		}
		// Don't throw - let the session continue
	}
}
