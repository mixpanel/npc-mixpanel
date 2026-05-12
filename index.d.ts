/**
 * TypeScript definitions for npc-mixpanel
 * Provides type safety and IntelliSense for the meeple automation system
 */

// Global type augmentations for browser context
declare global {
	// Mixpanel library types
	interface Mixpanel {
		init(token: string, config?: any, name?: string): void;
		track(event: string, properties?: any): void;
		identify(id: string): void;
		people: {
			set(properties: any): void;
			set_once(properties: any): void;
			increment(property: string, by?: number): void;
		};
		register(properties: any): void;
		reset(): void;
		headless?: {
			reset(): void;
		};
		__SV?: number;
		_i?: any[];
	}

	// Window object augmentations for Puppeteer page context
	interface Window {
		mixpanel?: Mixpanel | any[];
		MIXPANEL_WAS_INJECTED?: boolean;
		MIXPANEL_INJECTED_TIMESTAMP?: number;
		MIXPANEL_INJECTION_SUCCESS?: boolean;
		MIXPANEL_CUSTOM_LIB_URL?: string;
		trustedTypes?: {
			createPolicy(name: string, policy: any): any;
			getPolicy(name: string): any;
			getPolicyNames(): string[];
			defaultPolicy?: any;
		};
		// CSP (Content Security Policy) bypass properties
		CSP_RELAXED?: boolean;
		CSP_WAS_RELAXED?: boolean;
		CSP_RELAXED_TIMESTAMP?: number;
		CSP_EVAL_WORKING?: boolean;
		TRUSTED_TYPES_BYPASS?: boolean;
		originalEval?: typeof eval;
		// Mouse tracking properties used by interactions.js
		mouseX?: number;
		mouseY?: number;
	}

	// Global mixpanel variable (for non-window contexts)
	var mixpanel: Mixpanel | undefined;

	// Socket.IO global (loaded from CDN in browser)
	function io(opts?: any): any;
}

// Puppeteer Page type augmentations
declare module 'puppeteer' {
	interface Page {
		MIXPANEL_TOKEN?: string;
	}

	// ElementHandle augmentation for non-standard browser methods
	interface ElementHandle {
		scrollIntoViewIfNeeded?(options?: any): Promise<void>;
	}
}

// Browser DOM augmentations for form elements in page.evaluate() contexts
// These are the actual runtime types when manipulating DOM elements
declare global {
	// Extend Element to include common form element properties
	// This allows TypeScript to understand that elements in page.evaluate() have these properties
	interface Element {
		// HTMLInputElement / HTMLTextAreaElement properties
		type?: string;
		value?: string;
		placeholder?: string;
		name?: string;
		disabled?: boolean;
		readOnly?: boolean;
		checked?: boolean;

		// HTMLSelectElement properties
		options?: HTMLOptionsCollection;
		selectedIndex?: number;

		// HTMLElement offset properties (for positioning/layout)
		offsetTop?: number;
		offsetLeft?: number;
		offsetWidth?: number;
		offsetHeight?: number;

		// HTMLElement visibility properties
		hidden?: boolean;

		// CSSStyleDeclaration for style property
		style?: CSSStyleDeclaration;
	}
}

export interface MeepleParams {
	/** Target URL to simulate user behavior on */
	url?: string;
	/** Number of concurrent users to simulate (max 100, raised from 25 in 1.1.0) */
	users?: number;
	/** Concurrency limit for simultaneous executions (max 20, raised from 10 in 1.1.0) */
	concurrency?: number;
	/** Run browser in headless mode */
	headless?: boolean;
	/** Inject Mixpanel analytics tracking */
	inject?: boolean;
	/**
	 * Simulate past timestamps for analytics events.
	 * - `false` (default): no spoofing
	 * - `true`: random timestamp within last 120 hours (5 days)
	 * - `number` (1-120): random timestamp within last N hours, clamped
	 */
	past?: boolean | number;
	/** Mixpanel token override */
	token?: string;
	/** Maximum actions per user session */
	maxActions?: number | null;
	/** Enable element masking for privacy */
	masking?: boolean;
	/** Deterministic sequences specification */
	sequences?: SequencesSpec | null;
	/** Unique identifier for this simulation run */
	runId?: string;

	// ── Friction Behaviors ──

	/** Simulate poor network conditions via CDP throttling */
	networkProfile?: 'fast' | 'moderate' | 'slow3g' | 'slow4g' | 'offline';
	/** Enable Chaos Mode: randomly sabotage POST/PUT/PATCH requests + dead clicks */
	chaosMode?: boolean;
	/** Probability (0-1) that a data request will fail in chaos mode. Default: 0.15 */
	chaosFailRate?: number;
	/** Enable intentional form mistakes: meeples submit wrong data, trigger validation, then correct */
	formMistakes?: boolean;
	/** Client identifier for tracking which service triggered the job (e.g. 'powertools-ui', 'mpTweaks') */
	client_id?: string;

	// ── 1.1.0 Persona Controls ──

	/** Force every meeple to use this persona (overrides frequency-weighted selection) */
	persona?: PersonaType;
	/** Custom frequency map { personaName: number }. Overrides default per-persona frequencies. */
	personaWeights?: Partial<Record<PersonaType, number>>;
}

export interface SequencesSpec {
	[sequenceName: string]: SequenceSpec;
}

export interface SequenceSpec {
	/** Human-readable description of the sequence */
	description?: string;
	/**
	 * How strictly to follow the sequence (0-10)
	 * 0 = completely random actions
	 * 10 = strictly follow the defined sequence
	 */
	temperature?: number;
	/**
	 * Random multiplier range applied to temperature
	 * [min, max] values to introduce run-to-run variability
	 */
	'chaos-range'?: [number, number];
	/** Array of actions to perform in sequence */
	actions: SequenceAction[];
	/**
	 * Circuit breaker configuration for handling failures
	 * Controls how the sequence responds to consecutive failures
	 */
	circuitBreaker?: CircuitBreakerConfig;
	/**
	 * Enable debug mode for verbose logging
	 * Outputs detailed information about selector matching, element states, and timing
	 */
	debug?: boolean;
	/**
	 * 1.1.x: Per-sequence persona override (one of the 15 personas in PersonaType).
	 * Modulates typing speed, dwell durations, and inter-action pauses for this
	 * sequence. Falls back to the caller-provided persona if omitted.
	 */
	persona?: PersonaType;
}

export interface CircuitBreakerConfig {
	/**
	 * Maximum number of consecutive failures before stopping the sequence
	 * Default: 3
	 * Recommendation: 5+ for production use with dynamic content
	 */
	maxFailures?: number;
	/**
	 * Whether to reset the failure counter after a successful action
	 * Default: true
	 */
	resetOnSuccess?: boolean;
	/**
	 * Circuit breaker behavior mode
	 * - 'terminate': Stop the entire sequence after maxFailures (default)
	 * - 'skip': Skip failed actions and continue with remaining actions
	 */
	mode?: 'terminate' | 'skip';
}

export type SequenceAction =
	| ClickAction
	| TypeAction
	| SelectAction
	| FillOutFormAction
	| NavigateAction
	| ScrollAction
	| HoverAction
	| WaitAction;

export interface BaseAction {
	/** CSS selector for the target element */
	selector: string;
	/**
	 * If true, skip this action if the element is disabled, inactive, or not found
	 * Does NOT count as a failure for circuit breaker purposes
	 * Useful for optional UI elements that may not always be present
	 */
	requireActive?: boolean;
	/**
	 * If true, indicates this action triggers page navigation
	 * The system will wait for the new page to load before continuing
	 */
	expectsNavigation?: boolean;
	/**
	 * Maximum time to wait for navigation to complete (milliseconds)
	 * Only applies when expectsNavigation is true
	 * Default: 5000
	 */
	navigationTimeout?: number;
}

export interface ClickAction extends BaseAction {
	action: 'click';
	/**
	 * 1.1.x: when the CSS selector fails, the resilience layer searches visible
	 * button/link text for this string and clicks the first match. Highly recommended
	 * for nth-child selectors that may shift when the DOM changes.
	 */
	textFallback?: string;
}

export interface TypeAction extends BaseAction {
	action: 'type';
	/** Text to type into the element */
	text: string;
}

export interface SelectAction extends BaseAction {
	action: 'select';
	/** Value to select from dropdown */
	value: string;
}

export interface FillOutFormAction extends BaseAction {
	action: 'fillOutForm';
	/** Number of clicks per radio group (for radiogroup elements) */
	clicksPerGroup?: number;
}

/** 1.1.x: same-domain link wandering (real hrefs + SPA patterns). No selector required. */
export interface NavigateAction {
	action: 'navigate';
}

/** 1.1.x: scroll the page (no selector) or scroll an element into view (with selector). */
export interface ScrollAction {
	action: 'scroll';
	/** Optional — scrolls this element into view if provided */
	selector?: string;
	/** For page-level scroll: direction */
	direction?: 'up' | 'down';
	/** For page-level scroll: 'page' (full viewport), 'half', or pixel count */
	amount?: 'page' | 'half' | number;
}

/** 1.1.x: hover with reading-trace dwell. Selector required. */
export interface HoverAction extends BaseAction {
	action: 'hover';
}

/** 1.1.x: explicit pause. Specify EITHER tier OR ms (mutually exclusive). */
export interface WaitAction {
	action: 'wait';
	/** micro=0.3-1.5s, read=2-8s, think=5-15s. Mutually exclusive with ms. */
	tier?: 'micro' | 'read' | 'think';
	/** Explicit pause in milliseconds, clamped to [50, 30000]. Mutually exclusive with tier. */
	ms?: number;
}

export interface SequenceActionResult {
	/** Type of action performed */
	action: string;
	/** CSS selector used */
	selector: string;
	/** Text typed (for type actions) */
	text?: string;
	/** Value selected (for select actions) */
	value?: string;
	/** Whether the action succeeded */
	success: boolean;
	/** Whether the action was skipped due to requireActive flag */
	skipped?: boolean;
	/** Error message if action failed */
	error?: string;
	/** Specific reason for failure (e.g., 'selector_not_found', 'element_not_visible', 'timeout') */
	reason?: string;
	/** Duration of action execution in milliseconds */
	duration: number;
	/** Timestamp when action was executed */
	timestamp: number;
	/** Current page URL when action was attempted */
	page_url?: string;
}

export interface ValidationResult {
	/** Whether the validation passed */
	valid: boolean;
	/** Array of validation error messages */
	errors: string[];
}

export interface SimulationResult {
	/** Array of actions performed by the meeple */
	actions: SequenceActionResult[];
	/** Duration of the session in seconds */
	duration: number;
	/** Persona used for random actions */
	persona: string;
	/** Name of sequence used (if any) */
	sequence?: string | null;
	/** Whether the simulation completed successfully */
	success: boolean;
	/** Error message if simulation failed */
	error?: string;
	/** Whether the simulation timed out */
	timedOut?: boolean;
	/** Whether the simulation crashed */
	crashed?: boolean;
	/** Whether the circuit breaker was triggered during sequence execution */
	circuit_breaker_triggered?: boolean;
	/** Array of failed actions with detailed error information */
	failed_actions?: SequenceActionResult[];
}

export interface HotZone {
	/** X coordinate of the hot zone */
	x: number;
	/** Y coordinate of the hot zone */
	y: number;
	/** Width of the hot zone */
	width: number;
	/** Height of the hot zone */
	height: number;
	/** Priority score (higher = more important) */
	priority: number;
	/** HTML tag name */
	tag: string;
	/** Text content of the element */
	text: string;
	/** CSS selector for the element */
	selector?: string;
}

export interface MeepleLocation {
	/** Latitude coordinate */
	lat: number;
	/** Longitude coordinate */
	lon: number;
}

export interface MeepleOptions {
	/** Enable element masking for privacy */
	masking?: boolean;
	/** Geographic location for the meeple */
	location?: MeepleLocation;
	/** Sequence specification for deterministic behavior */
	sequence?: SequenceSpec;
	/** Name of the assigned sequence */
	sequenceName?: string;

	// ── Friction Behaviors ──

	/** Network throttling profile */
	networkProfile?: 'fast' | 'moderate' | 'slow3g' | 'slow4g' | 'offline';
	/** Enable Chaos Mode */
	chaosMode?: boolean;
	/** Chaos mode fail rate (0-1) */
	chaosFailRate?: number;
	/** Enable intentional form mistakes */
	formMistakes?: boolean;
}

export type LogFunction = (message: string, meepleId?: string | null) => void;

/** Consolidated 1.1.0 persona set. See meeple/entities.js for per-persona config. */
export type PersonaType =
	| 'speedRunner'
	| 'browser'
	| 'researcher'
	| 'shopper'
	| 'taskFocused'
	| 'explorer'
	| 'skimmer'
	| 'firstTimer'
	| 'mobileUser'
	| 'frustrated'
	| 'formFiller'
	| 'returnVisitor'
	| 'contentReader'
	| 'impulsive'
	| 'methodical';

export interface ActionSequenceItem {
	action: string;
	weight?: number;
	persona?: PersonaType;
}

// Sequence execution functions
export declare function executeSequence(
	page: any, // Puppeteer Page type
	sequenceSpec: SequenceSpec,
	hotZones: HotZone[],
	persona: PersonaType,
	usersHandle: string,
	opts: MeepleOptions,
	log: LogFunction
): Promise<SequenceActionResult[]>;

export declare function validateSequence(sequenceSpec: SequenceSpec): ValidationResult;
export declare function validateSequences(sequences: SequencesSpec): ValidationResult;

// Main simulation function
export declare function main(params: MeepleParams, logFunction?: LogFunction): Promise<SimulationResult[]>;

// Individual user simulation
export declare function simulateUser(
	url: string,
	headless?: boolean,
	inject?: boolean,
	past?: boolean | number,
	maxActions?: number | null,
	usersHandle?: string | null,
	opts?: MeepleOptions,
	logFunction?: LogFunction
): Promise<SimulationResult>;

// API Response types
export interface SimulateResponse {
	/** Array of simulation results for each meeple */
	results?: SimulationResult[];
	/** Error message if simulation failed */
	error?: string;
	/** Detailed error information for validation failures */
	details?: string[];
}

export interface ApiError {
	/** High-level error message */
	error: string;
	/** Detailed error information */
	details?: string[];
}
