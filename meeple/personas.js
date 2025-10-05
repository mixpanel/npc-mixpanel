import u from 'ak-tools';
import { personas } from './entities.js';
import { weightedRandom } from './utils.js';

/**
 * Randomly select a persona from available personas
 * @param {Function} log - Logging function
 * @returns {string} - Selected persona key
 */
export function selectPersona(log = console.log) {
	const personaKeys = Object.keys(personas);
	const selectedPersona = personaKeys[Math.floor(Math.random() * personaKeys.length)];
	log(`🎭 Selected persona: ${selectedPersona}`);
	return selectedPersona;
}

/**
 * Get context-aware action based on action history to create realistic user behavior
 * @param {Array} actionHistory - Recent actions performed by the user
 * @param {string} suggestedAction - The action that was randomly selected
 * @param {Function} log - Logging function
 * @returns {string} - Final action to perform (may be modified for realism)
 */
export function getContextAwareAction(actionHistory, suggestedAction, log = console.log) {
	if (actionHistory.length === 0) return suggestedAction;

	const lastAction = actionHistory[actionHistory.length - 1];
	const last3Actions = actionHistory.slice(-3);
	const recentClicks = last3Actions.filter(action => action === 'click').length;

	// Context-aware modifications for natural behavior
	if (lastAction === 'click' && Math.random() < 0.3) {
		// After clicking, sometimes wait/observe
		return Math.random() < 0.5 ? 'wait' : 'scroll';
	}

	if (recentClicks >= 2 && Math.random() < 0.4) {
		// Too many recent clicks, take a break
		return Math.random() < 0.6 ? 'scroll' : 'wait';
	}

	if (lastAction === 'scroll' && suggestedAction === 'scroll' && Math.random() < 0.2) {
		// Occasional pause during scrolling sessions
		return 'wait';
	}

	// Prevent excessive repetition
	const lastSameActions = actionHistory.slice(-3).filter(action => action === suggestedAction).length;
	if (lastSameActions >= 2 && Math.random() < 0.5) {
		// Break the pattern with a different action
		const alternatives = ['click', 'scroll', 'wait'];
		const filteredAlternatives = alternatives.filter(alt => alt !== suggestedAction);
		return filteredAlternatives[Math.floor(Math.random() * filteredAlternatives.length)];
	}

	return suggestedAction;
}

/**
 * Generate an action sequence based on a persona
 * @param {string} persona - The persona to use for action generation
 * @param {number|null} maxActions - Maximum number of actions (optional)
 * @returns {Array} - Array of actions to perform
 */
export function generatePersonaActionSequence(persona, maxActions = null) {
	const personaWeights = personas[persona];
	if (!personaWeights) {
		throw new Error(`Unknown persona: ${persona}`);
	}

	const actionTypes = Object.keys(personaWeights);
	const weights = Object.values(personaWeights);
	
	return generateWeightedRandomActionSequence(actionTypes, weights, persona, maxActions);
}

/**
 * Generate a weighted random action sequence with natural flow patterns
 * @param {Array} actionTypes - Types of actions available
 * @param {Array} weights - Weights for each action type
 * @param {string} persona - The persona being used
 * @param {number|null} maxActions - Maximum number of actions (optional)
 * @returns {Array} - Array of actions to perform
 */
export function generateWeightedRandomActionSequence(actionTypes, weights, persona, maxActions = null) {
	const sequence = [];
	const totalActions = maxActions || u.rand(50, 150); // Default session length (increased for more data)
	const actionHistory = [];

	// Ensure minimum engagement - at least 80% of actions should be clicks (doubled for better heatmap data)
	const minClicks = Math.floor(totalActions * 0.8);
	let clickCount = 0;

	// Prevent excessive consecutive same actions
	const maxConsecutive = {
		click: 3,
		scroll: 4,
		wait: 2,
		hover: 2,
		type: 2
	};

	for (let i = 0; i < totalActions; i++) {
		let selectedAction;
		let attempts = 0;
		const maxAttempts = 10;

		do {
			selectedAction = weightedRandom(actionTypes, weights);
			attempts++;
			
			// If we're running out of actions and need more clicks
			if (i >= totalActions - (minClicks - clickCount) && selectedAction !== 'click') {
				selectedAction = 'click';
			}
			
			// Check consecutive action limits
			const consecutiveCount = actionHistory.slice(-maxConsecutive[selectedAction] || 2)
				.filter(action => action === selectedAction).length;
				
			if (consecutiveCount < (maxConsecutive[selectedAction] || 2)) {
				break; // Action is acceptable
			}
			
		} while (attempts < maxAttempts);

		// Apply context-aware modifications
		const contextAwareAction = getContextAwareAction(actionHistory, selectedAction);
		
		sequence.push(contextAwareAction);
		actionHistory.push(contextAwareAction);
		
		if (contextAwareAction === 'click') {
			clickCount++;
		}

		// Keep action history manageable
		if (actionHistory.length > 10) {
			actionHistory.shift();
		}
	}

	return sequence;
}