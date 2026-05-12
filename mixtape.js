import main from './meeple/headless.js';
import { createProductionLogger } from './microsites.js';
import { log } from './utils/logger.js';
import { uid } from 'ak-tools';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIXTAPE_URL = 'https://mixpanel.github.io/fixpanel/mixtape/';
const MAX_USERS = 25;
const DEFAULT_USERS = 10;
const DEFAULT_CONCURRENCY = 5;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

const FIRST_NAMES = [
	'Emma',
	'Liam',
	'Sophia',
	'Noah',
	'Olivia',
	'James',
	'Ava',
	'William',
	'Isabella',
	'Oliver',
	'Mia',
	'Benjamin',
	'Charlotte',
	'Elijah',
	'Amelia',
	'Lucas',
	'Harper',
	'Mason',
	'Evelyn',
	'Logan',
	'Aria',
	'Alexander',
	'Chloe',
	'Ethan',
	'Ella',
	'Daniel',
	'Luna',
	'Henry',
	'Grace',
	'Sebastian',
	'Yuki',
	'Raj',
	'Priya',
	'Carlos',
	'Maria',
	'Ahmed',
	'Fatima',
	'Wei',
	'Mei',
	'Hiroshi',
	'Aisha',
	'Diego',
	'Camila',
	'Andre',
	'Leila',
	'Kofi',
	'Nia',
	'Pavel',
	'Ingrid',
	'Lars'
];

const LAST_NAMES = [
	'Smith',
	'Johnson',
	'Williams',
	'Brown',
	'Jones',
	'Garcia',
	'Miller',
	'Davis',
	'Rodriguez',
	'Martinez',
	'Anderson',
	'Taylor',
	'Thomas',
	'Moore',
	'Jackson',
	'Martin',
	'Lee',
	'Thompson',
	'White',
	'Harris',
	'Clark',
	'Patel',
	'Kim',
	'Nakamura',
	'Chen',
	'Santos',
	'Okafor',
	'Mueller',
	'Johansson',
	'Petrov',
	'Dubois',
	'Rossi',
	'Nguyen',
	'Tanaka',
	'Ali',
	'Rivera',
	'Fernandez',
	'Singh',
	'Kowalski',
	'Berg'
];

const EMAIL_DOMAINS = [
	'gmail.com',
	'yahoo.com',
	'outlook.com',
	'hotmail.com',
	'icloud.com',
	'protonmail.com',
	'mail.com',
	'aol.com',
	'fastmail.com',
	'hey.com'
];

const PERSONAS = [
	// 1.1.x rebalance — story: lo-fi devotees subscribe, hip-hop crowd bounces.
	// Two cohorts with opposite outcomes makes the genre→conversion gap loud
	// in any content_genre breakdown.
	{ name: 'power-listener', weight: 8, sequenceFile: 'mixtape-power-listener.json' },
	{ name: 'casual-browser', weight: 22, sequenceFile: 'mixtape-casual-browser.json' },
	{ name: 'lofi-devotee', weight: 30, sequenceFile: 'mixtape-lofi-devotee.json' },
	{ name: 'hiphop-curious', weight: 10, sequenceFile: 'mixtape-hiphop-curious.json' },
	{ name: 'new-visitor', weight: 22, sequenceFile: 'mixtape-new-visitor.json' },
	{ name: 'churning', weight: 8, sequenceFile: 'mixtape-churning.json' }
];

const TOTAL_WEIGHT = PERSONAS.reduce((sum, p) => sum + p.weight, 0);

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function generateUser() {
	const first = pick(FIRST_NAMES);
	const last = pick(LAST_NAMES);
	const domain = pick(EMAIL_DOMAINS);
	return {
		displayName: `${first} ${last}`,
		email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`
	};
}

function assignPersonas(numUsers) {
	const assignments = [];
	for (let i = 0; i < numUsers; i++) {
		const roll = Math.random() * TOTAL_WEIGHT;
		let cumulative = 0;
		for (const persona of PERSONAS) {
			cumulative += persona.weight;
			if (roll < cumulative) {
				assignments.push({ persona: persona.name, sequenceFile: persona.sequenceFile, user: generateUser() });
				break;
			}
		}
	}
	return assignments;
}

async function loadSequence(filename) {
	const filePath = path.join(__dirname, 'sequences', filename);
	const content = await fs.readFile(filePath, 'utf-8');
	const parsed = JSON.parse(content);
	const key = Object.keys(parsed)[0];
	return parsed[key];
}

function injectUserData(sequenceSpec, user) {
	const clone = JSON.parse(JSON.stringify(sequenceSpec));
	for (const action of clone.actions) {
		if (action.text) {
			action.text = action.text.replace('{{displayName}}', user.displayName).replace('{{email}}', user.email);
		}
	}
	return clone;
}

async function prepareSequences(assignments) {
	const sequenceCache = {};
	const sequences = {};

	for (let i = 0; i < assignments.length; i++) {
		const { persona, sequenceFile, user } = assignments[i];

		if (!sequenceCache[sequenceFile]) {
			sequenceCache[sequenceFile] = await loadSequence(sequenceFile);
		}

		const personalized = injectUserData(sequenceCache[sequenceFile], user);
		sequences[`${persona}-${i}`] = personalized;
	}

	return sequences;
}

function summarizeDistribution(assignments) {
	const counts = {};
	for (const a of assignments) {
		counts[a.persona] = (counts[a.persona] || 0) + 1;
	}
	return counts;
}

/**
 * @param {Object} options
 * @param {(message: any, meepleId?: any, socket?: any) => void} logger
 */
export async function runMixtapeJob(options = {}, logger = log) {
	const jobId = uid(6);
	const jobStartTime = Date.now();
	const productionLogger = createProductionLogger(logger);

	const numUsers = Math.min(options.users || DEFAULT_USERS, MAX_USERS);
	const concurrency = Math.min(options.concurrency || DEFAULT_CONCURRENCY, 10);
	const headless = options.headless ?? true;
	const past = options.past ?? true;
	const bugRate = options.bugRate ?? 0.15;

	productionLogger(`\n${'█'.repeat(60)}`);
	productionLogger(`🚀 MIXTAPE JOB STARTED`);
	productionLogger(`🆔 Job ID: ${jobId}`);
	productionLogger(`⏰ Start time: ${new Date().toISOString()}`);
	productionLogger(`👥 Meeples: ${numUsers} (concurrency: ${concurrency})`);
	productionLogger(`🎯 Bug rate: ${(bugRate * 100).toFixed(0)}%`);
	productionLogger(`${'█'.repeat(60)}\n`);

	const assignments = assignPersonas(numUsers);
	const distribution = summarizeDistribution(assignments);
	productionLogger(`📊 Persona distribution: ${JSON.stringify(distribution)}`);

	const sequences = await prepareSequences(assignments);
	productionLogger(`📝 Prepared ${Object.keys(sequences).length} personalized sequences`);

	const bugCount = Math.round(numUsers * bugRate);
	const normalCount = numUsers - bugCount;

	const baseParams = {
		concurrency,
		headless,
		inject: false,
		past,
		token: options.token || null,
		masking: false
	};

	/** @type {Record<string, any>} */
	const normalSequences = {};
	/** @type {Record<string, any>} */
	const bugSequences = {};
	const keys = Object.keys(sequences);
	for (let i = 0; i < keys.length; i++) {
		if (i < normalCount) {
			normalSequences[keys[i]] = sequences[keys[i]];
		} else {
			bugSequences[keys[i]] = sequences[keys[i]];
		}
	}

	try {
		const batches = [];

		if (normalCount > 0) {
			productionLogger(`🎵 Launching ${normalCount} normal meeples...`);
			batches.push(
				main({ ...baseParams, url: MIXTAPE_URL, users: normalCount, sequences: normalSequences }, productionLogger)
			);
		}

		if (bugCount > 0) {
			productionLogger(`🐛 Launching ${bugCount} bug-mode meeples...`);
			batches.push(
				main(
					{ ...baseParams, url: `${MIXTAPE_URL}?bug=true`, users: bugCount, sequences: bugSequences },
					productionLogger
				)
			);
		}

		const batchResults = await Promise.race([
			Promise.all(batches),
			new Promise((_, reject) => setTimeout(() => reject(new Error('Mixtape job timeout')), JOB_TIMEOUT_MS))
		]);

		const totalDuration = (Date.now() - jobStartTime) / 1000;

		productionLogger(`\n${'█'.repeat(60)}`);
		productionLogger(`🏁 MIXTAPE JOB COMPLETED in ${totalDuration.toFixed(2)}s`);
		productionLogger(`${'█'.repeat(60)}\n`);

		return {
			jobId,
			success: true,
			totalDuration,
			startTime: jobStartTime,
			endTime: Date.now(),
			results: batchResults,
			personaDistribution: distribution,
			bugMeeples: bugCount
		};
	} catch (error) {
		const totalDuration = (Date.now() - jobStartTime) / 1000;
		productionLogger(`\n❌ Mixtape job failed: ${error.message}`);

		return {
			jobId,
			success: false,
			totalDuration,
			startTime: jobStartTime,
			endTime: Date.now(),
			error: error.message,
			personaDistribution: distribution
		};
	}
}

// node mixtape.js                                  # 3 meeples, visible browsers
// node mixtape.js --users=5                         # 5 meeples, visible browsers
// node mixtape.js --users=10 --headless=true        # 10 meeples, headless
// node mixtape.js --users=3 --past=true             # past-time simulation
// node mixtape.js --users=5 --bugRate=0.5           # 50% of meeples get ?bug=true
// node mixtape.js --users=8 --headless=true --past=true --bugRate=0.15
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const args = process.argv.slice(2);
	const getArg = (name, fallback) => {
		const flag = args.find(a => a.startsWith(`--${name}=`));
		return flag ? flag.split('=')[1] : fallback;
	};

	const users = parseInt(getArg('users', '3'), 10);
	const headless = getArg('headless', 'false') === 'true';
	const past = getArg('past', 'false') === 'true';
	const bugRate = parseFloat(getArg('bugRate', '0'));

	console.log(`🧪 Mixtape standalone: ${users} meeples, headless=${headless}, past=${past}, bugRate=${bugRate}\n`);

	runMixtapeJob({ users, headless, past, bugRate }, console.log)
		.then(result => {
			console.log(`\n✅ Done! ${JSON.stringify(result.personaDistribution)}`);
			process.exit(0);
		})
		.catch(error => {
			console.error('\n❌ Failed:', error);
			process.exit(1);
		});
}
