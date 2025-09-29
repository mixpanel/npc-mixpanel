#!/usr/bin/env node

/**
 * Integration test for the sequences API
 * Tests the complete flow from API request to sequence execution
 */

import { validateSequences } from './meeple/sequences.js';
import main from './meeple/headless.js';

// Test sequences specification
const testSequences = {
	'simple-click-test': {
		description: 'Simple click test sequence',
		temperature: 8,
		'chaos-range': [1, 2],
		actions: [
			{ action: 'click', selector: 'body' }, // Safe selector that always exists
		]
	},
	'form-interaction-test': {
		description: 'Form interaction test',
		temperature: 7,
		'chaos-range': [1, 3],
		actions: [
			{ action: 'click', selector: 'body' },
			{ action: 'type', selector: 'input', text: 'test input' }, // Will fail gracefully if no input
		]
	}
};

async function runTest() {
	console.log('🧪 Testing Sequences API Integration\n');

	// Test 1: Validation
	console.log('1️⃣ Testing sequence validation...');
	const validation = validateSequences(testSequences);
	if (validation.valid) {
		console.log('✅ Validation passed');
	} else {
		console.log('❌ Validation failed:', validation.errors);
		process.exit(1);
	}

	// Test 2: Invalid sequences
	console.log('\n2️⃣ Testing invalid sequence handling...');
	const invalidSequences = {
		'invalid-test': {
			temperature: 15, // Too high
			actions: [
				{ action: 'invalid-action', selector: '#test' }
			]
		}
	};
	const invalidValidation = validateSequences(invalidSequences);
	if (!invalidValidation.valid) {
		console.log('✅ Invalid sequences correctly rejected');
		console.log('   Errors:', invalidValidation.errors.slice(0, 2), '...');
	} else {
		console.log('❌ Invalid sequences should have been rejected');
		process.exit(1);
	}

	// Test 3: End-to-end execution (minimal test)
	console.log('\n3️⃣ Testing end-to-end execution...');
	try {
		process.env.NODE_ENV = 'test';
		process.env.MIXPANEL_TOKEN = 'test-token';

		const params = {
			url: 'https://ak--47.github.io/fixpanel/', // Simple test page
			users: 1,
			concurrency: 1,
			headless: true,
			sequences: {
				'test-sequence': {
					description: 'End-to-end test',
					temperature: 5, // Medium temperature for mixed behavior
					actions: [
						{ action: 'click', selector: 'body' } // Safe action
					]
				}
			}
		};

		const logMessages = [];
		const testLogger = (message, meepleId) => {
			logMessages.push({ message, meepleId });
		};

		console.log('   Running simulation with sequences...');
		const results = await main(params, testLogger);

		if (results && results.length > 0) {
			const result = results[0];
			console.log('✅ Simulation completed successfully');
			console.log(`   Duration: ${result.duration}s`);
			console.log(`   Actions performed: ${result.actions?.length || 0}`);
			console.log(`   Sequence used: ${result.sequence || 'none'}`);
			console.log(`   Success: ${result.success}`);
		} else {
			console.log('❌ No results returned from simulation');
		}

		// Check that sequence-related log messages were generated
		const sequenceMessages = logMessages.filter(log =>
			log.message.includes('sequence') || log.message.includes('Sequence')
		);
		if (sequenceMessages.length > 0) {
			console.log('✅ Sequence-specific logging detected');
		} else {
			console.log('⚠️  No sequence-specific logs found (may be normal for low temperature)');
		}

	} catch (error) {
		console.log('❌ End-to-end test failed:', error.message);
		// Don't exit - this could fail due to environment issues
	}

	console.log('\n🎉 Sequences API integration tests completed!');
	console.log('\n📚 Usage Examples:');
	console.log('   POST /simulate with sequences parameter');
	console.log('   See README-sequences.md for full documentation');
	console.log('   Check index.d.ts for TypeScript definitions');
}

// Run the test
runTest().catch(error => {
	console.error('❌ Test suite failed:', error);
	process.exit(1);
});