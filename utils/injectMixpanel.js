/**
 * Injects Mixpanel SDK into the page with configuration options for session replay and user tracking.
 * Handles multiple injection strategies with CSP workarounds and fallback mechanisms.
 * 
 * @param {string} token - Mixpanel project token
 * @param {string} [userId=""] - User identifier for tracking and identification
 * @param {Object} [opts={}] - Configuration options
 * @param {boolean} [opts.masking=false] - Whether to use Mixpanel's default masking behavior.
 *   - false: Disables masking with "nope" selectors (record_mask_text_selector, record_block_selector, record_block_class)
 *   - true: Uses Mixpanel's default masking behavior (recommended for production)
 * @param {Object|null} [opts.location=null] - User location coordinates for geo-spoofing
 * @param {number} opts.location.lat - Latitude coordinate
 * @param {number} opts.location.lon - Longitude coordinate
 * 
 * @example
 * // Basic injection with no masking
 * injectMixpanel('your-token', 'user-123');
 * 
 * @example
 * // With masking enabled and custom location
 * injectMixpanel('your-token', 'user-456', {
 *   masking: true,
 *   location: { lat: 40.7128, lon: -74.0060 }
 * });
 * 
 * @example
 * // Server-provided location (typical usage from headless.js)
 * injectMixpanel(token, userId, { masking: false, location: sessionLocation });
 */
export default function injectMixpanel(token, userId = "", opts = {}) {

	function reset() {
		console.log('[NPC] RESET MIXPANEL\n\n');
		if (mixpanel) {
			if (mixpanel.headless) {
				mixpanel.headless.reset();
			}
			else {
				mixpanel.reset();
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

	// Extract options with defaults
	const { masking = false, location = null } = opts;

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
			// Build configuration object
			const mixpanelConfig = {
				hooks: {
					before_send_events: function (event_data) {
						// ensure every event has user_id
						if (userId && event_data?.properties) {
							event_data.properties.$user_id = userId;
						}

						return event_data;
					},

				},
				loaded: function (mp) {
					console.log('[NPC] MIXPANEL LOADED\n\n');
					// Use server-provided location if available, otherwise generate on client
					const { lat, lon } = location || generateLocation();
					const latitude = lat || 39.8283;
					const longitude = lon || 98.5795;
					const locationSource = location ? '[SERVER]' : '[CLIENT]';
					console.log(`[NPC] SPOOFING LOCATION TO: ${latitude}, ${longitude} ${locationSource}`);
					mp.register({ $latitude: latitude, $longitude: longitude });
					mp.register(restParams);
					if (userId) mp.identify(userId);
					if (userId) mp.people.set({ $name: userId, $email: userId, $latitude: latitude, $longitude: longitude });
					mp.start_session_recording();
					console.log('[NPC] STARTED SESSION RECORDING\n\n');

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
				// record_sessions_percent: 100,
				record_inline_images: true,
				record_collect_fonts: true,
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

			};

			// Only add masking options when masking is OFF (false)
			if (!masking) {
				mixpanelConfig.record_mask_text_selector = "nope";
				mixpanelConfig.record_block_selector = "nope";
				mixpanelConfig.record_block_class = "nope";
			}

			if (masking) {
				// mixpanelConfig.record_mask_text_selector = "input, textarea, div, p, [type='password'], [type='email'], [type='tel'], [type='number'], [type='search']";
				mixpanelConfig.record_block_selector = "still nope";
				mixpanelConfig.record_mask_text_selector = "*";
			}

			mixpanel.init(project_token, mixpanelConfig, "headless");
		};
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

	


	var MIXPANEL_CUSTOM_LIB_URL = 'https://express-proxy-lmozz6xkha-uc.a.run.app/lib.min.js';
	//prettier-ignore
	(function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
	EMBED_TRACKING();

	// Mark that Mixpanel was successfully injected
	window.MIXPANEL_WAS_INJECTED = true;
	window.MIXPANEL_INJECTED_TIMESTAMP = Date.now();

	return { success: true };
}