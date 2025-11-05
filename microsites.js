/**
 * Microsites Orchestrator
 *
 * Runs sequential simulations across 6 different microsites
 * Each microsite gets 5 meeples with concurrency 5
 * Meeples randomly select from available sequences per microsite
 *
 * Can be run standalone for testing:
 * node microsites.js
 *
 * Or imported and called from server:
 * import { runMicrositesJob } from './microsites.js';
 * const results = await runMicrositesJob(options);
 */

import main from './meeple/headless.js';
import { log } from './utils/logger.js';
import { uid } from 'ak-tools';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { NODE_ENV = 'production' } = process.env;

/**
 * Create a production-safe logger that filters verbose meeple messages
 * @param {(message: any, meepleId?: any) => void} [baseLogger] - Base logging function
 * @returns {(message: any, meepleId?: any, socket?: any) => void} Filtered logging function
 */
function createProductionLogger(baseLogger) {
	const defaultLogger = (/** @type {any} */ msg) => console.log(msg);
	const actualLogger = baseLogger || defaultLogger;

	// In development, log everything
	if (NODE_ENV !== 'production') {
		return actualLogger;
	}

	// In production, only log job-level events (not individual meeple actions)
	return (message, meepleId = null, _socket = null) => {
		// Only log messages that start with job/microsite markers
		const isJobLevelLog =
			message.includes('█') || // Job start/end blocks
			message.includes('🚀') || // Job started
			message.includes('🏁') || // Job completed
			message.includes('🏢') || // Microsite starting
			message.includes('✅') || // Microsite completed
			message.includes('❌') || // Microsite/Job failed
			message.includes('📍') || // Progress indicator
			message.includes('⏸️') || // Pause between microsites
			message.includes('🆔') || // Job ID
			message.includes('⏰') || // Timestamps
			message.includes('⏱️') || // Duration
			message.includes('📊') || // Summary stats
			message.includes('👥') || // User counts
			message.includes('🎲') || // Drop-off chance
			message.includes('🌡️') || // Temperature
			/^={10,}/.test(message) || // Separator lines
			message.trim().startsWith('Progress:'); // Progress messages

		if (isJobLevelLog) {
			actualLogger(message, meepleId);
		}
	};
}

/**
 * Load a sequence configuration from JSON file
 * @param {string} filename - Name of the sequence file (e.g., "financial-sequence-kyc.json")
 * @returns {Promise<Object>} Sequence specification object
 */
async function loadSequence(filename) {
	const filePath = path.join(__dirname, 'sequences', filename);
	const content = await fs.readFile(filePath, 'utf-8');
	return JSON.parse(content);
}

/**
 * Microsite configurations
 */
const MICROSITES = [
	{
		name: 'iBank',
		url: 'https://mixpanel.github.io/fixpanel/financial',
		sequenceFiles: ['financial-sequence-kyc.json', 'financial-sequence-product-demo.json']
	},
	{
		name: 'weBuy',
		url: 'https://mixpanel.github.io/fixpanel/checkout',
		sequenceFiles: []
	},
	{
		name: 'meTube',
		url: 'https://mixpanel.github.io/fixpanel/streaming',
		sequenceFiles: []
	},
	{
		name: 'youAdmin',
		url: 'https://mixpanel.github.io/fixpanel/admin',
		sequenceFiles: []
	},
	{
		name: 'ourHeart',
		url: 'https://mixpanel.github.io/fixpanel/wellness',
		sequenceFiles: []
	},
	{
		name: 'theyRead',
		url: 'https://mixpanel.github.io/fixpanel/lifestyle',
		sequenceFiles: []
	}
];

/**
 * Default meeple parameters for microsites
 */
const DEFAULT_MEEPLE_PARAMS = {
	users: 5,
	concurrency: 5,
	headless: true,
	inject: false,
	past: false,
	token: null,
	masking: 'no masking',
	maxDuration: 3 * 60 * 1000 // 3 minutes in milliseconds (reduced from 4 to fit CRON timeout)
};

/**
 * Maximum duration for entire microsites job (27 minutes to fit within 30-minute CRON timeout)
 */
const MAX_JOB_DURATION_MS = 27 * 60 * 1000;

/**
 * Get random temperature between 7 and 10
 * @returns {number}
 */
// @ts-expect-error - Reserved for future temperature randomization
function randomTemperature() {
	return Math.floor(Math.random() * 4) + 7; // 7, 8, 9, or 10
}

/**
 * Get random drop-off percentage between 5 and 15
 * @returns {number}
 */
function randomDropOff() {
	return Math.floor(Math.random() * 11) + 5; // 5-15
}

/**
 * Run a single microsite simulation
 * @param {Object} microsite - Microsite configuration
 * @param {Object} overrideParams - Optional parameter overrides
 * @param {(message: any, meepleId?: any, socket?: any) => void} logger - Optional logging function
 * @returns {Promise<Object>} Simulation results
 */
async function runMicrositeSimulation(microsite, overrideParams = {}, logger = log) {
	const startTime = Date.now();

	// Wrap logger for production filtering (meeple actions will be filtered, job logs will pass)
	const productionLogger = createProductionLogger(logger);

	productionLogger(`\n${'='.repeat(60)}`);
	productionLogger(`🏢 Starting microsite: ${microsite.name}`);
	productionLogger(`🌐 URL: ${microsite.url}`);
	productionLogger(`📝 Available sequences: ${microsite.sequenceFiles.length}`);
	productionLogger(`${'='.repeat(60)}\n`);

	try {
		// Load all sequences for this microsite
		const sequences = {};
		for (const filename of microsite.sequenceFiles) {
			const sequenceName = filename.replace('.json', '').replace(/^.*-sequence-/, '');
			const sequenceSpec = await loadSequence(filename);

			// Randomize temperature for each sequence instance
			// sequenceSpec.temperature = randomTemperature();

			sequences[sequenceName] = sequenceSpec;
		}

		// Build meeple parameters
		// Note: URL params (IS_MEEPLE, MEEPLE_ID, SEQUENCE) are added per-meeple in headless.js
		const meepleParams = {
			...DEFAULT_MEEPLE_PARAMS,
			...overrideParams,
			url: microsite.url,
			sequences: Object.keys(sequences).length > 0 ? sequences : undefined,
			micrositeName: microsite.name
		};

		// Add random drop-off chance (5-15%)
		const dropOffChance = randomDropOff();
		productionLogger(`🎲 Drop-off chance: ${dropOffChance}%`);
		productionLogger(`🌡️ Temperature range: 7-10 (randomized per meeple)`);

		// Run the simulation with timeout wrapper
		// Pass productionLogger to filter meeple action logs in production
		// Since meeples run concurrently, timeout is maxDuration (per meeple) + buffer, NOT maxDuration * users
		const micrositeTimeoutMs = meepleParams.maxDuration + 60000; // 3 min + 1 min buffer = 4 min per microsite
		const result = await Promise.race([
			// @ts-ignore - productionLogger matches LogFunction signature at runtime
			main(meepleParams, productionLogger),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Microsite simulation timeout')), micrositeTimeoutMs)
			)
		]);

		const duration = (Date.now() - startTime) / 1000;

		productionLogger(`\n✅ ${microsite.name} completed in ${duration.toFixed(2)}s`);
		productionLogger(`${'='.repeat(60)}\n`);

		return {
			microsite: microsite.name,
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
		productionLogger(`${'='.repeat(60)}\n`);

		return {
			microsite: microsite.name,
			url: microsite.url,
			success: false,
			duration,
			error: error.message,
			startTime,
			endTime: Date.now()
		};
	}
}

/**
 * Run all microsites sequentially
 * @param {Object} options - Configuration options
 * @param {(message: any, meepleId?: any, socket?: any) => void} logger - Optional logging function
 * @returns {Promise<Object>} Aggregated results from all microsites
 */
export { createProductionLogger };

export async function runMicrositesJob(options = {}, logger = log) {
	const jobId = uid(6);
	const jobStartTime = Date.now();

	// Wrap logger for production filtering
	const productionLogger = createProductionLogger(logger);

	productionLogger(`\n${'█'.repeat(60)}`);
	productionLogger(`🚀 MICROSITES JOB STARTED`);
	productionLogger(`🆔 Job ID: ${jobId}`);
	productionLogger(`⏰ Start time: ${new Date().toISOString()}`);
	productionLogger(`⏱️  Max duration: 27 minutes (CRON timeout safety)`);
	productionLogger(`📊 Total microsites: ${MICROSITES.length}`);
	productionLogger(`👥 Meeples per microsite: ${options.users || DEFAULT_MEEPLE_PARAMS.users}`);
	productionLogger(`${'█'.repeat(60)}\n`);

	let results = [];

	try {
		// Wrap entire job with 27-minute timeout to prevent CRON timeout
		results = await Promise.race([
			// Main job execution
			(async () => {
				const micrositeResults = [];

				// Run each microsite sequentially (one at a time for memory safety)
				for (const [index, microsite] of MICROSITES.entries()) {
					// Check if we're approaching timeout (leave 2 min buffer)
					const elapsed = Date.now() - jobStartTime;
					if (elapsed > MAX_JOB_DURATION_MS - 120000) {
						productionLogger(`\n⚠️  Approaching job timeout, stopping after ${index} microsites`);
						break;
					}

					productionLogger(`\n📍 Progress: ${index + 1}/${MICROSITES.length} microsites`);

					// Pass the original logger (not productionLogger) to let each simulation create its own wrapper
					const result = await runMicrositeSimulation(microsite, options, logger);
					micrositeResults.push(result);

					// Small delay between microsites to allow cleanup
					if (index < MICROSITES.length - 1) {
						productionLogger(`⏸️  Pausing 5s before next microsite...\n`);
						await new Promise(resolve => setTimeout(resolve, 5000));
					}
				}

				return micrositeResults;
			})(),

			// Overall job timeout
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Overall job timeout (27 minutes exceeded)')), MAX_JOB_DURATION_MS)
			)
		]);
	} catch (error) {
		productionLogger(`\n❌ Job failed or timed out: ${error.message}`);
		// Return partial results if we have any
		if (results.length === 0) {
			throw error;
		}
	}

	const jobEndTime = Date.now();
	const totalDuration = (jobEndTime - jobStartTime) / 1000;

	// Calculate summary statistics
	const successfulMicrosites = results.filter(r => r.success).length;
	const failedMicrosites = results.filter(r => !r.success).length;

	productionLogger(`\n${'█'.repeat(60)}`);
	productionLogger(`🏁 MICROSITES JOB COMPLETED`);
	productionLogger(`🆔 Job ID: ${jobId}`);
	productionLogger(`⏱️  Total duration: ${totalDuration.toFixed(2)}s (${(totalDuration / 60).toFixed(2)} minutes)`);
	productionLogger(`✅ Successful: ${successfulMicrosites}/${MICROSITES.length}`);
	productionLogger(`❌ Failed: ${failedMicrosites}/${MICROSITES.length}`);
	productionLogger(`⏰ End time: ${new Date().toISOString()}`);
	productionLogger(`${'█'.repeat(60)}\n`);

	return {
		jobId,
		success: failedMicrosites === 0,
		totalDuration,
		startTime: jobStartTime,
		endTime: jobEndTime,
		microsites: results,
		summary: {
			total: MICROSITES.length,
			successful: successfulMicrosites,
			failed: failedMicrosites,
			successRate: ((successfulMicrosites / MICROSITES.length) * 100).toFixed(1) + '%'
		}
	};
}

// Allow standalone execution for testing
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	// @ts-expect-error - Environment variable reserved for future configuration
	const { NODE_ENV = 'dev' } = process.env;

	console.log('🧪 Running microsites job in standalone mode...\n');

	// Parse command-line arguments for headless mode
	const args = process.argv.slice(2);
	// @ts-expect-error - Headless flag reserved for future CLI options
	const headless = !args.includes('--no-headless');

	const testOptions = {
		headless: false,
		users: 1, // Fewer users for testing
		concurrency: 1
	};

	console.log(`Configuration: ${JSON.stringify(testOptions, null, 2)}\n`);

	runMicrositesJob(testOptions, console.log)
		.then(results => {
			console.log('\n✅ Standalone test completed!');
			console.log(`Results: ${JSON.stringify(results.summary, null, 2)}`);
			process.exit(0);
		})
		.catch(error => {
			console.error('\n❌ Standalone test failed:', error);
			process.exit(1);
		});
}
