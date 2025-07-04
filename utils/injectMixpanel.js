export default function injectMixpanel(token = process.env.MIXPANEL_TOKEN || "", userId = "") {

	function reset() {
		console.log('[NPC] RESET MIXPANEL\n\n');
		if (mixpanel) {
			if (mixpanel.headless) {
				mixpanel.headless.reset();
			}
		}
	}

	function generateLocation() {
		const cities = [
			[40.7128, -74.0060], // New York
			[51.5074, -0.1278],  // London
			[35.6762, 139.6503], // Tokyo
			[48.8566, 2.3522],   // Paris
			[34.0522, -118.2437], // Los Angeles
			[-33.8688, 151.2093], // Sydney
			[55.7558, 37.6173],  // Moscow
			[39.9042, 116.4074], // Beijing
			[19.0760, 72.8777],  // Mumbai
			[-23.5505, -46.6333] // São Paulo
		];

		const city = cities[Math.floor(Math.random() * cities.length)];
		const radius = 2; // degrees (~200km)

		const lat = city[0] + (Math.random() - 0.5) * radius;
		const lon = city[1] + (Math.random() - 0.5) * radius;

		return {
			lat: parseFloat(lat.toFixed(6)),
			lon: parseFloat(lon.toFixed(6))
		};
	}

	const PARAMS = qsToObj(window.location.search);
	let { user = "", project_token = "", ...restParams } = PARAMS;
	if (!restParams) restParams = {};
	if (!project_token) project_token = token;
	if (!project_token) throw new Error("Project token is required when injecting mixpanel.");

	// Function that contains the code to run after the script is loaded
	function EMBED_TRACKING() {
		if (window?.MIXPANEL_WAS_INJECTED) {
			console.log('[NPC] MIXPANEL WAS ALREADY INJECTED\n\n');
			return;
		}
		console.log('[NPC] EMBED TRACKING\n\n');
		window.MIXPANEL_WAS_INJECTED = true;
		if (window.mixpanel) {
			mixpanel.init(project_token, {
				loaded: function (mp) {
					console.log('[NPC] MIXPANEL LOADED\n\n');
					const {lat, lon} = generateLocation()
					const latitude = lat || 39.8283;
					const longitude = lon || 98.5795;
					console.log(`[NPC] SPOOFING LOCATION TO: ${latitude}, ${longitude}`);
					mp.register({ $latitude: latitude, $longitude: longitude });
					mp.register(restParams);
					if (userId) mp.identify(userId);
					if (userId) mp.people.set({ $name: userId, $email: userId, $latitude: latitude, $longitude: longitude });


					setupPageExitTracking(mp);


				},

				//autocapture
				autocapture: {
					pageview: "full-url",
					click: true,
					input: true,
					scroll: true,
					submit: true,
					capture_text_content: true
				},

				//session replay
				record_sessions_percent: 100,
				record_inline_images: true,
				record_collect_fonts: true,
				record_mask_text_selector: "nope",
				record_block_selector: "nope",
				record_block_class: "nope",
				record_canvas: true,
				record_heatmap_data: true,



				//normal mixpanel
				ignore_dnt: true,
				batch_flush_interval_ms: 0,
				api_host: "https://express-proxy-lmozz6xkha-uc.a.run.app",
				api_transport: 'XHR',
				persistence: "localStorage",
				api_payload_format: 'json',
				debug: true

			}, "headless");
		}
	}

	function qsToObj(queryString) {
		try {
			const parsedQs = new URLSearchParams(queryString);
			const params = Object.fromEntries(parsedQs);
			return params;
		}

		catch (e) {
			return {};
		}
	}

	function setupPageExitTracking(mp, options = {}) {
		// Configuration with defaults
		const config = {
			heartbeatInterval: 30000, // 30 seconds
			visibilityDelay: 100, // 100ms delay for visibility changes
			includeAdvancedFeatures: true,
			logToConsole: false,
			...options
		};

		// State tracking
		let hasTracked = false;
		let sessionStartTime = Date.now();
		let lastActivityTime = Date.now();
		let lastBlurTime = null;
		let visibilityTimeout = null;
		let heartbeatInterval = null;

		// Core tracking function
		function track(reason, additionalData = {}) {
			// Prevent duplicate tracking
			if (hasTracked) return;
			hasTracked = true;

			const eventData = {
				reason: reason,
				time_on_page: Date.now() - sessionStartTime,
				last_activity: Date.now() - lastActivityTime,
				url: window.location.href,
				referrer: document.referrer,
				viewport_width: window.innerWidth,
				viewport_height: window.innerHeight,
				user_agent: navigator.userAgent,
				timestamp: new Date().toISOString(),
				...additionalData
			};

			if (config.logToConsole) {
				console.log(`Page exit tracked: ${reason}`, eventData);
			}

			// Track with Mixpanel using reliable transport
			mp.track("$mp_page_close", eventData, {
				transport: "sendBeacon",
				send_immediately: true
			});
		}

		// Activity tracking
		function updateActivity() {
			lastActivityTime = Date.now();
		}

		// Setup all event listeners
		function setupListeners() {
			// Primary exit detection
			window.addEventListener("beforeunload", () => {
				track("beforeunload");
			}, { passive: true });

			// Visibility API - most reliable for modern browsers
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					// Small delay to avoid false positives from quick tab switches
					visibilityTimeout = setTimeout(() => {
						track("visibility_hidden");
					}, config.visibilityDelay);
				} else if (document.visibilityState === "visible") {
					// Cancel tracking if user comes back quickly
					if (visibilityTimeout) {
						clearTimeout(visibilityTimeout);
						visibilityTimeout = null;
						hasTracked = false; // Reset for quick tab switches
					}
				}
			}, { passive: true });

			// Page Lifecycle API
			document.addEventListener("pagehide", (event) => {
				track("pagehide", {
					persisted: event.persisted,
					page_cached: event.persisted
				});
			}, { passive: true });

			// Mobile-specific freeze event
			document.addEventListener("freeze", () => {
				track("page_freeze");
			}, { passive: true });

			// Fallback unload event
			window.addEventListener("unload", () => {
				track("unload");
			}, { passive: true });

			// Browser navigation
			window.addEventListener("popstate", () => {
				track("navigation_back_forward");
			}, { passive: true });

			// Focus/blur for context
			window.addEventListener("blur", () => {
				lastBlurTime = Date.now();
			}, { passive: true });

			window.addEventListener("focus", () => {
				if (lastBlurTime && Date.now() - lastBlurTime > 5000) {
					// Reset tracking if blur was for more than 5 seconds
					hasTracked = false;
				}
			}, { passive: true });

			// Connection loss
			window.addEventListener("offline", () => {
				track("connection_lost");
			}, { passive: true });

			// Track user activity
			const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
			activityEvents.forEach(eventType => {
				document.addEventListener(eventType, updateActivity, {
					passive: true,
					capture: true
				});
			});
		}

		// Advanced features
		function setupAdvancedFeatures() {
			if (!config.includeAdvancedFeatures) return;

			// Intersection Observer for page visibility
			if ('IntersectionObserver' in window) {
				const observer = new IntersectionObserver((entries) => {
					entries.forEach(entry => {
						if (!entry.isIntersecting && document.visibilityState === 'visible') {
							setTimeout(() => {
								if (!entry.isIntersecting && !hasTracked) {
									track("intersection_hidden");
								}
							}, 2000);
						}
					});
				}, { threshold: 0, rootMargin: '0px' });

				observer.observe(document.documentElement);
			}

			// Performance monitoring
			if ('PerformanceObserver' in window) {
				try {
					const observer = new PerformanceObserver((list) => {
						const entries = list.getEntries();
						entries.forEach(entry => {
							if (entry.entryType === 'navigation') {
								const loadTime = entry.loadEventEnd - entry.loadEventStart;
								if (loadTime > 10000) {
									track("slow_navigation", { load_time: loadTime });
								}
							}
						});
					});
					observer.observe({ entryTypes: ['navigation'] });
				} catch (e) {
					if (config.logToConsole) {
						console.warn('PerformanceObserver not fully supported');
					}
				}
			}

			// Memory pressure detection
			if ('memory' in performance) {
				const memoryCheck = setInterval(() => {
					if (hasTracked) {
						clearInterval(memoryCheck);
						return;
					}
					const memory = performance.memory;
					if (memory.usedJSHeapSize > memory.totalJSHeapSize * 0.9) {
						track("memory_pressure", {
							memory_used: memory.usedJSHeapSize,
							memory_total: memory.totalJSHeapSize
						});
					}
				}, 10000);
			}
		}


		// Initialize everything
		setupListeners();
		setupAdvancedFeatures();


		// Return utility functions for SPA support
		return {
			// Manual tracking
			track: (reason, data = {}) => track(reason, data),

			// Reset for SPA route changes
			reset: () => {
				hasTracked = false;
				sessionStartTime = Date.now();
				lastActivityTime = Date.now();
				if (visibilityTimeout) {
					clearTimeout(visibilityTimeout);
					visibilityTimeout = null;
				}
			},

			// Cleanup
			destroy: () => {
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				if (visibilityTimeout) {
					clearTimeout(visibilityTimeout);
				}
				hasTracked = true; // Prevent further tracking
			},

			// Get current state
			getState: () => ({
				hasTracked,
				sessionDuration: Date.now() - sessionStartTime,
				timeSinceLastActivity: Date.now() - lastActivityTime
			})
		};
	}



	var MIXPANEL_CUSTOM_LIB_URL = 'https://express-proxy-lmozz6xkha-uc.a.run.app/lib.min.js';
	//prettier-ignore
	(function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
	EMBED_TRACKING();
}