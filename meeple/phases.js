/**
 * Session phase system — divides each meeple session into 4 phases with weight modifiers.
 *
 * Phases give sessions a temporal rhythm: arrive, explore, engage, wind down.
 * Each phase modulates the persona's base action weights so behavior shifts naturally
 * over the course of a session instead of being a flat random sequence.
 */

/** Default phase boundary centers (cumulative end-ratios of the session). */
const PHASE_CENTERS = {
	arrival: 0.125, // 12.5% of session
	exploration: 0.425, // +30% → 42.5%
	engagement: 0.775 // +35% → 77.5%
	// windDown runs to 1.0
};

/** Default per-phase weight modifiers. Multiplied against persona action weights. */
const DEFAULT_PHASE_MODIFIERS = {
	arrival: {
		scroll: 1.5,
		mouse: 1.5,
		wait: 2.0,
		click: 0.3,
		navigate: 0.2,
		form: 0.2,
		hover: 1.0
	},
	exploration: {
		navigate: 2.0,
		click: 1.0,
		scroll: 1.2,
		hover: 1.0,
		exploratoryClick: 1.5
	},
	engagement: {
		click: 1.5,
		form: 2.0,
		hover: 1.5,
		navigate: 0.5,
		scroll: 0.8
	},
	windDown: {
		wait: 2.0,
		scroll: 0.8,
		click: 0.5,
		back: 1.5,
		navigate: 0.3,
		hover: 0.7
	}
};

/**
 * Generate a randomized phase schedule for one session.
 * Each boundary jitters ±5% from its center so no two sessions feel identical.
 *
 * @returns {Array<{name: string, endRatio: number}>} Sorted phase schedule
 */
export function generatePhaseSchedule() {
	const jitter = () => (Math.random() - 0.5) * 0.1; // ±5%

	const arrivalEnd = clamp(PHASE_CENTERS.arrival + jitter(), 0.05, 0.2);
	const explorationEnd = clamp(PHASE_CENTERS.exploration + jitter(), arrivalEnd + 0.1, 0.6);
	const engagementEnd = clamp(PHASE_CENTERS.engagement + jitter(), explorationEnd + 0.1, 0.92);

	return [
		{ name: 'arrival', endRatio: arrivalEnd },
		{ name: 'exploration', endRatio: explorationEnd },
		{ name: 'engagement', endRatio: engagementEnd },
		{ name: 'windDown', endRatio: 1.0 }
	];
}

/**
 * Get the current phase name for a session progress ratio (0-1).
 * @param {number} progress - elapsedTime / targetDuration, in [0, 1]
 * @param {Array<{name: string, endRatio: number}>} schedule
 * @returns {string} phase name
 */
export function getPhaseForProgress(progress, schedule) {
	for (const phase of schedule) {
		if (progress < phase.endRatio) return phase.name;
	}
	return schedule[schedule.length - 1].name;
}

/**
 * Apply phase modifiers to a base action weight map.
 * Persona-specific modifiers (if present) override defaults.
 *
 * @param {Object<string, number>} baseWeights - persona action weights
 * @param {string} phase - phase name (arrival/exploration/engagement/windDown)
 * @param {Object<string, Object<string, number>>} [personaPhaseModifiers] - persona override
 * @returns {Object<string, number>} new weight map
 */
export function applyPhaseModifiers(baseWeights, phase, personaPhaseModifiers = null) {
	const modifiers = (personaPhaseModifiers && personaPhaseModifiers[phase]) || DEFAULT_PHASE_MODIFIERS[phase] || {};
	/** @type {Object<string, number>} */
	const result = {};
	for (const [action, weight] of Object.entries(baseWeights)) {
		const mod = modifiers[action] !== undefined ? modifiers[action] : 1.0;
		result[action] = weight * mod;
	}
	return result;
}

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

/** @type {string[]} */
export const PHASE_NAMES = ['arrival', 'exploration', 'engagement', 'windDown'];
