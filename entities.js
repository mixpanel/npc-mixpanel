/**
 * Configuration entities and data objects for headless browser automation
 * Extracted from headless.js for better code organization
 */

// User behavior personas with action probabilities
export const personas = {
	// Power users - confident, fast, goal-oriented
	powerUser: { scroll: 0.3, mouse: 0.1, click: 0.95, exploratoryClick: 0.4, wait: 0.1, hover: 0.2, form: 0.3, back: 0.1, forward: 0.1 },
	taskFocused: { scroll: 0.2, mouse: 0.1, click: 0.9, exploratoryClick: 0.3, wait: 0.2, hover: 0.1, form: 0.5, back: 0.2, forward: 0.1 },

	// Shopping/conversion oriented
	shopper: { scroll: 0.4, mouse: 0.2, click: 0.85, exploratoryClick: 0.5, wait: 0.3, hover: 0.4, form: 0.4, back: 0.3, forward: 0.1 },
	comparison: { scroll: 0.5, mouse: 0.3, click: 0.75, exploratoryClick: 0.4, wait: 0.4, hover: 0.5, form: 0.3, back: 0.4, forward: 0.1 },

	// Content consumption
	reader: { scroll: 0.6, mouse: 0.2, click: 0.75, exploratoryClick: 0.2, wait: 0.5, hover: 0.3, form: 0.2, back: 0.2, forward: 0.1 },
	skimmer: { scroll: 0.7, mouse: 0.1, click: 0.7, exploratoryClick: 0.2, wait: 0.2, hover: 0.2, form: 0.1, back: 0.3, forward: 0.1 },

	// Exploration patterns
	explorer: { scroll: 0.4, mouse: 0.3, click: 0.8, exploratoryClick: 0.7, wait: 0.3, hover: 0.4, form: 0.3, back: 0.2, forward: 0.1 },
	discoverer: { scroll: 0.3, mouse: 0.4, click: 0.85, exploratoryClick: 0.8, wait: 0.2, hover: 0.6, form: 0.4, back: 0.1, forward: 0.1 },

	// Mobile-like behavior (even on desktop)
	mobileHabits: { scroll: 0.8, mouse: 0.1, click: 0.75, exploratoryClick: 0.3, wait: 0.2, hover: 0.1, form: 0.3, back: 0.2, forward: 0.1 },

	// Efficient users
	decisive: { scroll: 0.2, mouse: 0.1, click: 0.95, exploratoryClick: 0.2, wait: 0.1, hover: 0.1, form: 0.4, back: 0.1, forward: 0.1 },

	// Deep engagement patterns
	researcher: { scroll: 0.7, mouse: 0.4, click: 0.65, exploratoryClick: 0.5, wait: 0.6, hover: 0.5, form: 0.4, back: 0.1, forward: 0.1 },
	methodical: { scroll: 0.5, mouse: 0.3, click: 0.75, exploratoryClick: 0.4, wait: 0.5, hover: 0.4, form: 0.5, back: 0.2, forward: 0.1 },

	minMaxer: { scroll: 0.3, mouse: 0.7, click: 0.9, exploratoryClick: 0.6, wait: 0.2, hover: 0.3, form: 0.2, back: 0.1, forward: 0.1 }, // Optimize every action
	rolePlayer: { scroll: 0.6, mouse: 0.4, click: 0.75, exploratoryClick: 0.3, wait: 0.6, hover: 0.5, form: 0.3, back: 0.2, forward: 0.1 }, // Immersive experience
	murderHobo: { scroll: 0.1, mouse: 0.1, click: 0.99, exploratoryClick: 0.9, wait: 0.01, hover: 0.1, form: 0.1, back: 0.1, forward: 0.1 }, // Click all the things!
	ruleSlawyer: { scroll: 0.9, mouse: 0.6, click: 0.65, exploratoryClick: 0.3, wait: 0.7, hover: 0.6, form: 0.6, back: 0.3, forward: 0.1 }, // Read everything twice
};

// Puppeteer launch arguments for browser configuration
export const puppeteerArgs = [
	'--disable-web-security',
	'--disable-features=VizDisplayCompositor',
	'--disable-features=IsolateOrigins,site-per-process,TrustedDOMTypes',
	'--disable-site-isolation-trials',
	'--disable-blink-features=AutomationControlled',
	'--disable-client-side-phishing-detection',
	'--disable-sync',
	'--disable-background-networking',
	'--disable-background-timer-throttling',
	'--disable-renderer-backgrounding',
	'--disable-backgrounding-occluded-windows',
	'--disable-ipc-flooding-protection',
	'--disable-hang-monitor',
	'--disable-prompt-on-repost',
	'--disable-domain-reliability',
	'--disable-component-extensions-with-background-pages',
	'--disable-default-apps',
	'--disable-extensions',
	'--disable-popup-blocking',
	'--allow-running-insecure-content',
	'--allow-insecure-localhost',
	'--ignore-certificate-errors',
	'--ignore-ssl-errors',
	'--ignore-certificate-errors-spki-list',
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--disable-dev-shm-usage',
	'--disable-accelerated-2d-canvas',
	'--no-first-run',
	'--no-zygote',
	'--disable-gpu'
];

// Relaxed Content Security Policy for automation
export const relaxedCSP = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';";

// Primary action button selectors (highest priority)
export const primaryButtonSelectors = `
	button[type="submit"], 
	input[type="submit"], 
	[class*="btn-primary"], 
	[class*="button-primary"],
	[class*="cta"], 
	[class*="call-to-action"],
	[class*="buy"], 
	[class*="purchase"],
	[class*="sign-up"], 
	[class*="signup"],
	[class*="get-started"], 
	[class*="start"],
	[class*="download"]
`;

// Regular button selectors (medium priority)
export const regularButtonSelectors = `
	button:not([type="submit"]):not([disabled]), 
	input[type="button"], 
	[role="button"],
	[class*="btn"]:not([class*="btn-primary"]), 
	[class*="button"]:not([class*="button-primary"]),
	[onclick], 
	[data-action], 
	[data-click]
`;

// Navigation element selectors (medium priority)
export const navigationSelectors = `
	nav a, 
	[role="navigation"] a, 
	[class*="nav"] a, 
	[class*="menu"] a,
	[class*="link"], 
	a[href]:not([href="#"]):not([href^="mailto:"]):not([href^="tel:"])
`;

// Content interaction selectors (lower priority)
export const contentSelectors = `
	h1, h2, h3, h4, h5, h6, 
	[class*="card"], 
	[class*="item"], 
	[class*="post"], 
	[class*="article"],
	[data-id], 
	[data-item], 
	[data-content]
`;

// Form input test data
export const formTestData = {
	search: ['best products', 'how to', 'reviews', 'price', 'compare', 'tutorial', 'guide', 'tips'],
	email: ['user@example.com', 'test@gmail.com', 'hello@test.com', 'demo@website.com'],
	text: ['John Doe', 'test user', 'sample text', 'hello world'],
	password: ['password123', 'secret456', 'test1234'],
	url: ['https://example.com', 'https://test.com', 'https://sample.org'],
	tel: ['555-123-4567', '(555) 987-6543', '555.456.7890'],
	number: ['42', '100', '2024', '3.14'],
	select: null // Will be handled differently
};

// Action words for button text matching
export const actionWords = [
	'buy', 'shop', 'get', 'start', 'try', 'demo', 'download',
	'signup', 'sign up', 'register', 'join', 'save', 'claim',
	'book', 'schedule', 'contact', 'call', 'learn', 'discover',
	'free', 'trial', 'now', 'today', 'limited', 'offer'
];

// Interactive element selectors for hover functionality
export const interactiveSelectors = [
	// High-priority marketing elements
	'button[class*="cta"], button[class*="CTA"], button[class*="btn-primary"]',
	'a[class*="button"], a[class*="btn"], a[class*="cta"]',
	'[role="button"][class*="primary"], [role="button"][class*="cta"]',
	'button[type="submit"], input[type="submit"]',
	'[data-action*="buy"], [data-action*="purchase"], [data-action*="checkout"]',
	'[data-action*="signup"], [data-action*="register"], [data-action*="start"]',

	// ARIA-enhanced interactive elements
	'[role="button"]:not([aria-hidden="true"])',
	'[role="link"]:not([aria-hidden="true"])',
	'[role="menuitem"], [role="tab"], [role="option"]',
	'[role="slider"], [role="spinbutton"], [role="switch"]',
	'[tabindex="0"], [tabindex="-1"]',

	// Form elements that benefit from hover
	'input[type="text"], input[type="email"], input[type="password"]',
	'textarea, select, [role="textbox"], [role="combobox"]',
	'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]',
	'input[type="range"], input[type="file"], [role="slider"]',

	// Navigation and menu elements
	'nav a, [role="navigation"] a, [class*="nav"] a, [class*="menu"] a',
	'[role="menubar"] *, [role="menu"] *, [class*="dropdown"] *',
	'[class*="breadcrumb"] a, [class*="pagination"] a',

	// Content cards and interactive containers
	'[class*="card"], [class*="tile"], [class*="panel"]',
	'[class*="item"]:not([class*="menu-item"]), [data-item], [data-card]',
	'[class*="product"], [class*="listing"], [class*="entry"]',

	// Media and visual elements
	'img[alt]:not([alt=""]), [role="img"]',
	'video, audio, [class*="media"], [class*="player"]',
	'canvas, svg, [class*="chart"], [class*="graph"]',

	// Social and sharing elements
	'[class*="social"], [class*="share"], [class*="follow"]',
	'[data-social], [data-share], [aria-label*="share"], [aria-label*="social"]',

	// Call-to-action and conversion elements
	'[class*="cta"], [class*="call-to-action"], [class*="conversion"]',
	'[data-track], [data-analytics], [data-event]',
	'[class*="signup"], [class*="subscribe"], [class*="newsletter"]'
];