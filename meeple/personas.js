import u from 'ak-tools';
import { personas, personaNames } from './entities.js';
import { weightedRandom } from './utils.js';

/**
 * Select a persona — weighted by `frequency` from the persona config.
 * Supports forced override (API caller wants a specific persona) or custom weights.
 *
 * @param {Function} log - Logging function
 * @param {Object} [options]
 * @param {string|null} [options.override] - Force a specific persona (validated against personaNames)
 * @param {Object<string, number>|null} [options.weights] - Custom freq map { personaName: weight }
 * @returns {string} Selected persona key
 */
export function selectPersona(log = console.log, options = {}) {
	const { override = null, weights = null } = options;

	if (override) {
		if (!personas[override]) {
			throw new Error(`Unknown persona: ${override}. Valid personas: ${personaNames.join(', ')}`);
		}
		log(`🎭 Persona forced via override: ${override}`);
		return override;
	}

	const weightMap = weights || Object.fromEntries(personaNames.map(name => [name, personas[name].frequency || 0.01]));

	const names = Object.keys(weightMap).filter(name => personas[name]);
	const freqs = names.map(name => weightMap[name]);

	if (names.length === 0) {
		throw new Error('No valid personas available for selection');
	}

	// Defensive: caller passed weights that all sum to zero (e.g. UI all-sliders-at-zero).
	// Fall back to default per-persona frequencies rather than throwing.
	const sum = freqs.reduce((a, b) => a + (b > 0 ? b : 0), 0);
	if (sum <= 0) {
		log(`⚠️ All persona weights are zero — falling back to default frequencies`);
		const fallbackNames = personaNames;
		const fallbackFreqs = personaNames.map(n => personas[n].frequency || 0.01);
		const selected = weightedRandom(fallbackNames, fallbackFreqs);
		log(`🎭 Selected persona: ${selected}`);
		return selected;
	}

	const selected = weightedRandom(names, freqs);
	log(`🎭 Selected persona: ${selected}`);
	return selected;
}

/**
 * Get context-aware action based on action history to create realistic user behavior
 * @param {Array} actionHistory - Recent actions performed by the user
 * @param {string} suggestedAction - The action that was randomly selected
 * @param {Function} _log - Logging function (reserved for future use)
 * @returns {string} - Final action to perform (may be modified for realism)
 */
export function getContextAwareAction(actionHistory, suggestedAction, _log = console.log) {
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
 * Get the action-weights map for a persona.
 * Always returns a fresh shallow copy so callers can modify (e.g. apply phase modifiers).
 *
 * @param {string} persona
 * @returns {Object<string, number>}
 */
export function getPersonaActionWeights(persona) {
	const config = personas[persona];
	if (!config) throw new Error(`Unknown persona: ${persona}`);
	return { ...config.actionWeights };
}

/**
 * Generate an action sequence based on a persona.
 * NOTE: As of 1.1.0, sessions are duration-driven (see headless.js); this is retained for
 * legacy callers and as a fallback when targetDuration cannot be computed.
 *
 * @param {string} persona - The persona to use for action generation
 * @param {number|null} maxActions - Maximum number of actions (optional)
 * @returns {Array} - Array of actions to perform
 */
export function generatePersonaActionSequence(persona, maxActions = null) {
	const config = personas[persona];
	if (!config) throw new Error(`Unknown persona: ${persona}`);

	const actionWeights = config.actionWeights;
	const actionTypes = Object.keys(actionWeights);
	const weights = Object.values(actionWeights);

	return generateWeightedRandomActionSequence(actionTypes, weights, persona, maxActions);
}

/**
 * Generate a weighted random action sequence with natural flow patterns.
 *
 * 1.1.0 changes:
 *   - Removed 80% click floor (was forcing every persona toward clicks).
 *   - Added consecutive non-click safety valve (per-persona maxConsecutiveNonClicks).
 *
 * @param {Array} actionTypes - Types of actions available
 * @param {Array} weights - Weights for each action type
 * @param {string} persona - The persona being used (for safety-valve config)
 * @param {number|null} maxActions - Maximum number of actions (optional)
 * @returns {Array} - Array of actions to perform
 */
export function generateWeightedRandomActionSequence(actionTypes, weights, persona, maxActions = null) {
	const sequence = [];
	const totalActions = maxActions || u.rand(50, 150);
	const actionHistory = [];

	const personaConfig = personas[persona] || {};
	const maxConsecutiveNonClicks = personaConfig.maxConsecutiveNonClicks || 5;

	// Prevent excessive consecutive same actions
	const maxConsecutive = {
		click: 3,
		scroll: 4,
		wait: 2,
		hover: 2,
		type: 2
	};

	let consecutiveNonClicks = 0;

	for (let i = 0; i < totalActions; i++) {
		let selectedAction;
		let attempts = 0;
		const maxAttempts = 10;

		do {
			selectedAction = weightedRandom(actionTypes, weights);
			attempts++;

			// Safety valve: if too many non-click actions in a row, force a click
			if (consecutiveNonClicks >= maxConsecutiveNonClicks && actionTypes.includes('click')) {
				selectedAction = 'click';
				break;
			}

			// Check consecutive same-action limits
			const limit = maxConsecutive[selectedAction] || 2;
			const consecutiveCount = actionHistory.slice(-limit).filter(action => action === selectedAction).length;

			if (consecutiveCount < limit) break;
		} while (attempts < maxAttempts);

		const contextAwareAction = getContextAwareAction(actionHistory, selectedAction);

		sequence.push(contextAwareAction);
		actionHistory.push(contextAwareAction);

		if (contextAwareAction === 'click') {
			consecutiveNonClicks = 0;
		} else {
			consecutiveNonClicks++;
		}

		// Keep action history manageable
		if (actionHistory.length > 10) {
			actionHistory.shift();
		}
	}

	return sequence;
}

/**
 * Pick the next action given current weights and recent history.
 * Used by the duration-driven session loop in headless.js — selects one action at a time
 * so phase modifiers can be re-applied between actions.
 *
 * @param {Object<string, number>} actionWeights - current weight map (post phase modifiers)
 * @param {string} persona - persona key (for safety-valve config)
 * @param {Array} actionHistory - recent action names (most recent last)
 * @param {number} consecutiveNonClicks - current run of non-click actions
 * @returns {string} chosen action
 */
export function pickNextAction(actionWeights, persona, actionHistory, consecutiveNonClicks) {
	const personaConfig = personas[persona] || {};
	const maxConsecutiveNonClicks = personaConfig.maxConsecutiveNonClicks || 5;
	const actionTypes = Object.keys(actionWeights);
	const weights = Object.values(actionWeights);

	if (consecutiveNonClicks >= maxConsecutiveNonClicks && actionTypes.includes('click')) {
		return 'click';
	}

	const maxConsecutive = { click: 3, scroll: 4, wait: 2, hover: 2 };
	let selected;
	const maxAttempts = 10;
	for (let i = 0; i < maxAttempts; i++) {
		selected = weightedRandom(actionTypes, weights);
		const limit = maxConsecutive[selected] || 3;
		const consec = actionHistory.slice(-limit).filter(a => a === selected).length;
		if (consec < limit) break;
	}
	return getContextAwareAction(actionHistory, selected);
}
