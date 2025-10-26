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
		url: 'https://ak--47.github.io/fixpanel/financial/',
		sequenceFiles: [
			'financial-sequence-kyc.json',
			'financial-sequence-product-demo.json'
		]
	},
	{
		name: 'theyBuy',
		url: 'https://ak--47.github.io/fixpanel/checkout/',
		sequenceFiles: []
	},
	{
		name: 'meTube',
		url: 'https://ak--47.github.io/fixpanel/streaming/',
		sequenceFiles: []
	},
	{
		name: 'youAdmin',
		url: 'https://ak--47.github.io/fixpanel/admin/',
		sequenceFiles: []
	},
	{
		name: 'ourHeart',
		url: 'https://ak--47.github.io/fixpanel/wellness/',
		sequenceFiles: []
	},
	{
		name: 'weRead',
		url: 'https://ak--47.github.io/fixpanel/lifestyle/',
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
	maxDuration: 4 * 60 * 1000 // 4 minutes in milliseconds
};

/**
 * Get random temperature between 7 and 10
 * @returns {number}
 */
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
 * @param {Function} logger - Optional logging function
 * @returns {Promise<Object>} Simulation results
 */
async function runMicrositeSimulation(microsite, overrideParams = {}, logger = log) {
	const startTime = Date.now();
	logger(`\n${'='.repeat(60)}`);
	logger(`🏢 Starting microsite: ${microsite.name}`);
	logger(`🌐 URL: ${microsite.url}`);
	logger(`📝 Available sequences: ${microsite.sequenceFiles.length}`);
	logger(`${'='.repeat(60)}\n`);

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
		const meepleParams = {
			...DEFAULT_MEEPLE_PARAMS,
			...overrideParams,
			url: microsite.url,
			sequences: Object.keys(sequences).length > 0 ? sequences : undefined,
			micrositeName: microsite.name
		};

		// Add random drop-off chance (5-15%)
		const dropOffChance = randomDropOff();
		logger(`🎲 Drop-off chance: ${dropOffChance}%`);
		logger(`🌡️ Temperature range: 7-10 (randomized per meeple)`);

		// Run the simulation with timeout wrapper
		const result = await Promise.race([
			main(meepleParams, logger),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Microsite simulation timeout')),
					meepleParams.maxDuration * meepleParams.users + 60000) // Total time + 1 min buffer
			)
		]);

		const duration = (Date.now() - startTime) / 1000;

		logger(`\n✅ ${microsite.name} completed in ${duration.toFixed(2)}s`);
		logger(`${'='.repeat(60)}\n`);

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

		logger(`\n❌ ${microsite.name} failed: ${error.message}`);
		logger(`${'='.repeat(60)}\n`);

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
 * @param {Function} logger - Optional logging function
 * @returns {Promise<Object>} Aggregated results from all microsites
 */
export async function runMicrositesJob(options = {}, logger = log) {
	const jobId = uid(6);
	const jobStartTime = Date.now();

	logger(`\n${'█'.repeat(60)}`);
	logger(`🚀 MICROSITES JOB STARTED`);
	logger(`🆔 Job ID: ${jobId}`);
	logger(`⏰ Start time: ${new Date().toISOString()}`);
	logger(`📊 Total microsites: ${MICROSITES.length}`);
	logger(`👥 Meeples per microsite: ${options.users || DEFAULT_MEEPLE_PARAMS.users}`);
	logger(`${'█'.repeat(60)}\n`);

	const results = [];

	// Run each microsite sequentially (one at a time for memory safety)
	for (const [index, microsite] of MICROSITES.entries()) {
		logger(`\n📍 Progress: ${index + 1}/${MICROSITES.length} microsites`);

		const result = await runMicrositeSimulation(microsite, options, logger);
		results.push(result);

		// Small delay between microsites to allow cleanup
		if (index < MICROSITES.length - 1) {
			logger(`⏸️  Pausing 5s before next microsite...\n`);
			await new Promise(resolve => setTimeout(resolve, 5000));
		}
	}

	const jobEndTime = Date.now();
	const totalDuration = (jobEndTime - jobStartTime) / 1000;

	// Calculate summary statistics
	const successfulMicrosites = results.filter(r => r.success).length;
	const failedMicrosites = results.filter(r => !r.success).length;

	logger(`\n${'█'.repeat(60)}`);
	logger(`🏁 MICROSITES JOB COMPLETED`);
	logger(`🆔 Job ID: ${jobId}`);
	logger(`⏱️  Total duration: ${totalDuration.toFixed(2)}s (${(totalDuration / 60).toFixed(2)} minutes)`);
	logger(`✅ Successful: ${successfulMicrosites}/${MICROSITES.length}`);
	logger(`❌ Failed: ${failedMicrosites}/${MICROSITES.length}`);
	logger(`⏰ End time: ${new Date().toISOString()}`);
	logger(`${'█'.repeat(60)}\n`);

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
			successRate: (successfulMicrosites / MICROSITES.length * 100).toFixed(1) + '%'
		}
	};
}

// Allow standalone execution for testing
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const { NODE_ENV = 'dev' } = process.env;

	console.log('🧪 Running microsites job in standalone mode...\n');

	// Parse command-line arguments for headless mode
	const args = process.argv.slice(2);
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
