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
	}
}

export interface MeepleParams {
	/** Target URL to simulate user behavior on */
	url?: string;
	/** Number of concurrent users to simulate (max 25) */
	users?: number;
	/** Concurrency limit for simultaneous executions (max 10) */
	concurrency?: number;
	/** Run browser in headless mode */
	headless?: boolean;
	/** Inject Mixpanel analytics tracking */
	inject?: boolean;
	/** Simulate past timestamps for analytics */
	past?: boolean;
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
}

export type SequenceAction = ClickAction | TypeAction | SelectAction;

export interface BaseAction {
	/** CSS selector for the target element */
	selector: string;
}

export interface ClickAction extends BaseAction {
	action: 'click';
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
	/** Error message if action failed */
	error?: string;
	/** Duration of action execution in milliseconds */
	duration: number;
	/** Timestamp when action was executed */
	timestamp: number;
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
}

export type LogFunction = (message: string, meepleId?: string | null) => void;

export type PersonaType =
	| 'quickBrowser'
	| 'researcher'
	| 'shopper'
	| 'explorer'
	| 'powerUser'
	| 'taskFocused'
	| 'methodical'
	| 'impulse'
	| 'reader'
	| 'skimmer'
	| 'discoverer'
	| 'comparison'
	| 'decisive'
	| 'rolePlayer'
	| 'minMaxer'
	| 'murderHobo'
	| 'ruleSlawyer'
	| 'mobileHabits';

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
	past?: boolean,
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