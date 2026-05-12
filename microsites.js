/**
 * Microsites Orchestrator
 *
 * Runs the 6 fixpanel industry-vertical microsites in batched parallel:
 *   financial, checkout, streaming, admin, wellness, lifestyle
 *
 * Each vertical:
 *   - 10 meeples, headless=true, past=false, inject=false
 *   - Mixpanel is already loaded by the site itself; meeple super-props are
 *     attached defensively via the page's own mixpanel.register
 *
 * Verticals run in batches of MAX_PARALLEL_VERTICALS (default 3) — controlled
 * parallelism to keep peak memory under ~1.5GB on Cloud Run.
 *
 * Cron triggered (existing GCP Scheduler hits the same endpoint).
 *
 * Standalone:
 *   node microsites.js                       # all 6 verticals, default config
 *   node microsites.js --no-headless         # visible browsers (slower)
 *   node microsites.js --users=3             # smoke-test with 3 meeples per vertical
 *   node microsites.js --vertical=financial  # single vertical
 *
 * Imported:
 *   import { runMicrositesJob } from './microsites.js';
 *   const results = await runMicrositesJob({ users: 10 });
 */

import main from './meeple/headless.js';
import { log } from './utils/logger.js';
import pLimit from 'p-limit';
import { uid } from 'ak-tools';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { NODE_ENV = 'production' } = process.env;

/**
 * Production-safe logger: passes job-level events through, suppresses per-meeple noise.
 * @param {(message: any, meepleId?: any) => void} [baseLogger]
 * @returns {(message: any, meepleId?: any, socket?: any) => void}
 */
function createProductionLogger(baseLogger) {
	const defaultLogger = (/** @type {any} */ msg) => console.log(msg);
	const actualLogger = baseLogger || defaultLogger;

	if (NODE_ENV !== 'production') return actualLogger;

	return (message, meepleId = null, _socket = null) => {
		const isJobLevelLog =
			message.includes('█') ||
			message.includes('🚀') ||
			message.includes('🏁') ||
			message.includes('🏢') ||
			message.includes('✅') ||
			message.includes('❌') ||
			message.includes('📍') ||
			message.includes('⏸️') ||
			message.includes('🆔') ||
			message.includes('⏰') ||
			message.includes('⏱️') ||
			message.includes('📊') ||
			message.includes('👥') ||
			message.includes('🎲') ||
			message.includes('🌡️') ||
			/^={10,}/.test(message) ||
			message.trim().startsWith('Progress:');

		if (isJobLevelLog) actualLogger(message, meepleId);
	};
}

/**
 * Load a sequence configuration from JSON file.
 * @param {string} filename
 * @returns {Promise<Object>}
 */
async function loadSequence(filename) {
	const filePath = path.join(__dirname, 'sequences', filename);
	const content = await fs.readFile(filePath, 'utf-8');
	return JSON.parse(content);
}

/**
 * The 6 industry-vertical microsites.
 *
 * URLs hit production at https://mixpanel.github.io/fixpanel/{vertical}/
 * Source code lives at ~/code/fixpanel/app/{vertical}/ (Next.js).
 *
 * sequenceFiles is the list of *-sequence-*.json files in sequences/ to
 * distribute among the 10 meeples for that vertical. Empty = no scripted
 * sequences, meeples behave purely with persona-driven exploration.
 *
 * Implementor bot fills these in over time per MICROSITES_HANDOFF.md.
 */
const MICROSITES = [
	{
		name: 'iBank',
		vertical: 'financial',
		url: 'https://mixpanel.github.io/fixpanel/financial/',
		sequenceFiles: [
			'financial-sequence-kyc-converter.json',
			'financial-sequence-kyc-frustrated.json',
			'financial-sequence-stories-engaged.json',
			'financial-sequence-product-explorer.json',
			'financial-sequence-pricing-shopper.json',
			'financial-sequence-returning-customer.json',
			'financial-sequence-bouncer.json'
		]
	},
	{
		name: 'weBuy',
		vertical: 'checkout',
		url: 'https://mixpanel.github.io/fixpanel/checkout/',
		sequenceFiles: [
			'checkout-sequence-cart-converter.json',
			'checkout-sequence-coupon-frustrated.json',
			'checkout-sequence-deals-shopper.json',
			'checkout-sequence-window-shopper.json',
			'checkout-sequence-chatbot-engager.json',
			'checkout-sequence-bouncer.json'
		]
	},
	{
		name: 'meTube',
		vertical: 'streaming',
		url: 'https://mixpanel.github.io/fixpanel/streaming/',
		sequenceFiles: [
			'streaming-sequence-subscriber.json',
			'streaming-sequence-frustrated-liker.json',
			'streaming-sequence-playlist-curator.json',
			'streaming-sequence-recommender-skeptic.json',
			'streaming-sequence-history-rewatcher.json',
			'streaming-sequence-bouncer.json'
		]
	},
	{
		name: 'youAdmin',
		vertical: 'admin',
		url: 'https://mixpanel.github.io/fixpanel/admin/',
		sequenceFiles: [
			'admin-sequence-power-onboarder.json',
			'admin-sequence-permission-blocked.json',
			'admin-sequence-csv-frustrated.json',
			'admin-sequence-access-approver.json',
			'admin-sequence-chatbot-explorer.json',
			'admin-sequence-bouncer.json'
		]
	},
	{
		name: 'ourHeart',
		vertical: 'wellness',
		url: 'https://mixpanel.github.io/fixpanel/wellness/',
		sequenceFiles: [
			'wellness-sequence-form-completer.json',
			'wellness-sequence-form-frustrated.json',
			'wellness-sequence-wheel-spinner.json',
			'wellness-sequence-community-voter.json',
			'wellness-sequence-ai-chat-user.json',
			'wellness-sequence-bouncer.json'
		]
	},
	{
		name: 'theyRead',
		vertical: 'lifestyle',
		url: 'https://mixpanel.github.io/fixpanel/lifestyle/',
		sequenceFiles: [
			'lifestyle-sequence-creator.json',
			'lifestyle-sequence-comment-confused.json',
			'lifestyle-sequence-bias-checker.json',
			'lifestyle-sequence-sort-explorer.json',
			'lifestyle-sequence-upvoter.json',
			'lifestyle-sequence-bouncer.json'
		]
	}
];

const DEFAULT_USERS_PER_VERTICAL = 10;
const DEFAULT_CONCURRENCY_PER_VERTICAL = 5;

/**
 * How many verticals run in parallel. 3 keeps peak memory under ~1.5GB on
 * Cloud Run (each vertical = 5 concurrent browsers × ~100MB).
 */
const MAX_PARALLEL_VERTICALS = 3;

/**
 * Per-meeple session ceiling. Persona durations top out at ~12min (browser),
 * but we cap microsite meeples at 4min so the whole job fits the 27min CRON
 * window even when verticals stack up.
 */
const PER_MEEPLE_MAX_DURATION_MS = 4 * 60 * 1000;

/**
 * Per-vertical wall-clock cap. With 5 concurrent meeples each capped at 4min,
 * worst-case is ~5min including launch/teardown. Add 1min buffer.
 */
const PER_VERTICAL_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * Whole-job ceiling (27min — fits inside the 30min CRON timeout with buffer).
 * 6 verticals / 3 parallel = 2 batches × ~6min = ~12min realistic; 27min hard
 * stop catches runaway cases.
 */
const MAX_JOB_DURATION_MS = 27 * 60 * 1000;

/**
 * Default per-meeple parameters for a microsite run.
 * inject:false because each vertical loads its own Mixpanel SDK; defensive
 * super-prop registration in headless.js piggybacks onto it.
 */
const DEFAULT_MEEPLE_PARAMS = {
	users: DEFAULT_USERS_PER_VERTICAL,
	concurrency: DEFAULT_CONCURRENCY_PER_VERTICAL,
	headless: true,
	inject: false,
	past: false,
	token: null,
	masking: 'no masking',
	maxDuration: PER_MEEPLE_MAX_DURATION_MS
};

/**
 * Run a single vertical's simulation.
 * @param {typeof MICROSITES[number]} microsite
 * @param {Object} overrideParams
 * @param {(message: any, meepleId?: any, socket?: any) => void} logger
 * @returns {Promise<Object>}
 */
async function runMicrositeSimulation(microsite, overrideParams = {}, logger = log) {
	const startTime = Date.now();
	const productionLogger = createProductionLogger(logger);

	productionLogger(`\n${'='.repeat(60)}`);
	productionLogger(`🏢 Starting microsite: ${microsite.name} (${microsite.vertical})`);
	productionLogger(`🌐 URL: ${microsite.url}`);
	productionLogger(`📝 Sequence files: ${microsite.sequenceFiles.length || 'none (persona-driven exploration)'}`);
	productionLogger(`${'='.repeat(60)}\n`);

	try {
		const sequences = {};
		for (const filename of microsite.sequenceFiles) {
			const sequenceName = filename.replace('.json', '').replace(/^.*-sequence-/, '');
			const sequenceSpec = await loadSequence(filename);
			sequences[sequenceName] = sequenceSpec;
		}

		const meepleParams = {
			...DEFAULT_MEEPLE_PARAMS,
			...overrideParams,
			url: microsite.url,
			sequences: Object.keys(sequences).length > 0 ? sequences : undefined,
			micrositeName: microsite.name
		};

		const result = await Promise.race([
			// @ts-ignore - productionLogger matches LogFunction signature at runtime
			main(meepleParams, productionLogger),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error(`${microsite.name} timeout`)), PER_VERTICAL_TIMEOUT_MS)
			)
		]);

		const duration = (Date.now() - startTime) / 1000;
		productionLogger(`\n✅ ${microsite.name} completed in ${duration.toFixed(2)}s`);

		return {
			microsite: microsite.name,
			vertical: microsite.vertical,
			url: microsite.url,
			success: true,
			duration,
			result,
			startTime,
			endTime: Date.now()
		};
	} catch (error) {
		const duration = (Date.now() - startTime) / 1000;
		productionLogger(`\n❌ ${microsite.name} failed: ${error.message}`);

		return {
			microsite: microsite.name,
			vertical: microsite.vertical,
			url: microsite.url,
			success: false,
			duration,
			error: error.message,
			startTime,
			endTime: Date.now()
		};
	}
}

export { createProductionLogger };

/**
 * Run all (or a filtered subset of) verticals in batched parallel.
 *
 * Recognized options:
 *   - users (number, default 10): meeples per vertical
 *   - concurrency (number, default 5): concurrent meeples within a vertical
 *   - headless (boolean, default true)
 *   - vertical (string): run a single vertical by slug ("financial", "checkout", etc.)
 *   - parallelVerticals (number, default 3): how many verticals at once
 *   - any other props are forwarded to the meeple engine
 *
 * @param {Record<string, any>} options
 * @param {(message: any, meepleId?: any, socket?: any) => void} [logger]
 * @returns {Promise<Object>}
 */
export async function runMicrositesJob(options = {}, logger = log) {
	const jobId = uid(6);
	const jobStartTime = Date.now();
	const productionLogger = createProductionLogger(logger);

	const targetVerticals = options.vertical
		? MICROSITES.filter(m => m.vertical === options.vertical || m.name === options.vertical)
		: MICROSITES;

	if (targetVerticals.length === 0) {
		throw new Error(`No microsites match filter: ${options.vertical}`);
	}

	const parallelVerticals = Math.max(1, Math.min(options.parallelVerticals || MAX_PARALLEL_VERTICALS, 6));
	const usersPerVertical = options.users || DEFAULT_USERS_PER_VERTICAL;

	productionLogger(`\n${'█'.repeat(60)}`);
	productionLogger(`🚀 MICROSITES JOB STARTED`);
	productionLogger(`🆔 Job ID: ${jobId}`);
	productionLogger(`⏰ Start time: ${new Date().toISOString()}`);
	productionLogger(`⏱️  Max job duration: 27 minutes`);
	productionLogger(`📊 Verticals: ${targetVerticals.length} (${targetVerticals.map(v => v.vertical).join(', ')})`);
	productionLogger(`👥 Meeples per vertical: ${usersPerVertical}`);
	productionLogger(`🔀 Parallel verticals: ${parallelVerticals}`);
	productionLogger(`${'█'.repeat(60)}\n`);

	const limit = pLimit(parallelVerticals);
	let results = [];

	try {
		results = await Promise.race([
			Promise.all(
				targetVerticals.map((microsite, index) =>
					limit(() => {
						productionLogger(`\n📍 Queued ${index + 1}/${targetVerticals.length}: ${microsite.name}`);
						return runMicrositeSimulation(microsite, options, logger);
					})
				)
			),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Overall job timeout (27 minutes)')), MAX_JOB_DURATION_MS)
			)
		]);
	} catch (error) {
		productionLogger(`\n❌ Job failed or timed out: ${error.message}`);
		if (results.length === 0) throw error;
	}

	const jobEndTime = Date.now();
	const totalDuration = (jobEndTime - jobStartTime) / 1000;
	const successful = results.filter(r => r.success).length;
	const failed = results.filter(r => !r.success).length;

	productionLogger(`\n${'█'.repeat(60)}`);
	productionLogger(`🏁 MICROSITES JOB COMPLETED`);
	productionLogger(`🆔 Job ID: ${jobId}`);
	productionLogger(`⏱️  Total duration: ${totalDuration.toFixed(2)}s (${(totalDuration / 60).toFixed(2)}m)`);
	productionLogger(`✅ Successful: ${successful}/${targetVerticals.length}`);
	productionLogger(`❌ Failed: ${failed}/${targetVerticals.length}`);
	productionLogger(`⏰ End time: ${new Date().toISOString()}`);
	productionLogger(`${'█'.repeat(60)}\n`);

	return {
		jobId,
		success: failed === 0,
		totalDuration,
		startTime: jobStartTime,
		endTime: jobEndTime,
		microsites: results,
		summary: {
			total: targetVerticals.length,
			successful,
			failed,
			successRate: ((successful / targetVerticals.length) * 100).toFixed(1) + '%'
		}
	};
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const args = process.argv.slice(2);
	const getArg = (name, fallback) => {
		const flag = args.find(a => a.startsWith(`--${name}=`));
		return flag ? flag.split('=')[1] : fallback;
	};

	const headless = !args.includes('--no-headless');
	const users = parseInt(getArg('users', String(DEFAULT_USERS_PER_VERTICAL)), 10);
	const vertical = getArg('vertical', null);
	const parallelVerticals = parseInt(getArg('parallel', String(MAX_PARALLEL_VERTICALS)), 10);

	const testOptions = { headless, users, vertical, parallelVerticals };
	console.log(`🧪 Standalone microsites: ${JSON.stringify(testOptions)}\n`);

	runMicrositesJob(testOptions, console.log)
		.then(results => {
			console.log('\n✅ Done!');
			console.log(`Summary: ${JSON.stringify(results.summary, null, 2)}`);
			process.exit(0);
		})
		.catch(error => {
			console.error('\n❌ Failed:', error);
			process.exit(1);
		});
}
