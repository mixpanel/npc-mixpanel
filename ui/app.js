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
const possibleUrls = [
	"https://reddit.com",
	"https://youtube.com",
	"https://soundcloud.com",
	"https://tumblr.com",
	"https://bsky.app",
	"https://threads.net",
	"https://news.google.com/",
	"https://news.ycombinator.com/",
	"https://quora.com",
	"https://medium.com",
	"https://dev.to",
	"https://github.com",
	"https://stackoverflow.com",
	"https://nytimes.com",
	"https://washingtonpost.com",
	"https://bbc.com",
	"https://theverge.com",
	"https://techcrunch.com",
	"https://producthunt.com",
	"https://npr.org",
	"https://coinmarketcap.com",
	"https://cnn.com",
	"https://reuters.com",
	"https://apnews.com",
	"https://cnbc.com",
	"https://forbes.com",
	"https://bloomberg.com",
	"https://businessinsider.com",
	"https://arstechnica.com",
	"https://wired.com",
	"https://engadget.com",
	"https://zdnet.com",
	"https://slashdot.org",
	"https://huffpost.com",
	"https://vox.com",
	"https://vice.com",
	"https://polygon.com",
	"https://kotaku.com",
	"https://ign.com",
	"https://gamespot.com",
	"https://howtogeek.com",
	"https://lifewire.com",
	"https://digitaltrends.com",
	"https://tomshardware.com",
	"https://pcmag.com",
	"https://gizmodo.com",
	"https://cnet.com",
	"https://makeuseof.com",
	"https://tutorialspoint.com",
	"https://w3schools.com",
	"https://codecademy.com",
	"https://freecodecamp.org",
	"https://khanacademy.org",
	"https://nature.com",
	"https://sciencedaily.com",
	"https://livescience.com",
	"https://space.com",
	"https://nationalgeographic.com",
	"https://smithsonianmag.com",
	"https://history.com",
	"https://biography.com",
	"https://mentalfloss.com",
	"https://theatlantic.com",
	"https://economist.com",
	"https://marketwatch.com",
	"https://investopedia.com",
	"https://cryptoslate.com",
	"https://coindesk.com"
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

// Terminal utility functions
function addTerminalLine(content, message) {
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
		// Hide scroll-to-bottom button if it was showing
		const scrollButton = document.getElementById('scroll-to-bottom');
		if (scrollButton) scrollButton.classList.add('hidden');
	} else {
		// Show scroll-to-bottom button if user is scrolled up
		const scrollButton = document.getElementById('scroll-to-bottom');
		if (scrollButton) scrollButton.classList.remove('hidden');
	}
}

function clearTerminal(content) {
	content.innerHTML = '';
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	
	// Validate token field only if inject is checked
	const injectCheckbox = form.querySelector('#inject');
	const tokenField = form.querySelector('#token');
	
	if (injectCheckbox.checked && !tokenField.value.trim()) {
		alert('Project token is required when "Inject Mixpanel in Site" is enabled.');
		tokenField.focus();
		return;
	}
	
	const formData = new FormData(form);
	const data = Object.fromEntries(formData.entries());
	data.safeWord = "let me in...";
	data.users = parseInt(data.users);
	data.concurrency = data.users;
	if (data.concurrency > 10) data.concurrency = 10;

	// Ensure checkbox values are included in the data
	data.inject = form.querySelector('#inject').checked;
	data.headless = form.querySelector('#headless').checked;
	data.past = form.querySelector('#past').checked;

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
	addTerminalLine(terminalContent, '🔌 Connecting to server...');

	// Connect to WebSocket (same server for Cloud Run)
	const socket = io({ reconnection: false });

	socket.on('connect', () => {
		startTime = Date.now();
		addTerminalLine(terminalContent, '✅ Connected to server. Sending data...');
		socket.emit('start_job', data);
		loading.style.display = 'none';
	});

	socket.on('job_update', (message) => {
		// Handle multiple lines in a single message
		const lines = message.split('\n').filter(line => line.trim());
		lines.forEach(line => {
			if (line.trim()) {
				addTerminalLine(terminalContent, line);
			}
		});
	});

	socket.on('job_complete', (result) => {
		const duration = ((Date.now() - startTime) / 1000).toFixed(2);
		addTerminalLine(terminalContent, '');
		addTerminalLine(terminalContent, `🎉 Simulation completed successfully! in ${duration} seconds`);
		addTerminalLine(terminalContent, '');

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

	// Update form text to show in progress
	overview.textContent = 'Meeples are meepling...';
	formLine1.textContent = 'replays in replayin\'';
	formLine2.textContent = 'see the actions on the right!';

	// Hide form inputs but keep the description text visible
	const formInputs = form.querySelectorAll('input, button, label, output, a');
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
	terminalContent.scrollTop = terminalContent.scrollHeight;
	scrollToBottomButton.classList.add('hidden');
});

// Listen for manual scrolling to hide/show the scroll-to-bottom button
terminalContent.addEventListener('scroll', () => {
	const isAtBottom = (terminalContent.scrollTop + terminalContent.clientHeight) >= (terminalContent.scrollHeight - 50);
	if (isAtBottom) {
		scrollToBottomButton.classList.add('hidden');
	}
	// Note: We don't show the button on scroll up here - only when new messages arrive
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


// analytics
const PROJECT_TOKEN = `6c3bc01ddc1f16d01e4fda11d3a4d166`;
if (window.mixpanel) {
	mixpanel.init(PROJECT_TOKEN, {
		loaded: function (mp) {
			console.log('\n\nMIXPANEL LOADED\n\n');
			const PARAMS = qsToObj(window.location.search);
			let { user = "", ...restParams } = PARAMS;
			if (!restParams) restParams = {};
			mp.register(restParams);
			if (user) mp.identify(user);
			if (user) mp.people.set({ $name: user, $email: user });

		},

		//autocapture
		autocapture: {
			pageview: "full-url",
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
		record_mask_text_selector: "nope",
		record_block_selector: "nope",
		record_block_class: "nope",
		record_canvas: true,
		record_heatmap_data: true,



		//normal mixpanel
		ignore_dnt: true,
		batch_flush_interval_ms: 0,
		api_host: "https://express-proxy-lmozz6xkha-uc.a.run.app",
		api_transport: 'XHR',
		persistence: "localStorage",
		api_payload_format: 'json'

	});
}