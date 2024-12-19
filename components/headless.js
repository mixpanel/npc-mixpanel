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
 * @property {boolean} inject Whether to inject external script
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
		inject = true,
		token = ""
	} = PARAMS;
	const limit = pLimit(concurrency);
	if (users > 25) users = 25;
	if (concurrency > 10) concurrency = 10;
	if (token) MIXPANEL_TOKEN = token;

	const userPromises = Array.from({ length: users }, (_, i) => {

		return limit(() => {
			if (NODE_ENV === "dev") console.log(`start user ${i + 1}...`);
			return simulateUser(url, headless, inject)
				.then((results) => {
					if (NODE_ENV === "dev") console.log(`end user ${i + 1}...`);
					return results;
				});
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
 * @param {boolean} inject - Whether to inject external script.
 */
async function simulateUser(url, headless = true, inject = false) {
	const timeoutMs = 10 * 60 * 1000; // 10 minutes in milliseconds

	const browser = await puppeteer.launch({
		headless, args: [
			'--disable-web-security',
			'--disable-features=IsolateOrigins,site-per-process',
			'--disable-features=TrustedDOMTypes'

		]
	});
	const page = await browser.newPage();
	await relaxCSP(page);
	await page.setViewport({ width: 1280, height: 720 });
	await page.goto(url);

	// Define a timeout promise
	const timeoutPromise = new Promise((resolve, reject) =>
		setTimeout(() => {
			try {
				browser.close().then(() => resolve('timeout'));
			}
			catch (e) {
				resolve('timeout');
			}

		}, timeoutMs)
	);

	// Define the user session simulation promise
	const simulationPromise = (async () => {
		if (inject) {
			const injectMixpanelString = injectMixpanel.toString();
			await page.evaluate((MIXPANEL_TOKEN, injectMixpanelFn) => {
				const injectedFunction = new Function(`return (${injectMixpanelFn})`)();
				injectedFunction(MIXPANEL_TOKEN);
			}, MIXPANEL_TOKEN, injectMixpanelString);
			await u.sleep(100); // Ensure analytics script injection completes
		}

		const persona = selectPersona(); // Generate user persona
		const actions = await simulateUserSession(page, persona); // Simulate actions
		await browser.close(); // Close browser when done
		return actions; // Return actions performed
	})();

	// Use Promise.race to terminate if simulation takes too long
	try {
		return await Promise.race([simulationPromise, timeoutPromise]);
	} catch (error) {
		// Handle timeout error (close browser if not already closed)
		await browser.close();
		if (NODE_ENV === "dev") console.error("simulateUser Error:", error);
		return { error: error.message, timedOut: true };
	}
}


async function relaxCSP(page) {
	await page.setRequestInterception(true);
    
    page.on('request', request => {
        const headers = request.headers();
        delete headers['content-security-policy'];
        delete headers['content-security-policy-report-only'];
        headers['content-security-policy'] = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;";
        request.continue({ headers });
    });

    await page.setBypassCSP(true);

    // Fixed MutationObserver setup
    await page.evaluateOnNewDocument(() => {
        const removeCSP = () => {
            const metas = document.getElementsByTagName('meta');
            for (let i = 0; i < metas.length; i++) {
                if (metas[i].httpEquiv === 'Content-Security-Policy') {
                    metas[i].remove();
                }
            }
        };

        // Wait for document to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                removeCSP();
                if (document.documentElement) {
                    new MutationObserver(removeCSP).observe(document.documentElement, {
                        childList: true,
                        subtree: true
                    });
                }
            });
        } else {
            removeCSP();
            if (document.documentElement) {
                new MutationObserver(removeCSP).observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }
        }

        // Override document.createElement
        const originalCreateElement = document.createElement;
        document.createElement = function(...args) {
            const element = originalCreateElement.apply(document, args);
            if (element.nodeName === 'SCRIPT') {
                setTimeout(() => {
                    element.removeAttribute('nonce');
                    element.removeAttribute('integrity');
                }, 0);
            }
            return element;
        };
    });

}

/**
 * Simulates a user session on the page, following a persona-based action sequence.
 * @param {import('puppeteer').Page} page - Puppeteer page object.
 * @param {string} persona - User persona to simulate.
 */
async function simulateUserSession(page, persona) {
	await u.sleep(250); // Wait for page to load
	const actionSequence = generatePersonaActionSequence(persona);
	for (const action of actionSequence) {
		switch (action) {
			case "click":
				await clickStuff(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await clickStuff(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await clickStuff(page);
				break;
			case "scroll":
				await randomScroll(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await randomScroll(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await randomScroll(page);
				break;
			case "mouseMove":
				await randomMouseMove(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await randomMouseMove(page);
				if (coinFlip()) await wait();
				if (coinFlip()) await randomMouseMove(page);
				break;
			case "wait":
				await wait();
				break;
		}

		await u.sleep(250); // wait for data to flush
	}
	return {
		persona: personas[persona],
		personaLabel: persona,
		actionSequence
	};
}

// User personas with different action weightings
const personas = {
	quickScroller: { scroll: 0.6, mouseMove: 0.2, click: 0.1, wait: 0.1 },
	carefulReader: { scroll: 0.3, mouseMove: 0.3, click: 0.2, wait: 0.2 },
	frequentClicker: { scroll: 0.2, mouseMove: 0.3, click: 0.6, wait: 0.1 },
	noWaiting: { scroll: 0.2, mouseMove: 0.2, click: 0.7, wait: 0.05 },
	casualBrowser: { scroll: 0.4, mouseMove: 0.3, click: 0.2, wait: 0.15 },
	hoveringObserver: { scroll: 0.2, mouseMove: 0.6, click: 0.1, wait: 0.3 },
	intenseReader: { scroll: 0.15, mouseMove: 0.3, click: 0.1, wait: 0.4 },
	impulsiveScroller: { scroll: 0.7, mouseMove: 0.2, click: 0.1, wait: 0.05 },
	deepDiver: { scroll: 0.25, mouseMove: 0.4, click: 0.3, wait: 0.25 },
	explorer: { scroll: 0.5, mouseMove: 0.4, click: 0.3, wait: 0.1 }
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
	const length = u.rand(42, 100);
	for (let i = 0; i < length; i++) {
		const action = weightedRandom(actionTypes, weights);
		sequence.push(action);
	}
	return sequence;
}

// Core action functions

async function clickStuff(page) {
	try {
		const elements = await page.$$('a, button, input[type="submit"], [role="button"], [onclick]');
		if (elements.length === 0) throw new Error("No clickable elements found.");

		const element = elements[Math.floor(Math.random() * elements.length)];
		const boundingBox = await element.boundingBox();
		if (!boundingBox) throw new Error("Bounding box not found.");

		const { x, y, width, height } = boundingBox;
		const targetX = x + width / 2 + u.rand(-5, 5);
		const targetY = y + height / 2 + u.rand(-5, 5);

		// Check if element is a link and has an href attribute
		const tagName = await page.evaluate(el => el.tagName.toLowerCase(), element);
		const href = await page.evaluate(el => el.getAttribute('href'), element);

		if (tagName === 'a' && href) {
			// Register the click for analytics by clicking with the `metaKey` (cmd on macOS)
			await moveMouse(page, u.rand(0, page.viewport().width), u.rand(0, page.viewport().height), targetX, targetY);
			await page.mouse.click(targetX, targetY, { modifiers: ['Meta'] });
		} else {
			// Move the mouse and click as usual for non-link elements
			await moveMouse(page, u.rand(0, page.viewport().width), u.rand(0, page.viewport().height), targetX, targetY);
			await page.mouse.click(targetX, targetY);
		}

		await u.sleep(u.rand(100, 300)); // Simulate response time
		if (NODE_ENV === "dev") console.log('click!');
		return true;
	} catch (error) {
		// console.error("clickStuff Error:", error);
		// if (NODE_ENV === "dev") debugger;
		return false;
	}
}


async function randomScroll(page) {
	try {
		const scrollOptions = [
			() => page.evaluate(() => window.scrollBy(0, Math.random() * window.innerHeight / 2)),
			() => page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * Math.random(), behavior: 'smooth' })),
			() => page.evaluate(() => window.scrollBy({ top: window.innerHeight * (Math.random() < 0.5 ? 1 : -1), behavior: 'smooth' })),
			() => page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })),
			() => page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }))
		];
		await scrollOptions[Math.floor(Math.random() * scrollOptions.length)]();
		if (NODE_ENV === "dev") console.log('scroll!');
		return true;
	}
	catch (e) {
		return false;
	}
}

async function randomMouseMove(page) {
	const startX = u.rand(0, page.viewport().width);
	const startY = u.rand(0, page.viewport().height);
	const endX = u.rand(0, page.viewport().width);
	const endY = u.rand(0, page.viewport().height);
	return await moveMouse(page, startX, startY, endX, endY);
}

async function moveMouse(page, startX, startY, endX, endY) {
	try {
		// Increase step distance to reduce total number of steps
		const stepDistance = u.rand(10, 20); // Increase from 5 to 15 pixels per step
		const steps = Math.ceil(Math.max(Math.abs(endX - startX), Math.abs(endY - startY)) / stepDistance);
		const deltaX = (endX - startX) / steps;
		const deltaY = (endY - startY) / steps;
		let currentX = startX;
		let currentY = startY;

		for (let i = 0; i < steps; i++) {
			// Reduce sine curve adjustment for smoother movement
			const curveX = currentX + deltaX + Math.sin((i / steps) * Math.PI) * u.rand(-2, 2); // Reduced from -10, 10
			const curveY = currentY + deltaY + Math.sin((i / steps) * Math.PI) * u.rand(-2, 2);

			// Move the mouse to the calculated position
			await page.mouse.move(curveX, curveY);

			// Decrease the sleep frequency and duration to make movement faster
			if (u.rand(0, 100) < 10) await u.sleep(u.rand(10, 30)); // Reduced frequency and duration

			// Update current position
			currentX = curveX;
			currentY = curveY;
		}

		// Final mouse move to the exact end point
		await page.mouse.move(endX, endY);
		await u.sleep(u.rand(12, 42)); // Final hesitation reduced

		if (NODE_ENV === "dev") console.log('mouse!');
		return true;
	} catch (e) {
		return false;
	}
}

// Utility wait functions
async function wait() {
	await u.sleep(u.rand(42, 420));
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


function injectMixpanel(token = process.env.MIXPANEL_TOKEN || "") {
	function reset() {
		console.log('resetting....\n\n');
		if (mixpanel) {
			if (mixpanel.headless) {
				mixpanel.headless.reset();
			}
		}
	}

	function generateName() {
		var adjs = [
			"autumn", "hidden", "bitter", "misty", "silent", "empty", "dry", "dark",
			"summer", "icy", "delicate", "quiet", "white", "cool", "spring", "winter",
			"patient", "twilight", "dawn", "crimson", "wispy", "weathered", "blue",
			"billowing", "broken", "cold", "damp", "falling", "frosty", "green",
			"long", "late", "lingering", "bold", "little", "morning", "muddy", "old",
			"red", "rough", "still", "small", "sparkling", "throbbing", "shy",
			"wandering", "withered", "wild", "black", "young", "holy", "solitary",
			"fragrant", "aged", "snowy", "proud", "floral", "restless", "divine",
			"polished", "ancient", "purple", "lively", "nameless", "gentle", "gleaming", "furious", "luminous", "obscure", "poised", "shimmering", "swirling",
			"sombre", "steamy", "whispering", "jagged", "melodic", "moonlit", "starry", "forgotten",
			"peaceful", "restive", "rustling", "sacred", "ancient", "haunting", "solitary", "mysterious",
			"silver", "dusky", "earthy", "golden", "hallowed", "misty", "roaring", "serene", "vibrant",
			"stalwart", "whimsical", "timid", "tranquil", "vast", "youthful", "zephyr", "raging",
			"sapphire", "turbulent", "whirling", "sleepy", "ethereal", "tender", "unseen", "wistful"
		];

		var nouns = [
			"waterfall", "river", "breeze", "moon", "rain", "wind", "sea", "morning",
			"snow", "lake", "sunset", "pine", "shadow", "leaf", "dawn", "glitter",
			"forest", "hill", "cloud", "meadow", "sun", "glade", "bird", "brook",
			"butterfly", "bush", "dew", "dust", "field", "fire", "flower", "firefly",
			"feather", "grass", "haze", "mountain", "night", "pond", "darkness",
			"snowflake", "silence", "sound", "sky", "shape", "surf", "thunder",
			"violet", "water", "wildflower", "wave", "water", "resonance", "sun",
			"wood", "dream", "cherry", "tree", "fog", "frost", "voice", "paper",
			"frog", "smoke", "star", "glow", "wave", "riverbed", "cliff", "deluge", "prairie", "creek", "ocean",
			"peak", "valley", "starlight", "quartz", "woodland", "marsh", "earth", "canopy",
			"petal", "stone", "orb", "gale", "bay", "canyon", "watercourse", "vista", "raindrop",
			"boulder", "grove", "plateau", "sand", "mist", "tide", "blossom", "leaf", "flame",
			"shade", "coil", "grotto", "pinnacle", "scallop", "serenity", "abyss", "skyline",
			"drift", "echo", "nebula", "horizon", "crest", "wreath", "twilight", "balm", "glimmer"
		];


		var adj = adjs[Math.floor(Math.random() * adjs.length)]; // http://stackoverflow.com/a/17516862/103058
		var noun = nouns[Math.floor(Math.random() * nouns.length)];
		var MIN = 1000;
		var MAX = 9999;
		var num = Math.floor(Math.random() * ((MAX + 1) - MIN)) + MIN;

		return adj + '-' + noun + '-' + num;

	}

	const PARAMS = qsToObj(window.location.search);
	let { user = "", project_token = "", ...restParams } = PARAMS;
	if (!restParams) restParams = {};
	if (!project_token) project_token = token;
	if (!project_token) throw new Error("Project token is required when injecting mixpanel.");

	// Function that contains the code to run after the script is loaded
	function EMBED_TRACKING() {
		if (window.mixpanel) {
			mixpanel.init(project_token, {
				loaded: function (mp) {
					mp.register(restParams);
					const name = generateName();
					if (!user) user = name;
					mp.identify(user);
					mp.people.set({ $name: user, $email: user });
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
	// Load the external script and run myCode when it's done
	// loadScript(externalScript, EMBED_EZ_TRACK);

	const MIXPANEL_CUSTOM_LIB_URL = 'https://cdn-dev.mxpnl.com/libs/mixpanel-ac-alpha.js';
	//prettier-ignore
	(function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
	EMBED_TRACKING();
}


if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const result = await main({ concurrency: 3, users: 10, headless: true, inject: true, url: "https://soundcloud.com" });
	if (NODE_ENV === 'dev') debugger;
}
