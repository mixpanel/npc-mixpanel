import dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import { tmpdir } from 'os';
import pLimit from 'p-limit';
import puppeteer from 'puppeteer';
import u from 'ak-tools';
const { NODE_ENV = "" } = process.env;
let { MIXPANEL_TOKEN = "" } = process.env;
if (!NODE_ENV) throw new Error("NODE_ENV is required");
let TEMP_DIR = NODE_ENV === 'dev' ? './tmp' : tmpdir();
TEMP_DIR = path.resolve(TEMP_DIR);

/**
 * @typedef PARAMS
 * @property {string} url URL to simulate
 * @property {number} users Number of users to simulate
 * @property {number} concurrency Number of users to simulate concurrently
 * @property {boolean} headless Whether to run headless or not
 * @property {token} token Mixpanel token
 */

/**
 * Main function to simulate user behavior.
 * @param {PARAMS} PARAMS 
 */
export default async function main(PARAMS = {}) {
	let { url = "https://aktunes.neocities.org/fixpanel/",
		users = 10,
		concurrency = 5,
		headless = true,
		token = ""
	} = PARAMS;
	const limit = pLimit(concurrency);
	if (users > 25) users = 25;
	if (concurrency > 10) concurrency = 10;
	if (token) MIXPANEL_TOKEN = token;

	const userPromises = Array.from({ length: users }, (_, i) => {

		return limit(() => {
			try {
				if (NODE_ENV === "dev") console.log(`start user ${i + 1}...`);
				return simulateUser(url, headless)
					.then((results) => {
						if (NODE_ENV === "dev") console.log(`end user ${i + 1}...`);
						return results;
					});
			}
			catch (e) {
				//noop;
			}
		});
	});

	const results = await Promise.all(userPromises).catch((error) => {
		if (NODE_ENV === "dev") debugger;
		throw error;
	});

	return results;
}

/**
 * Simulates a single user session with random actions, with a timeout to prevent hangs.
 * @param {string} url - The URL to visit.
 * @param {boolean} headless - Whether to run the browser headlessly.
 */
async function simulateUser(url, headless = true) {
	const totalTimeout = 10 * 60 * 1000;  // max 10 min / user
	const pageTimeout = 60 * 1000; // 1 minutes
	const timeoutPromise = new Promise((resolve) =>
		setTimeout(() => {
			resolve('timeout');
		}, totalTimeout)
	);
	let browser;

	// Define the user session simulation promise
	const simulationPromise = (async () => {
		browser = await puppeteer.launch({
			headless, args: [
				'--disable-web-security',
				'--disable-features=IsolateOrigins,site-per-process,TrustedDOMTypes',

			],
			timeout: pageTimeout, // Browser launch timeout
			waitForInitialPage: true,
		});
		const page = (await browser.pages())[0];
		await page.setDefaultTimeout(pageTimeout);
		await page.setDefaultNavigationTimeout(pageTimeout);
		await relaxCSP(page);
		await page.setViewport({ width: 2560, height: 1440, deviceScaleFactor: 0 });

		await page.goto(url);
		const persona = selectPersona();

		try {
			const actions = await simulateUserSession(browser, page, persona);
			await browser.close();
			return actions;
		}
		catch (error) {
			await browser.close();
			return { error: error.message, timedOut: false };
		}
	})();

	// Use Promise.race to terminate if simulation takes too long
	try {
		return await Promise.race([simulationPromise, timeoutPromise]);
	} catch (error) {
		// Handle timeout error (close browser if not already closed)
		if (browser) await browser.close();
		if (NODE_ENV === "dev") console.error("simulateUser Error:", error);
		return { error: error.message, timedOut: true };
	}
}

async function retry(operation, maxRetries = 3, delay = 1000) {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await operation();
		} catch (error) {
			if (i === maxRetries - 1) throw error;
			await u.sleep(delay);
		}
	}
}

async function jamMixpanelIntoBrowser(page, username) {
	await retry(async () => {
		const injectMixpanelString = injectMixpanel.toString();
		await page.evaluate((MIXPANEL_TOKEN, userId, injectMixpanelFn) => {
			const injectedFunction = new Function(`return (${injectMixpanelFn})`)();
			injectedFunction(MIXPANEL_TOKEN, userId);
		}, MIXPANEL_TOKEN, username, injectMixpanelString);
	});
	return true;
}

function injectMixpanel(token = process.env.MIXPANEL_TOKEN || "", userId = "") {

	function reset() {
		console.log('[NPC] RESET MIXPANEL\n\n');
		if (mixpanel) {
			if (mixpanel.headless) {
				mixpanel.headless.reset();
			}
		}
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
					mp.register(restParams);
					if (userId) mp.identify(userId);
					if (userId) mp.people.set({ $name: userId, $email: userId });
					window.addEventListener("beforeunload", () => {
						mp.track("$mp_page_close", {}, { transport: "sendBeacon", send_immediately: true });
					});

				},
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
				record_mask_text_selector: 'nothing',
				record_block_selector: "nothing",
				record_block_class: "nothing",

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

	const MIXPANEL_CUSTOM_LIB_URL = 'https://cdn-dev.mxpnl.com/libs/mixpanel-ac-alpha.js';
	//prettier-ignore
	(function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
	EMBED_TRACKING();
}

/**
 * 
 * @param  {import('puppeteer').Page} page
 */
async function relaxCSP(page) {
	try {
		// await page.setRequestInterception(true);

		// page.on('request', request => {

		// 	const headers = request.headers();
		// 	delete headers['content-security-policy'];
		// 	delete headers['content-security-policy-report-only'];
		// 	headers['content-security-policy'] = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;";
		// 	try {
		// 		request.continue({ headers });
		// 	}
		// 	catch (e) {
		// 		//noop
		// 		null;
		// 	}
		// });

		await page.setBypassCSP(true);

	}
	catch (e) {

	}

}

/**
 * Simulates a user session on the page, following a persona-based action sequence.
 * @param {import('puppeteer').Browser} browser - Puppeteer browser object.
 * @param {import('puppeteer').Page} page - Puppeteer page object.
 * @param {string} persona - User persona to simulate.
 */
async function simulateUserSession(browser, page, persona) {
	const usersHandle = u.makeName(6, " ");

	// Initial Mixpanel injection
	await jamMixpanelIntoBrowser(page, usersHandle);

	// Store initial domain and page target ID
	let currentDomain = new URL(await page.url()).hostname;
	const mainPageTarget = await page.target();
	const mainPageId = mainPageTarget._targetId;

	// Set up tab listener to automatically close new tabs
	browser.on('targetcreated', async (target) => {
		if (target._targetId !== mainPageId) {
			const newPage = await target.page();
			if (newPage) {
				if (NODE_ENV === "dev") console.log(`closing new tab @ ${newPage.url()}`);
				await newPage.close();
			}
		}
	});

	// Set up navigation listener for the main page
	page.on('domcontentloaded', async () => {
		try {
			// Check if we're still on the main page
			const currentTarget = await page.target();
			if (currentTarget._targetId === mainPageId) {
				const newDomain = new URL(await page.url()).hostname;
				if (newDomain !== currentDomain) {
					// Domain changed in the same tab - reinject
					if (NODE_ENV === "dev") console.log(`domain changed from ${currentDomain} to ${newDomain}; reinjecting`);
					await relaxCSP(page);
					await jamMixpanelIntoBrowser(page, usersHandle);
					currentDomain = newDomain;
				}
			}
		} catch (e) {
			console.error('Error handling navigation:', e);
		}
	});

	const actionSequence = generatePersonaActionSequence(persona);
	const numActions = actionSequence.length;
	const actionResults = [];



	for (const [index, action] of actionSequence.entries()) {
		if (NODE_ENV !== "production") console.log(`Action ${index} of ${numActions}: ${action}`);
		let repeats = u.rand(1, 4);
		let funcToPreform;

		switch (action) {
			case "click":
				funcToPreform = clickStuff;
				break;
			case "scroll":
				funcToPreform = randomScroll;
				repeats = Math.floor(repeats / 2);
				break;
			case "mouse":
				funcToPreform = randomMouse;
				break;
			default:
				funcToPreform = wait;
				repeats = 1;
				break;
		}

		if (funcToPreform) {
			try {
				for (let i = 0; i < repeats; i++) {
					const result = await funcToPreform(page);
					if (result) actionResults.push(`${action}-${i}`);
				}
			}
			catch (e) {
				//noop
			}
		}
	}

	// Clean up the navigation listener
	await page.removeAllListeners('domcontentloaded');

	return {
		persona: personas[persona],
		personaLabel: persona,
		actionSequence,
		actionResults
	};
}

// User personas with different action weightings
const personas = {
	quickScroller: { scroll: 0.6, mouse: 0.2, click: 0.6 },
	carefulReader: { scroll: 0.3, mouse: 0.3, click: 0.3 },
	frequentClicker: { scroll: 0.2, mouse: 0.3, click: 0.6 },
	noWaiting: { scroll: 0.2, mouse: 0.2, click: 0.7 },
	casualBrowser: { scroll: 0.4, mouse: 0.3, click: 0.3 },
	hoveringObserver: { scroll: 0.2, mouse: 0.6, click: 0.6 },
	intenseReader: { scroll: 0.15, mouse: 0.3, click: 0.5 },
	impulsiveScroller: { scroll: 0.7, mouse: 0.2, click: 0.7 },
	deepDiver: { scroll: 0.25, mouse: 0.4, click: 0.9 },
	explorer: { scroll: 0.5, mouse: 0.4, click: 0.7 }
};

/**
 * Selects a random persona.
 */
function selectPersona() {
	const personaKeys = Object.keys(personas);
	return personaKeys[Math.floor(Math.random() * personaKeys.length)];
}

/**
 * Generates an action sequence based on a persona's weighting.
 * @param {string} persona - The selected persona.
 */
function generatePersonaActionSequence(persona) {
	const personaWeights = personas[persona];
	const actionTypes = Object.keys(personaWeights);
	return generateWeightedRandomActionSequence(actionTypes, personaWeights);
}

/**
 * Generates a weighted random action sequence.
 * @param {Array} actionTypes - List of possible actions.
 * @param {Object} weights - Weighting for each action.
 */
function generateWeightedRandomActionSequence(actionTypes, weights) {
	const sequence = [];
	const length = u.rand(42, 187);
	for (let i = 0; i < length; i++) {
		const action = weightedRandom(actionTypes, weights);
		sequence.push(action);
	}
	return sequence;
}

// Core action functions

/**
 * @param  {import('puppeteer').Page} page
 */
async function clickStuff(page) {
	try {
		const elements = await page.$$('a, button, input[type="submit"], [role="button"], [onclick], h1, h2, h3');
		if (elements.length === 0) return false;

		const element = elements[Math.floor(Math.random() * elements.length)];
		const boundingBox = await element.boundingBox();
		if (!boundingBox) throw new Error("Bounding box not found.");

		const { x, y, width, height } = boundingBox;
		const targetX = x + width / 2 + u.rand(-5, 5);
		const targetY = y + height / 2 + u.rand(-5, 5);

		// Add hover pause before clicking
		await moveMouse(page, u.rand(0, page.viewport().width), u.rand(0, page.viewport().height), targetX, targetY);
		if (coinFlip()) await wait();

		const tagName = await page.evaluate(el => el.tagName.toLowerCase(), element);
		const href = await page.evaluate(el => el.getAttribute('href'), element);

		// Click with varying speeds
		/** @type {import('puppeteer').ClickOptions} */
		const clickOptions = {
			delay: u.rand(50, 150),
			count: u.rand(1, 3),
			button: 'left',
			//modifiers: ['Meta']

		};
		if (coinFlip()) clickOptions.count = 1;
		if (tagName === 'a' && href) {
			await page.mouse.click(targetX, targetY, { ...clickOptions });
		} else {
			await page.mouse.click(targetX, targetY, clickOptions);
		}
		if (coinFlip()) await wait();
		return true;
	} catch (error) {
		return false;
	}
}


async function randomMouse(page) {
	const startX = u.rand(0, page.viewport().width);
	const startY = u.rand(0, page.viewport().height);
	const endX = u.rand(0, page.viewport().width);
	const endY = u.rand(0, page.viewport().height);
	return await moveMouse(page, startX, startY, endX, endY);
}

/**
 * @param  {import('puppeteer').Page} page
 * @param  {number} startX
 * @param  {number} startY
 * @param  {number} endX
 * @param  {number} endY
 */
async function moveMouse(page, startX, startY, endX, endY) {
	try {
		// More natural number of steps based on distance
		const distance = Math.hypot(endX - startX, endY - startY);
		const baseSteps = Math.floor(distance / 50); // One step per 50 pixels
		const steps = Math.max(5, Math.min(40, baseSteps + u.rand(-2, 2)));

		// Add slight pause before movement
		if (coinFlip()) await wait();

		const humanizedPath = generateHumanizedPath(startX, startY, endX, endY, steps);

		for (const [x, y] of humanizedPath) {
			await page.mouse.move(x, y);

			// Variable speed that slows down near the target
			const remainingDistance = Math.hypot(endX - x, endY - y);
			const progressRatio = remainingDistance / distance;

			// Slow down more dramatically near the target
			const baseDelay = Math.min(12, remainingDistance / 8);
			const speedVariation = u.rand(7, 13) / 10; // Add some randomness to speed
			const delay = baseDelay * speedVariation;

			// Add more delay near the target
			if (progressRatio < 0.2) {
				await u.sleep(delay * 2);
			} else {
				await u.sleep(delay);
			}
		}

		// Occasional slight pause after reaching target
		if (coinFlip()) await wait();
		return true;
	} catch (e) {
		return false;
	}
}

function generateHumanizedPath(startX, startY, endX, endY, steps) {
	const path = [];

	// Add slight initial deviation for more natural movement start
	const initialDeviation = u.rand(5, 15);
	const deviationAngle = (Math.random() * Math.PI * 2);
	const controlPoint1X = startX + (endX - startX) * 0.3 + Math.cos(deviationAngle) * initialDeviation;
	const controlPoint1Y = startY + (endY - startY) * 0.3 + Math.sin(deviationAngle) * initialDeviation;

	// Second control point closer to target for more precise ending
	const controlPoint2X = startX + (endX - startX) * 0.7;
	const controlPoint2Y = startY + (endY - startY) * 0.7;

	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = bezierPoint(startX, controlPoint1X, controlPoint2X, endX, t);
		const y = bezierPoint(startY, controlPoint1Y, controlPoint2Y, endY, t);

		// Add smaller jitter near the target
		const progressRatio = i / steps;
		const jitterAmount = progressRatio < 0.8 ? u.rand(-3, 3) : u.rand(-1, 1);

		path.push([x + jitterAmount, y + jitterAmount]);
	}
	return path;
}

/**
 * @param  {import('puppeteer').Page} page
 */
async function randomScroll(page) {
	try {
		const scrollable = await page.evaluate(() => {
			return document.documentElement.scrollHeight > window.innerHeight;
		});

		if (!scrollable) return false;

		// Enhanced scroll behavior
		await page.evaluate(() => {
			function smoothScroll(distance, duration = 1000) {
				return new Promise(resolve => {
					const start = window.pageYOffset;
					const startTime = performance.now();

					function easeInOutQuad(t) {
						return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
					}

					function scroll(currentTime) {
						const timeElapsed = currentTime - startTime;
						const progress = Math.min(timeElapsed / duration, 1);

						const ease = easeInOutQuad(progress);
						window.scrollTo(0, start + distance * ease);

						if (progress < 1) {
							requestAnimationFrame(scroll);
						} else {
							resolve();
						}
					}

					requestAnimationFrame(scroll);
				});
			}

			// More natural scroll patterns
			const scrollTypes = [
				// Small scroll
				() => smoothScroll(Math.random() * (window.innerHeight * 0.3) + 100, u.rand(800, 1200)),
				// Medium scroll
				() => smoothScroll(Math.random() * (window.innerHeight * 0.6) + 200, u.rand(1200, 1800)),
				// Full scroll to bottom
				() => smoothScroll(document.documentElement.scrollHeight - window.innerHeight, u.rand(2000, 3000)),
				// Scroll back up
				() => smoothScroll(-(window.pageYOffset * 0.7), u.rand(1500, 2500))
			];

			return scrollTypes[Math.floor(Math.random() * scrollTypes.length)]();
		});

		// Add natural pauses between scrolls
		await wait();
		if (coinFlip()) await wait();
		return true;
	} catch (e) {
		return false;
	}
}


// either a short or long wait
async function wait() {
	if (coinFlip()) {
		await u.sleep(u.rand(35, 42));
	}
	else {
		await u.sleep(u.rand(97, 240));
	}

}


function bezierPoint(p0, p1, p2, p3, t) {
	return Math.pow(1 - t, 3) * p0 +
		3 * Math.pow(1 - t, 2) * t * p1 +
		3 * (1 - t) * Math.pow(t, 2) * p2 +
		Math.pow(t, 3) * p3;
}

/**
 * Helper to pick a random item from a list with weights.
 * @param {Array} items - List of items to pick from.
 * @param {Object} weights - Object with item keys and their weights.
 * @returns {any} Selected item based on weights.
 */
function weightedRandom(items, weights) {
	const totalWeight = items.reduce((sum, item) => sum + weights[item], 0);
	const randomValue = Math.random() * totalWeight;
	let cumulativeWeight = 0;

	for (const item of items) {
		cumulativeWeight += weights[item];
		if (randomValue < cumulativeWeight) return item;
	}
}


function coinFlip() {
	return Math.random() < 0.5;
}




if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const local = u.timer('headless');
	local.start();
	const result = await main({ concurrency: 1, users: 1, headless: false, url: "https://soundcloud.com" });
	local.stop(true);

	if (NODE_ENV === 'dev') debugger;
}
