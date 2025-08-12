/**
 * Configuration entities and data objects for headless browser automation
 * Extracted from headless.js for better code organization
 */

// User behavior personas with action probabilities - Enhanced with modern user diversity
const basePersonas = {
	// Power users - confident, fast, goal-oriented
	powerUser: { scroll: 0.3, mouse: 0.1, click: 0.95, exploratoryClick: 0.4, wait: 0.1, hover: 0.2, form: 0.3, back: 0.1, forward: 0.1, rageClick: 0.15 },
	taskFocused: { scroll: 0.2, mouse: 0.1, click: 0.9, exploratoryClick: 0.3, wait: 0.2, hover: 0.1, form: 0.5, back: 0.2, forward: 0.1, rageClick: 0.2 },
	digitalNative: { scroll: 0.25, mouse: 0.05, click: 0.92, exploratoryClick: 0.35, wait: 0.05, hover: 0.15, form: 0.45, back: 0.1, forward: 0.05, rageClick: 0.08 },

	// Shopping/conversion oriented
	shopper: { scroll: 0.4, mouse: 0.2, click: 0.85, exploratoryClick: 0.5, wait: 0.3, hover: 0.4, form: 0.4, back: 0.3, forward: 0.1, rageClick: 0.12 },
	comparison: { scroll: 0.5, mouse: 0.3, click: 0.75, exploratoryClick: 0.4, wait: 0.4, hover: 0.5, form: 0.3, back: 0.4, forward: 0.1, rageClick: 0.25 },
	conversionOptimized: { scroll: 0.35, mouse: 0.25, click: 0.88, exploratoryClick: 0.45, wait: 0.25, hover: 0.35, form: 0.6, back: 0.2, forward: 0.05, rageClick: 0.18 },

	// Content consumption
	reader: { scroll: 0.6, mouse: 0.2, click: 0.75, exploratoryClick: 0.2, wait: 0.5, hover: 0.3, form: 0.2, back: 0.2, forward: 0.1, rageClick: 0.05 },
	skimmer: { scroll: 0.7, mouse: 0.1, click: 0.7, exploratoryClick: 0.2, wait: 0.2, hover: 0.2, form: 0.1, back: 0.3, forward: 0.1, rageClick: 0.1 },
	bingeWatcher: { scroll: 0.8, mouse: 0.15, click: 0.72, exploratoryClick: 0.25, wait: 0.4, hover: 0.25, form: 0.15, back: 0.15, forward: 0.05, rageClick: 0.08 },

	// Exploration patterns
	explorer: { scroll: 0.4, mouse: 0.3, click: 0.8, exploratoryClick: 0.7, wait: 0.3, hover: 0.4, form: 0.3, back: 0.2, forward: 0.1, rageClick: 0.15 },
	discoverer: { scroll: 0.3, mouse: 0.4, click: 0.85, exploratoryClick: 0.8, wait: 0.2, hover: 0.6, form: 0.4, back: 0.1, forward: 0.1, rageClick: 0.12 },
	curiosityDriven: { scroll: 0.45, mouse: 0.35, click: 0.82, exploratoryClick: 0.75, wait: 0.25, hover: 0.5, form: 0.35, back: 0.15, forward: 0.08, rageClick: 0.1 },

	// Device-specific patterns
	mobileHabits: { scroll: 0.8, mouse: 0.1, click: 0.75, exploratoryClick: 0.3, wait: 0.2, hover: 0.1, form: 0.3, back: 0.2, forward: 0.1, rageClick: 0.22 },
	mobileFirst: { scroll: 0.85, mouse: 0.05, click: 0.78, exploratoryClick: 0.32, wait: 0.15, hover: 0.08, form: 0.35, back: 0.25, forward: 0.12, rageClick: 0.25 },
	tabletUser: { scroll: 0.65, mouse: 0.2, click: 0.8, exploratoryClick: 0.4, wait: 0.3, hover: 0.25, form: 0.4, back: 0.2, forward: 0.1, rageClick: 0.18 },

	// Efficiency patterns
	decisive: { scroll: 0.2, mouse: 0.1, click: 0.95, exploratoryClick: 0.2, wait: 0.1, hover: 0.1, form: 0.4, back: 0.1, forward: 0.1, rageClick: 0.3 },
	minimalist: { scroll: 0.25, mouse: 0.12, click: 0.93, exploratoryClick: 0.18, wait: 0.12, hover: 0.12, form: 0.42, back: 0.08, forward: 0.08, rageClick: 0.28 },

	// Deep engagement patterns
	researcher: { scroll: 0.7, mouse: 0.4, click: 0.65, exploratoryClick: 0.5, wait: 0.6, hover: 0.5, form: 0.4, back: 0.1, forward: 0.1, rageClick: 0.05 },
	methodical: { scroll: 0.5, mouse: 0.3, click: 0.75, exploratoryClick: 0.4, wait: 0.5, hover: 0.4, form: 0.5, back: 0.2, forward: 0.1, rageClick: 0.08 },
	analytical: { scroll: 0.6, mouse: 0.45, click: 0.68, exploratoryClick: 0.42, wait: 0.55, hover: 0.48, form: 0.45, back: 0.15, forward: 0.12, rageClick: 0.06 },

	// Accessibility and inclusive patterns
	accessibilityUser: { scroll: 0.4, mouse: 0.2, click: 0.85, exploratoryClick: 0.3, wait: 0.8, hover: 0.6, form: 0.5, back: 0.25, forward: 0.15, rageClick: 0.4 },
	keyboardNavigator: { scroll: 0.3, mouse: 0.05, click: 0.9, exploratoryClick: 0.25, wait: 0.4, hover: 0.1, form: 0.6, back: 0.2, forward: 0.2, rageClick: 0.35 },

	// Age/generation patterns
	genZ: { scroll: 0.9, mouse: 0.05, click: 0.8, exploratoryClick: 0.6, wait: 0.1, hover: 0.05, form: 0.25, back: 0.1, forward: 0.05, rageClick: 0.2 },
	millennial: { scroll: 0.5, mouse: 0.2, click: 0.85, exploratoryClick: 0.4, wait: 0.3, hover: 0.25, form: 0.4, back: 0.2, forward: 0.1, rageClick: 0.15 },
	genX: { scroll: 0.4, mouse: 0.3, click: 0.8, exploratoryClick: 0.3, wait: 0.4, hover: 0.4, form: 0.5, back: 0.3, forward: 0.15, rageClick: 0.12 },
	boomer: { scroll: 0.3, mouse: 0.5, click: 0.7, exploratoryClick: 0.2, wait: 0.7, hover: 0.6, form: 0.6, back: 0.4, forward: 0.2, rageClick: 0.45 },

	// Emotional/behavioral patterns
	anxiousUser: { scroll: 0.6, mouse: 0.4, click: 0.7, exploratoryClick: 0.2, wait: 0.6, hover: 0.5, form: 0.3, back: 0.5, forward: 0.1, rageClick: 0.5 },
	confidentUser: { scroll: 0.3, mouse: 0.15, click: 0.9, exploratoryClick: 0.5, wait: 0.2, hover: 0.2, form: 0.5, back: 0.15, forward: 0.1, rageClick: 0.1 },
	cautiousUser: { scroll: 0.5, mouse: 0.35, click: 0.65, exploratoryClick: 0.15, wait: 0.8, hover: 0.7, form: 0.4, back: 0.4, forward: 0.05, rageClick: 0.08 },

	// International/cultural patterns
	international: { scroll: 0.45, mouse: 0.3, click: 0.75, exploratoryClick: 0.35, wait: 0.5, hover: 0.4, form: 0.45, back: 0.3, forward: 0.15, rageClick: 0.2 },
	rtlUser: { scroll: 0.5, mouse: 0.25, click: 0.8, exploratoryClick: 0.4, wait: 0.4, hover: 0.35, form: 0.4, back: 0.25, forward: 0.1, rageClick: 0.15 },

	// Gaming-inspired patterns (original)
	minMaxer: { scroll: 0.3, mouse: 0.7, click: 0.9, exploratoryClick: 0.6, wait: 0.2, hover: 0.3, form: 0.2, back: 0.1, forward: 0.1, rageClick: 0.7 },
	rolePlayer: { scroll: 0.6, mouse: 0.4, click: 0.75, exploratoryClick: 0.3, wait: 0.6, hover: 0.5, form: 0.3, back: 0.2, forward: 0.1, rageClick: 0.1 },
	murderHobo: { scroll: 0.1, mouse: 0.1, click: 0.99, exploratoryClick: 0.9, wait: 0.01, hover: 0.1, form: 0.1, back: 0.1, forward: 0.1, rageClick: 0.95 },
	ruleSlawyer: { scroll: 0.9, mouse: 0.6, click: 0.65, exploratoryClick: 0.3, wait: 0.7, hover: 0.6, form: 0.6, back: 0.3, forward: 0.1, rageClick: 0.05 },
};

// Add randomMouse and randomScroll to all personas with small probability (0.03 = 3%)
export const personas = {};
for (const [personaName, personaData] of Object.entries(basePersonas)) {
	personas[personaName] = {
		...personaData,
		randomMouse: 0.03,
		randomScroll: 0.03
	};
}

// Puppeteer launch arguments optimized for maximum security bypass and Mixpanel injection
export const puppeteerArgs = [
	// CRITICAL: Core security bypasses for injection compatibility
	'--disable-web-security',
	'--disable-site-isolation-trials',
	'--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process,TrustedDOMTypes,ContentSecurityPolicy,AudioServiceOutOfProcess,TranslateUI,BlinkGenPropertyTrees,SecurePaymentConfirmation,CertificateTransparencyComponentUpdater,AutofillServerCommunication',
	'--disable-blink-features=AutomationControlled',
	'--disable-client-side-phishing-detection',
	
	// CSP and Content Security bypasses
	'--allow-running-insecure-content',
	'--allow-insecure-localhost',
	'--disable-popup-blocking',
	'--ignore-certificate-errors',
	'--ignore-ssl-errors',
	'--ignore-certificate-errors-spki-list',
	'--ignore-urlfetcher-cert-requests',

	// Enhanced stealth - disable automation detection
	'--exclude-switches=enable-automation',
	'--disable-automation',
	'--disable-save-password-bubble',
	'--disable-single-click-autofill',
	'--disable-autofill-keyboard-accessory-view',
	'--disable-full-form-autofill-ios',

	// Process management for cloud environments
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--no-zygote',
	'--disable-dev-shm-usage',
	'--memory-pressure-off',
	'--max_old_space_size=4096',

	// Disable unnecessary features that could block injection
	'--disable-sync',
	'--disable-background-networking',
	'--disable-background-timer-throttling',
	'--disable-renderer-backgrounding',
	'--disable-backgrounding-occluded-windows',
	'--disable-hang-monitor',
	'--disable-prompt-on-repost',
	'--disable-domain-reliability',
	'--disable-component-updates',
	'--disable-component-extensions-with-background-pages',
	'--disable-default-apps',
	'--disable-extensions',
	'--disable-plugins',
	'--disable-plugins-discovery',

	// Performance optimizations
	'--disable-accelerated-2d-canvas',
	'--disable-accelerated-jpeg-decoding',
	'--disable-accelerated-mjpeg-decode',
	'--disable-accelerated-video-decode',
	'--disable-gpu',
	'--disable-gpu-sandbox',
	'--disable-software-rasterizer',

	// Browser behavior normalization
	'--no-first-run',
	'--no-default-browser-check',
	'--disable-translate',
	'--disable-ipc-flooding-protection',

	// Audio/Video handling (muted for headless)
	'--autoplay-policy=user-gesture-required',
	'--disable-audio-output',
	'--mute-audio',

	// Network and rendering optimizations
	'--enable-features=NetworkService,NetworkServiceLogging',
	'--force-color-profile=srgb',
	'--disable-color-correct-rendering'
];

// Relaxed Content Security Policy for automation
export const relaxedCSP = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';";

// Primary action button selectors - Enhanced for modern frameworks and design systems
export const primaryButtonSelectors = `
	button[type="submit"], 
	input[type="submit"], 
	[class*="btn-primary"], 
	[class*="button-primary"],
	[class*="cta"], 
	[class*="call-to-action"],
	[class*="buy"], 
	[class*="purchase"], 
	[class*="checkout"],
	[class*="sign-up"], 
	[class*="signup"], 
	[class*="register"],
	[class*="get-started"], 
	[class*="start"], 
	[class*="begin"],
	[class*="download"], 
	[class*="install"],
	[class*="subscribe"], 
	[class*="join"], 
	[class*="enroll"],
	[class*="book"], 
	[class*="reserve"], 
	[class*="schedule"],
	[class*="contact"], 
	[class*="demo"], 
	[class*="trial"],
	[class*="free"], 
	[class*="claim"], 
	[class*="redeem"],
	[class*="apply"], 
	[class*="submit"], 
	[class*="send"],
	[class*="upgrade"], 
	[class*="premium"], 
	[class*="pro"],
	[class*="add-to-cart"], 
	[class*="addtocart"], 
	[class*="cart"],
	[data-testid*="cta"], 
	[data-testid*="primary"], 
	[data-testid*="submit"],
	[data-cy*="cta"], 
	[data-cy*="primary"], 
	[data-cy*="submit"]
`;

// Regular button selectors - Enhanced for modern web frameworks
export const regularButtonSelectors = `
	button:not([type="submit"]):not([disabled]), 
	input[type="button"], 
	[role="button"],
	[class*="btn"]:not([class*="btn-primary"]), 
	[class*="button"]:not([class*="button-primary"]),
	[class*="btn-secondary"], 
	[class*="btn-outline"], 
	[class*="btn-ghost"],
	[class*="button-secondary"], 
	[class*="button-outline"], 
	[class*="button-ghost"],
	[onclick], 
	[data-action], 
	[data-click], 
	[data-handler],
	[data-testid*="button"], 
	[data-testid*="btn"], 
	[data-testid*="click"],
	[data-cy*="button"], 
	[data-cy*="btn"], 
	[data-cy*="click"],
	.chakra-button, 
	.ant-btn, 
	.mantine-button, 
	.mui-button,
	.v-btn, 
	.el-button, 
	.p-button, 
	.ui.button,
	[class*="bg-blue"], 
	[class*="bg-green"], 
	[class*="bg-purple"],
	[class*="hover:bg"], 
	[class*="focus:ring"], 
	[class*="cursor-pointer"]
`;

// Navigation element selectors - Enhanced for modern routing and SPA patterns
export const navigationSelectors = `
	nav a, 
	[role="navigation"] a, 
	[class*="nav"] a, 
	[class*="menu"] a,
	[class*="navbar"] a, 
	[class*="header"] a, 
	[class*="sidebar"] a,
	[class*="link"], 
	[class*="router-link"], 
	[class*="next-link"],
	a[href]:not([href="#"]):not([href^="mailto:"]):not([href^="tel:"]):not([href^="javascript:"]),
	[data-testid*="nav"], 
	[data-testid*="link"], 
	[data-testid*="menu"],
	[data-cy*="nav"], 
	[data-cy*="link"], 
	[data-cy*="menu"],
	[class*="breadcrumb"] a, 
	[class*="pagination"] a, 
	[class*="stepper"] a,
	[class*="tab"], 
	[role="tab"], 
	[class*="accordion"],
	.react-router-link, 
	.vue-router-link, 
	.svelte-link,
	[class*="hover:text"], 
	[class*="hover:underline"]
`;

// Content interaction selectors - Enhanced for modern content layouts and CMS patterns
export const contentSelectors = `
	h1, h2, h3, h4, h5, h6, 
	[class*="card"], 
	[class*="item"], 
	[class*="post"], 
	[class*="article"],
	[class*="tile"], 
	[class*="panel"], 
	[class*="widget"], 
	[class*="component"],
	[class*="product"], 
	[class*="listing"], 
	[class*="entry"], 
	[class*="row"],
	[class*="grid-item"], 
	[class*="flex-item"], 
	[class*="col"],
	[data-id], 
	[data-item], 
	[data-content], 
	[data-component],
	[data-testid*="card"], 
	[data-testid*="item"], 
	[data-testid*="content"],
	[data-cy*="card"], 
	[data-cy*="item"], 
	[data-cy*="content"],
	[itemscope], 
	[itemtype], 
	article, 
	section,
	[class*="blog"], 
	[class*="news"], 
	[class*="feed"], 
	[class*="stream"],
	[class*="thumbnail"], 
	[class*="preview"], 
	[class*="summary"],
	[class*="rounded"], 
	[class*="shadow"], 
	[class*="border"]
`;

// Form input test data - Enhanced with international and realistic data
export const formTestData = {
	// Search queries for different domains and use cases
	search: [
		// General queries
		'best products', 'how to', 'reviews', 'price', 'compare', 'tutorial', 'guide', 'tips',
		// E-commerce
		'discount', 'sale', 'free shipping', 'return policy', 'size guide', 'customer reviews',
		// B2B/SaaS
		'enterprise pricing', 'API documentation', 'integration guide', 'security features',
		'trial period', 'implementation', 'support options', 'migration tools',
		// Content/Media
		'trending now', 'latest news', 'breaking news', 'popular posts', 'recommended',
		// Tech/Development
		'getting started', 'documentation', 'examples', 'best practices', 'troubleshooting'
	],
	
	// Realistic email addresses with various domains
	email: [
		// Popular providers
		'user@gmail.com', 'test@yahoo.com', 'demo@outlook.com', 'sample@hotmail.com',
		'john.doe@gmail.com', 'jane.smith@yahoo.com', 'alex.wilson@outlook.com',
		// Business/Corporate
		'info@company.com', 'sales@business.org', 'support@startup.io', 'admin@agency.co',
		// International domains
		'user@email.de', 'test@mail.fr', 'demo@correo.es', 'sample@post.jp'
	],
	
	// Diverse names including international variants
	text: [
		// English names
		'John Doe', 'Jane Smith', 'Alex Johnson', 'Sarah Wilson', 'Michael Brown',
		'Emily Davis', 'David Miller', 'Lisa Garcia', 'Robert Martinez', 'Amanda Taylor',
		// International names
		'María González', 'Jean Dupont', 'Hans Mueller', 'Yuki Tanaka', 'Ahmed Hassan',
		'Anna Kowalski', 'Lars Andersen', 'Sofia Rossi', 'Chen Wei', 'Raj Patel',
		// Common text inputs
		'test user', 'sample text', 'hello world', 'demo content', 'placeholder text'
	],
	
	// Company/organization names
	company: [
		'Acme Corp', 'TechStart Inc', 'Global Solutions', 'Innovation Labs', 'Digital Agency',
		'Creative Studio', 'Consulting Group', 'Development Team', 'Marketing Pro', 'Design Co'
	],
	
	// Realistic but secure passwords
	password: [
		'SecurePass123!', 'MyPassword456@', 'TestUser789#', 'DemoAccount2024$',
		'UserTest2024!', 'SamplePass456@', 'AccountDemo789#', 'TestLogin2024$'
	],
	
	// Website URLs for various purposes
	url: [
		'https://example.com', 'https://test-site.com', 'https://demo-website.org',
		'https://my-portfolio.dev', 'https://company-blog.io', 'https://project-docs.net',
		'https://sample-app.co', 'https://demo-store.shop'
	],
	
	// International phone number formats
	tel: [
		// US formats
		'555-123-4567', '(555) 987-6543', '555.456.7890', '+1-555-234-5678',
		// International formats
		'+44 20 7946 0958', '+49 30 12345678', '+33 1 42 86 83 26', '+81 3 1234 5678',
		// Mobile formats
		'+1 (555) 123-4567', '+44 7700 900123', '+49 171 1234567'
	],
	
	// Numeric inputs for various contexts
	number: [
		'1', '5', '10', '25', '50', '100', '250', '500', '1000',
		'42', '99', '2024', '2025', '3.14', '0.5', '1.5', '2.0'
	],
	
	// Date inputs
	date: [
		'2024-01-15', '2024-06-30', '2024-12-25', '2025-01-01', '2025-07-04',
		'2024-03-20', '2024-09-15', '2024-11-11'
	],
	
	// Time inputs
	time: [
		'09:00', '10:30', '12:00', '14:15', '16:45', '18:30', '20:00'
	],
	
	// Address components
	address: [
		'123 Main Street', '456 Oak Avenue', '789 Pine Road', '321 Elm Drive',
		'555 Broadway', '777 First Street', '999 Park Avenue', '111 Washington Blvd'
	],
	
	city: [
		'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
		'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville'
	],
	
	state: [
		'CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'WA', 'AZ'
	],
	
	zip: [
		'10001', '90210', '60601', '33101', '94102', '02101', '30301', '48201'
	],
	
	// Special handling for select dropdowns
	select: null
};

// Action words for button text matching - Enhanced with B2B, SaaS, and industry-specific terms
export const actionWords = [
	// Core actions
	'buy', 'shop', 'get', 'start', 'try', 'demo', 'download', 'install',
	'signup', 'sign up', 'register', 'join', 'save', 'claim', 'redeem',
	'book', 'schedule', 'contact', 'call', 'learn', 'discover', 'explore',
	
	// E-commerce specific
	'add to cart', 'checkout', 'purchase', 'order', 'pay', 'subscribe',
	'add to bag', 'add to basket', 'quick buy', 'buy now', 'shop now',
	'preorder', 'reserve', 'wishlist', 'compare', 'view details',
	
	// B2B and SaaS
	'request demo', 'get started', 'free trial', 'start trial', 'try free',
	'contact sales', 'schedule demo', 'book meeting', 'request quote',
	'upgrade', 'upgrade now', 'go pro', 'get premium', 'enterprise',
	'implementation', 'onboarding', 'migration', 'integration',
	
	// Content and engagement
	'read more', 'learn more', 'view more', 'see details', 'expand',
	'play', 'watch', 'listen', 'stream', 'preview', 'sample',
	'share', 'like', 'follow', 'subscribe', 'notify me', 'alerts',
	
	// Account and profile
	'login', 'log in', 'sign in', 'create account', 'profile', 'settings',
	'dashboard', 'account', 'my account', 'preferences', 'logout',
	
	// Support and help
	'help', 'support', 'chat', 'message', 'feedback', 'report',
	'documentation', 'guide', 'tutorial', 'faq', 'resources',
	
	// Navigation and search
	'search', 'find', 'filter', 'sort', 'browse', 'categories',
	'menu', 'home', 'back', 'next', 'previous', 'continue',
	
	// Forms and submissions
	'submit', 'send', 'apply', 'create', 'update', 'edit', 'delete',
	'confirm', 'verify', 'validate', 'check', 'review', 'approve',
	
	// Urgency and marketing
	'free', 'trial', 'now', 'today', 'limited', 'offer', 'deal',
	'sale', 'discount', 'save', 'special', 'exclusive', 'bonus',
	'instant', 'immediately', 'quick', 'fast', 'easy', 'simple',
	
	// Industry-specific
	'enroll', 'apply now', 'admit', 'course', 'class', 'lesson',
	'appointment', 'consultation', 'assessment', 'evaluation',
	'donate', 'contribute', 'sponsor', 'volunteer', 'participate',
	'invest', 'trade', 'portfolio', 'market', 'finance', 'banking'
];

// Interactive element selectors for hover functionality - Enhanced for modern frameworks
export const interactiveSelectors = [
	// High-priority marketing elements
	'button[class*="cta"], button[class*="CTA"], button[class*="btn-primary"]',
	'a[class*="button"], a[class*="btn"], a[class*="cta"]',
	'[role="button"][class*="primary"], [role="button"][class*="cta"]',
	'button[type="submit"], input[type="submit"]',
	'[data-action*="buy"], [data-action*="purchase"], [data-action*="checkout"]',
	'[data-action*="signup"], [data-action*="register"], [data-action*="start"]',

	// Modern framework components
	'.chakra-button, .ant-btn, .mantine-button, .mui-button',
	'.v-btn, .el-button, .p-button, .ui.button',
	'[class*="btn-"], [class*="button-"], [class*="Button"]',
	'[data-testid*="button"], [data-cy*="button"]',

	// ARIA-enhanced interactive elements
	'[role="button"]:not([aria-hidden="true"])',
	'[role="link"]:not([aria-hidden="true"])',
	'[role="menuitem"], [role="tab"], [role="option"]',
	'[role="slider"], [role="spinbutton"], [role="switch"]',
	'[role="dialog"], [role="alertdialog"], [role="tooltip"]',
	'[tabindex="0"], [tabindex="-1"]',

	// Form elements that benefit from hover
	'input[type="text"], input[type="email"], input[type="password"]',
	'input[type="search"], input[type="url"], input[type="tel"]',
	'input[type="number"], input[type="date"], input[type="time"]',
	'textarea, select, [role="textbox"], [role="combobox"]',
	'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]',
	'input[type="range"], input[type="file"], [role="slider"]',
	'[class*="form-control"], [class*="input"], [class*="field"]',

	// Navigation and menu elements
	'nav a, [role="navigation"] a, [class*="nav"] a, [class*="menu"] a',
	'[role="menubar"] *, [role="menu"] *, [class*="dropdown"] *',
	'[class*="breadcrumb"] a, [class*="pagination"] a',
	'[class*="sidebar"] a, [class*="header"] a, [class*="footer"] a',
	'.react-router-link, .vue-router-link, .svelte-link',

	// Content cards and interactive containers
	'[class*="card"], [class*="tile"], [class*="panel"]',
	'[class*="item"]:not([class*="menu-item"]), [data-item], [data-card]',
	'[class*="product"], [class*="listing"], [class*="entry"]',
	'[class*="widget"], [class*="component"], [class*="module"]',
	'[class*="grid-item"], [class*="flex-item"], [class*="col"]',

	// Modern CSS utility classes (Tailwind, etc.)
	'[class*="hover:"], [class*="focus:"], [class*="cursor-pointer"]',
	'[class*="transition"], [class*="transform"], [class*="duration"]',
	'[class*="bg-"], [class*="border-"], [class*="rounded"]',
	'[class*="shadow"], [class*="ring"], [class*="outline"]',

	// Media and visual elements
	'img[alt]:not([alt=""]), [role="img"]',
	'video, audio, [class*="media"], [class*="player"]',
	'canvas, svg, [class*="chart"], [class*="graph"]',
	'[class*="image"], [class*="picture"], [class*="photo"]',
	'[class*="icon"], [class*="emoji"], [class*="avatar"]',

	// Interactive content elements
	'[class*="accordion"], [class*="collapse"], [class*="expand"]',
	'[class*="modal"], [class*="popup"], [class*="overlay"]',
	'[class*="tooltip"], [class*="popover"], [class*="dropdown"]',
	'[class*="slider"], [class*="carousel"], [class*="swiper"]',
	'[class*="toggle"], [class*="switch"], [class*="checkbox"]',

	// Social and sharing elements
	'[class*="social"], [class*="share"], [class*="follow"]',
	'[data-social], [data-share], [aria-label*="share"], [aria-label*="social"]',
	'[class*="twitter"], [class*="facebook"], [class*="linkedin"]',
	'[class*="instagram"], [class*="youtube"], [class*="tiktok"]',

	// Call-to-action and conversion elements
	'[class*="cta"], [class*="call-to-action"], [class*="conversion"]',
	'[data-track], [data-analytics], [data-event]',
	'[class*="signup"], [class*="subscribe"], [class*="newsletter"]',
	'[class*="download"], [class*="trial"], [class*="demo"]',

	// E-commerce specific
	'[class*="cart"], [class*="checkout"], [class*="payment"]',
	'[class*="wishlist"], [class*="favorite"], [class*="bookmark"]',
	'[class*="rating"], [class*="review"], [class*="star"]',
	'[class*="price"], [class*="discount"], [class*="sale"]',

	// Data attributes for modern testing and tracking
	'[data-testid], [data-cy], [data-qa], [data-test]',
	'[data-component], [data-module], [data-widget]',
	'[data-click], [data-hover], [data-focus], [data-action]'
];