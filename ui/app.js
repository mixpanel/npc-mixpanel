let startTime = null;
const form = document.getElementById('simulatorForm');
const loading = document.querySelector('.loading');
const success = document.querySelector('.success');
const usersSlider = document.getElementById('users');
const usersOutput = document.getElementById('usersOutput');
const url = document.getElementById('url');
const overview = document.getElementById('overview');
const overviewText = overview.textContent?.toString();
const formLine1 = document.getElementById('form-description-line1');
const formLine2 = document.getElementById('form-description-line2');
const formLine3 = document.getElementById('form-description-line3');
const possibleUrls = [
	'https://reddit.com',
	'https://youtube.com',
	'https://soundcloud.com',
	'https://tumblr.com',
	'https://bsky.app',
	'https://threads.net',
	'https://news.google.com/',
	'https://news.ycombinator.com/',
	'https://quora.com',
	'https://medium.com',
	'https://dev.to',
	'https://github.com',
	'https://stackoverflow.com',
	'https://nytimes.com',
	'https://washingtonpost.com',
	'https://bbc.com',
	'https://theverge.com',
	'https://techcrunch.com',
	'https://producthunt.com',
	'https://npr.org',
	'https://coinmarketcap.com',
	'https://cnn.com',
	'https://reuters.com',
	'https://apnews.com',
	'https://cnbc.com',
	'https://forbes.com',
	'https://bloomberg.com',
	'https://businessinsider.com',
	'https://arstechnica.com',
	'https://wired.com',
	'https://engadget.com',
	'https://zdnet.com',
	'https://slashdot.org',
	'https://huffpost.com',
	'https://vox.com',
	'https://vice.com',
	'https://polygon.com',
	'https://kotaku.com',
	'https://ign.com',
	'https://gamespot.com',
	'https://howtogeek.com',
	'https://lifewire.com',
	'https://digitaltrends.com',
	'https://tomshardware.com',
	'https://pcmag.com',
	'https://gizmodo.com',
	'https://cnet.com',
	'https://makeuseof.com',
	'https://tutorialspoint.com',
	'https://w3schools.com',
	'https://codecademy.com',
	'https://freecodecamp.org',
	'https://khanacademy.org',
	'https://nature.com',
	'https://sciencedaily.com',
	'https://livescience.com',
	'https://space.com',
	'https://nationalgeographic.com',
	'https://smithsonianmag.com',
	'https://history.com',
	'https://biography.com',
	'https://mentalfloss.com',
	'https://theatlantic.com',
	'https://economist.com',
	'https://marketwatch.com',
	'https://investopedia.com',
	'https://cryptoslate.com',
	'https://coindesk.com',
	// Social Media & Forums
	'https://reddit.com',
	'https://x.com',
	'https://facebook.com',
	'https://instagram.com',
	'https://threads.net',
	'https://linkedin.com',
	'https://pinterest.com',
	'https://tumblr.com',
	'https://bsky.app',
	'https://news.ycombinator.com/',
	'https://quora.com',
	'https://stackoverflow.com',
	'https://stackexchange.com',
	'https://weibo.com',
	'https://vk.com',

	// Video, Audio & Image Platforms
	'https://youtube.com',
	'https://vimeo.com',
	'https://twitch.tv',
	'https://tiktok.com',
	'https://soundcloud.com',
	'https://spotify.com',
	'https://bandcamp.com',
	'https://imgur.com',
	'https://flickr.com',

	// News & Media
	'https://nytimes.com',
	'https://washingtonpost.com',
	'https://wsj.com',
	'https://theguardian.com',
	'https://bbc.com',
	'https://cnn.com',
	'https://reuters.com',
	'https://apnews.com',
	'https://cnbc.com',
	'https://forbes.com',
	'https://bloomberg.com',
	'https://businessinsider.com',
	'https://huffpost.com',
	'https://vox.com',
	'https://vice.com',
	'https://npr.org',
	'https://news.google.com/',
	'https://theatlantic.com',
	'https://economist.com',
	'https://time.com',

	// Tech & Development
	'https://github.com',
	'https://gitlab.com',
	'https://bitbucket.org',
	'https://dev.to',
	'https://medium.com',
	'https://theverge.com',
	'https://techcrunch.com',
	'https://arstechnica.com',
	'https://wired.com',
	'https://engadget.com',
	'https://gizmodo.com',
	'https://cnet.com',
	'https://zdnet.com',
	'https://slashdot.org',
	'https://producthunt.com',
	'https://vercel.com',
	'https://netlify.com',
	'https://digitalocean.com',

	// E-commerce & Marketplaces
	'https://amazon.com',
	'https://ebay.com',
	'https://walmart.com',
	'https://target.com',
	'https://etsy.com',
	'https://alibaba.com',
	'https://aliexpress.com',
	'https://bestbuy.com',
	'https://homedepot.com',
	'https://wayfair.com',
	'https://craigslist.org',
	'https://shopify.com',

	// Gaming
	'https://polygon.com',
	'https://kotaku.com',
	'https://ign.com',
	'https://gamespot.com',
	'https://steampowered.com',
	'https://epicgames.com',
	'https://gog.com',

	// Education & Reference
	'https://wikipedia.org',
	'https://wiktionary.org',
	'https://w3schools.com',
	'https://freecodecamp.org',
	'https://codecademy.com',
	'https://khanacademy.org',
	'https://coursera.org',
	'https://udemy.com',
	'https://edx.org',
	'https://tutorialspoint.com',
	'https://geeksforgeeks.org',
	'https://developer.mozilla.org',

	// Finance & Crypto
	'https://marketwatch.com',
	'https://investopedia.com',
	'https://seekingalpha.com',
	'https://finance.yahoo.com',
	'https://coinmarketcap.com',
	'https://coindesk.com',
	'https://coinbase.com',
	'https://binance.com',
	'https://cryptoslate.com',

	// Travel & Hospitality
	'https://expedia.com',
	'https://booking.com',
	'https://airbnb.com',
	'https://tripadvisor.com',
	'https://kayak.com',
	'https://uber.com',
	'https://lyft.com',

	// Lifestyle & How-To
	'https://howtogeek.com',
	'https://lifewire.com',
	'https://makeuseof.com',
	'https://lifehacker.com',
	'https://mentalfloss.com',
	'https://allrecipes.com',
	'https://foodnetwork.com',
	'https://webmd.com',
	'https://mayoclinic.org',
	'https://healthline.com',

	// Science & Culture
	'https://nature.com',
	'https://sciencedaily.com',
	'https://livescience.com',
	'https://space.com',
	'https://nationalgeographic.com',
	'https://smithsonianmag.com',
	'https://history.com',
	'https://imdb.com',
	'https://rottentomatoes.com',

	// Hardware & Reviews
	'https://digitaltrends.com',
	'https://tomshardware.com',
	'https://pcmag.com',
	'https://anandtech.com'
];
url.value = possibleUrls[Math.floor(Math.random() * possibleUrls.length)];

usersSlider.addEventListener('input', (e) => {
	usersOutput.textContent = `${e.target.value} meeples`;
});

// Update token field styling based on inject checkbox
const injectCheckbox = document.getElementById('inject');
const tokenField = document.getElementById('token');
const tokenDescription = document.getElementById('form-description-line2');

function updateTokenFieldState() {
	if (injectCheckbox.checked) {
		tokenField.style.opacity = '1';
		tokenDescription.style.opacity = '1';
		tokenDescription.innerHTML = '<b>meeples need <em>project token</em></b>';
	} else {
		tokenField.style.opacity = '0.5';
		tokenDescription.style.opacity = '0.5';
		tokenDescription.innerHTML = '<b>meeples need <em>project token</em></b> <small>(optional when not injecting)</small>';
	}
}

injectCheckbox.addEventListener('change', updateTokenFieldState);
// Initialize the state
updateTokenFieldState();

// Masking toggle management
const maskingCheckbox = document.getElementById('masking');
const maskingLabel = document.getElementById('masking-label');

function updateMaskingState() {
	if (injectCheckbox.checked) {
		maskingCheckbox.disabled = false;
		document.getElementById('masking-container').style.opacity = '1';
	} else {
		maskingCheckbox.disabled = true;
		maskingCheckbox.checked = false;
		document.getElementById('masking-container').style.opacity = '0.5';
		maskingLabel.textContent = 'no masking';
	}
}

function updateMaskingLabel() {
	maskingLabel.textContent = maskingCheckbox.checked ? 'default masking' : 'no masking';
}

injectCheckbox.addEventListener('change', updateMaskingState);
maskingCheckbox.addEventListener('change', updateMaskingLabel);
// Initialize the state
updateMaskingState();

// Tab management system
const meepleTabsData = {};
let activeTabId = null;

// Terminal utility functions
function addTerminalLine(content, message, meepleId = null) {
	const timestamp = new Date().toLocaleTimeString();
	const line = document.createElement('div');
	line.className = 'terminal-line';
	line.innerHTML = `<span style="color: #666;">[${timestamp}]</span> ${message}`;

	// Check if user is already at the bottom (within 50px threshold)
	const isAtBottom = (content.scrollTop + content.clientHeight) >= (content.scrollHeight - 50);

	content.appendChild(line);

	// Only auto-scroll if user was already at the bottom
	if (isAtBottom) {
		content.scrollTop = content.scrollHeight;
	}
}

function createMeepleTab(meepleId) {
	if (meepleTabsData[meepleId]) return; // Tab already exists

	const tabContainer = document.getElementById('terminal-tabs');
	const tabHeader = document.createElement('div');
	tabHeader.className = 'terminal-tab';
	tabHeader.dataset.meepleId = meepleId;
	tabHeader.innerHTML = `<span>${meepleId}</span>`;

	// Make tab clickable
	tabHeader.addEventListener('click', () => {
		switchToTab(meepleId);
	});

	const tabContent = document.createElement('div');
	tabContent.className = 'terminal-tab-content';
	tabContent.dataset.meepleId = meepleId;

	tabContainer.appendChild(tabHeader);
	document.getElementById('terminal-content').appendChild(tabContent);

	meepleTabsData[meepleId] = {
		header: tabHeader,
		content: tabContent,
		active: false
	};

	// If this is the first tab, make it active
	if (!activeTabId) {
		switchToTab(meepleId);
	}

	updateTabNavigation();
}

function switchToTab(meepleId) {
	// Hide all tabs
	Object.values(meepleTabsData).forEach(tab => {
		tab.header.classList.remove('active');
		tab.content.classList.remove('active');
		tab.active = false;
	});

	// Show selected tab
	if (meepleTabsData[meepleId]) {
		meepleTabsData[meepleId].header.classList.add('active');
		meepleTabsData[meepleId].content.classList.add('active');
		meepleTabsData[meepleId].active = true;
		activeTabId = meepleId;
	}

	updateTabNavigation();
	scrollActiveTabIntoView();
}

function closeMeepleTab(meepleId) {
	if (!meepleTabsData[meepleId]) return;

	const tab = meepleTabsData[meepleId];
	tab.header.remove();
	tab.content.remove();
	delete meepleTabsData[meepleId];

	// If this was the active tab, switch to another
	if (activeTabId === meepleId) {
		const remainingTabs = Object.keys(meepleTabsData);
		if (remainingTabs.length > 0) {
			switchToTab(remainingTabs[0]);
		} else {
			activeTabId = null;
		}
	}

	updateTabNavigation();
}

function updateTabNavigation() {
	const leftArrow = document.getElementById('tab-nav-left');
	const rightArrow = document.getElementById('tab-nav-right');
	const tabsContainer = document.getElementById('terminal-tabs');
	const tabsCount = Object.keys(meepleTabsData).length;

	if (tabsCount <= 1) {
		leftArrow.style.display = 'none';
		rightArrow.style.display = 'none';
	} else {
		leftArrow.style.display = 'block';
		rightArrow.style.display = 'block';

		// Scroll active tab into view if it's not visible
		scrollActiveTabIntoView();
	}
}

function scrollActiveTabIntoView() {
	const tabsContainer = document.getElementById('terminal-tabs');
	const activeTab = document.querySelector('.terminal-tab.active');

	if (!activeTab || !tabsContainer) return;

	const containerRect = tabsContainer.getBoundingClientRect();
	const activeTabRect = activeTab.getBoundingClientRect();

	// Check if active tab is out of view
	if (activeTabRect.left < containerRect.left) {
		// Tab is too far left, scroll left
		tabsContainer.scrollLeft -= (containerRect.left - activeTabRect.left) + 20;
	} else if (activeTabRect.right > containerRect.right) {
		// Tab is too far right, scroll right
		tabsContainer.scrollLeft += (activeTabRect.right - containerRect.right) + 20;
	}
}

function navigateTab(direction) {
	const tabIds = Object.keys(meepleTabsData);
	const currentIndex = tabIds.indexOf(activeTabId);

	let newIndex;
	if (direction === 'left') {
		newIndex = currentIndex > 0 ? currentIndex - 1 : tabIds.length - 1;
	} else {
		newIndex = currentIndex < tabIds.length - 1 ? currentIndex + 1 : 0;
	}

	switchToTab(tabIds[newIndex]);
}

function addTerminalLineToTab(meepleId, message) {
	// If no meeple ID, use general tab
	if (!meepleId) {
		meepleId = 'general';
	}

	// Only create tab if it's the general tab or if meeple tab doesn't exist yet
	// This prevents accidental recreation of existing tabs
	if (!meepleTabsData[meepleId]) {
		// Only create new tab - never recreate existing ones
		createMeepleTab(meepleId);
	}

	// Always append to existing tab if it exists
	const tab = meepleTabsData[meepleId];
	if (tab && tab.content) {
		addTerminalLine(tab.content, message, meepleId);

		// Check if this message indicates any type of meeple completion/failure
		// Add close button for any completion state (completed, failed, timed out, etc.)
		if (message.includes('simulation complete.') || message.includes('completed!') || message.includes('timed out') || message.includes('failed:') || message.includes('completed with issues')) {
			// Add a close button to the tab header
			const tab = meepleTabsData[meepleId];
			if (tab && tab.header && meepleId !== 'general') {
				// Check if close button already exists
				if (!tab.header.querySelector('.tab-close-btn')) {
					const closeBtn = document.createElement('button');
					closeBtn.className = 'tab-close-btn';
					closeBtn.innerHTML = '×';
					closeBtn.title = 'Close this meeple tab';
					closeBtn.addEventListener('click', (e) => {
						e.stopPropagation(); // Prevent tab switching
						closeMeepleTab(meepleId);
					});
					tab.header.appendChild(closeBtn);
				}
			}
		}
	}
}

function clearTerminal(content) {
	content.innerHTML = '';
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();

	// this links to the default project where meeples are injected
	const defaultProjectHTML = `
	<a href="https://mixpanel.com/project/3769788/view/4266856/app/events"
					target="_blank"
					style="float: right; margin-left: auto; ">default project</a>
					`;



	// Validate token field only if inject is checked
	const injectCheckbox = form.querySelector('#inject');
	const tokenField = form.querySelector('#token');

	if (injectCheckbox.checked && !tokenField.value.trim()) {
		// alert('Project token is required when "Inject Mixpanel in Site" is enabled.');
		tokenField.focus();
		return;
	}

	const formData = new FormData(form);
	const data = Object.fromEntries(formData.entries());
	data.safeWord = 'let me in...';
	data.users = parseInt(data.users);
	data.concurrency = data.users;
	if (data.concurrency > 10) data.concurrency = 10;

	// Ensure checkbox values are included in the data
	data.inject = form.querySelector('#inject').checked;
	data.headless = form.querySelector('#headless').checked;
	data.past = form.querySelector('#past').checked;
	data.masking = form.querySelector('#masking').checked;

	// Show terminal with animation
	const terminal = document.getElementById('terminal');
	const terminalContent = document.getElementById('terminal-content');

	// Add session separator if there's existing content
	if (terminalContent.children.length > 0) {
		addTerminalLine(terminalContent, '');
		addTerminalLine(terminalContent, '═══════════════════════════════════════');
		addTerminalLine(terminalContent, '🔄 NEW SIMULATION SESSION');
		addTerminalLine(terminalContent, '═══════════════════════════════════════');
		addTerminalLine(terminalContent, '');
	}

	// Show terminal and hide open button
	terminal.classList.remove('hidden');
	openTerminalButton.classList.add('hidden');
	addTerminalLineToTab('general', '🔌 Connecting to server...');

	// Get user from cookie for server-side analytics (server already parsed clean email)
	const userCookie = document.cookie.split('; ').find(row => row.startsWith('user='));
	const user = userCookie ? decodeURIComponent(userCookie.split('=')[1]) : null;

	// Connect to WebSocket (same server for Cloud Run) with user info
	const socket = io({
		reconnection: true,
		auth: {
			user: user
		}
	});

	socket.on('connect', () => {
		startTime = Date.now();
		addTerminalLineToTab('general', '✅ Connected to server. Sending data...');
		socket.emit('start_job', data);
		loading.style.display = 'none';
	});

	socket.on('job_update', (data) => {
		// Handle both old string format and new object format
		let message, meepleId;
		if (typeof data === 'string') {
			message = data;
			meepleId = null;
		} else {
			message = data.message;
			meepleId = data.meepleId;
		}

		// Handle multiple lines in a single message
		const lines = message.split('\n').filter(line => line.trim());
		lines.forEach(line => {
			if (line.trim()) {
				addTerminalLineToTab(meepleId, line);
			}
		});
	});

	socket.on('job_complete', (result) => {
		const duration = ((Date.now() - startTime) / 1000).toFixed(2);
		addTerminalLineToTab('general', '');
		addTerminalLineToTab('general', `🎉 Simulation completed successfully! in ${duration} seconds`);
		addTerminalLineToTab('general', '');

		// Auto-close terminal after 3 seconds
		setTimeout(() => {
			if (!terminal.classList.contains('hidden')) {
				addTerminalLine(terminalContent, '⏱️  Closing terminal in 10 seconds...');
			}
		}, 10_000);

		//? todo: restore UI
		setTimeout(() => {
			terminal.classList.add('hidden');
			openTerminalButton.classList.remove('hidden');

			// Restore original form text
			overview.textContent = overviewText;
			formLine1.innerHTML = 'meeples want <em>URL</em>';
			formLine2.innerHTML = 'meeples need <em>project token</em>';
			formLine3.innerHTML = defaultProjectHTML;

			// Show all form inputs again
			const formInputs = form.querySelectorAll('input, button, label, output, a');
			formInputs.forEach(input => input.style.display = '');

			form.style.display = 'flex';
			loading.style.display = 'none';
		}, 5000);

		socket.disconnect();
	});

	socket.on('error', (error) => {
		addTerminalLine(terminalContent, `❌ Error: ${error}`);
		socket.disconnect();
	});

	socket.on('disconnect', () => {
		addTerminalLine(terminalContent, '🔌 Disconnected from server');
	});

	// Update form text to show configuration
	overview.innerHTML = `<div class="config-status">🎭 Meeples are meepling...</div>`;
	formLine1.innerHTML = `<div class="config-row"><span class="config-label">URL:</span> <code class="config-value">${data.url}</code></div>`;
	formLine2.innerHTML = `<div class="config-row"><span class="config-label">Token:</span> <code class="config-value">${data.token || '(not injecting)'}</code></div>`;
	formLine3.innerHTML = `<div class="config-row">
		<span class="config-label">${data.users} meeple${data.users > 1 ? 's' : ''}</span>
		<span class="config-flags">inject: ${data.inject ? '✓' : '✗'} | headless: ${data.headless ? '✓' : '✗'} | past: ${data.past ? '✓' : '✗'}${data.inject && data.masking ? ' | masking: ✓' : ''}</span>
		${data.inject && data.token === '7127e52d6d61ee30a4d7fb4555277f87' ? `<a href="https://mixpanel.com/project/3769788/view/4266856/app/events" target="_blank" class="default-project-link">→ view project</a>` : ''}
	</div>`;


	// Hide form inputs but keep the description text visible
	const formInputs = form.querySelectorAll('input, button, label, output');
	formInputs.forEach(input => input.style.display = 'none');

	// Show loading indicator as backup
	loading.style.display = 'block';
});

// Minimize terminal (close button)
const closeTerminalButton = document.getElementById('close-terminal');
const openTerminalButton = document.getElementById('open-terminal');

closeTerminalButton.addEventListener('click', () => {
	const terminal = document.getElementById('terminal');

	// Hide terminal with slide-out animation
	terminal.classList.add('hidden');
	// Show the floating open button
	openTerminalButton.classList.remove('hidden');
});

// Open/expand terminal
openTerminalButton.addEventListener('click', () => {
	const terminal = document.getElementById('terminal');

	// Hide the floating button
	openTerminalButton.classList.add('hidden');

	// Show terminal with animation
	terminal.classList.remove('hidden');
});

// Scroll-to-bottom functionality
const scrollToBottomButton = document.getElementById('scroll-to-bottom');
const terminalContent = document.getElementById('terminal-content');

scrollToBottomButton.addEventListener('click', () => {
	// Scroll the currently active tab content to bottom
	const activeTab = document.querySelector('.terminal-tab-content.active');
	if (activeTab) {
		activeTab.scrollTop = activeTab.scrollHeight;
	} else {
		// Fallback to old behavior if no active tab
		terminalContent.scrollTop = terminalContent.scrollHeight;
	}
});

// Terminal resize functionality removed - no longer needed in side-by-side layout


function qsToObj(queryString) {
	try {
		const parsedQs = new URLSearchParams(queryString);
		const params = Object.fromEntries(parsedQs);
		return params;
	}

	catch (e) {
		return {};
	}
}

// Tab navigation event handlers
document.addEventListener('keydown', (e) => {
	// Only handle arrow keys when terminal is visible
	const terminal = document.getElementById('terminal');
	if (terminal.classList.contains('hidden')) return;

	if (e.key === 'ArrowLeft') {
		e.preventDefault();
		navigateTab('left');
	} else if (e.key === 'ArrowRight') {
		e.preventDefault();
		navigateTab('right');
	}
});

// Manual tab scrolling functions
function scrollTabsLeft() {
	const tabsContainer = document.getElementById('terminal-tabs');
	if (tabsContainer) {
		tabsContainer.scrollLeft -= 100; // Scroll left by 100px
	}
}

function scrollTabsRight() {
	const tabsContainer = document.getElementById('terminal-tabs');
	if (tabsContainer) {
		tabsContainer.scrollLeft += 100; // Scroll right by 100px
	}
}

// Click handlers for tab navigation arrows
document.addEventListener('DOMContentLoaded', () => {
	const leftArrow = document.getElementById('tab-nav-left');
	const rightArrow = document.getElementById('tab-nav-right');

	if (leftArrow) {
		leftArrow.addEventListener('click', () => {
			// First try keyboard navigation, then manual scrolling
			if (Object.keys(meepleTabsData).length > 1) {
				navigateTab('left');
			} else {
				scrollTabsLeft();
			}
		});
	}

	if (rightArrow) {
		rightArrow.addEventListener('click', () => {
			// First try keyboard navigation, then manual scrolling
			if (Object.keys(meepleTabsData).length > 1) {
				navigateTab('right');
			} else {
				scrollTabsRight();
			}
		});
	}

	// Handle headless checkbox state based on current URL
	const headlessCheckbox = document.getElementById('headless');
	const headlessLabel = headlessCheckbox.closest('label');
	const isLocalhost = window.location.hostname === 'localhost' ||
		window.location.hostname === '127.0.0.1' ||
		window.location.hostname.startsWith('192.168.') ||
		window.location.hostname.startsWith('10.') ||
		window.location.hostname.includes('.local');

	if (!isLocalhost) {
		// When not on localhost, disable the checkbox and check it
		headlessCheckbox.disabled = true;
		headlessCheckbox.checked = true;

		// Add visual styling to show it's disabled
		headlessLabel.style.opacity = '0.6';
		headlessLabel.style.cursor = 'not-allowed';
		headlessLabel.title = 'Headless mode is required when running on cloud/remote servers';

		// Add disabled styling to the checkbox
		headlessCheckbox.style.cursor = 'not-allowed';
	} else {
		// On localhost, ensure it's enabled and can be toggled
		headlessCheckbox.disabled = false;
		headlessLabel.style.opacity = '1';
		headlessLabel.style.cursor = 'pointer';
		headlessLabel.title = 'Toggle headless mode (only available when running locally)';
	}
});

// analytics
const PROJECT_TOKEN = `6c3bc01ddc1f16d01e4fda11d3a4d166`;
if (window.mixpanel) {
	mixpanel.init(PROJECT_TOKEN, {
		loaded: function (mp) {
			console.log('\n\nMIXPANEL LOADED\n\n');
			const PARAMS = qsToObj(window.location.search);
			let { user = '', ...restParams } = PARAMS;
			if (!restParams) restParams = {};
			mp.register(restParams);
			try {
				const userFromCookie = decodeURIComponent(Object.fromEntries(document.cookie.split('; ').map(x => x.split('=')))['user'] || '');
				if (userFromCookie) user = userFromCookie;
				if (user) mp.identify(user);
				if (user) mp.people.set({ $name: user, $email: user });
				console.log(`\n\nMIXPANEL IDENTIFIED USER: ${user}\n\n`);
			} catch (e) {
				console.error('Error identifying user:', e);
			}

		},

		//autocapture
		autocapture: {
			pageview: 'full-url',
			click: true,
			input: true,
			scroll: true,
			submit: true,
			capture_text_content: true
		},

		//session replay
		record_sessions_percent: 100,
		record_inline_images: true,
		record_collect_fonts: true,
		record_mask_text_selector: 'nope',
		record_block_selector: 'nope',
		record_block_class: 'nope',
		record_canvas: true,
		record_heatmap_data: true,



		//normal mixpanel
		ignore_dnt: true,
		batch_flush_interval_ms: 0,
		api_host: 'https://express-proxy-lmozz6xkha-uc.a.run.app',
		api_transport: 'XHR',
		persistence: 'localStorage',
		api_payload_format: 'json'

	});
}