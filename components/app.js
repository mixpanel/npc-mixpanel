const form = document.getElementById('simulatorForm');
const loading = document.querySelector('.loading');
const success = document.querySelector('.success');
const usersSlider = document.getElementById('users');
const usersOutput = document.getElementById('usersOutput');
const url = document.getElementById('url');
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
	usersOutput.textContent = e.target.value;
});

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
		addTerminalLine(terminalContent, '');
		addTerminalLine(terminalContent, '🎉 Simulation completed successfully!');
		addTerminalLine(terminalContent, '📊 Check your Mixpanel project for results');

		// Auto-close terminal after 3 seconds
		setTimeout(() => {
			if (!terminal.classList.contains('hidden')) {
				addTerminalLine(terminalContent, '⏱️  Closing terminal in 10 seconds...');
			}
		}, 10_000);

		setTimeout(() => {
			terminal.classList.add('hidden');
			openTerminalButton.classList.remove('hidden');

			// Restore original form text
			formLine1.textContent = 'give me a URL + project token...';
			formLine2.textContent = '...i\'ll give you replays!';

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
	formLine1.textContent = 'replays in progress...';
	formLine2.textContent = 'check the terminal below!';

	// Hide form inputs but keep the description visible
	form.style.display = 'none';
	loading.style.display = 'block';
});

// Minimize terminal (close button)
const closeTerminalButton = document.getElementById('close-terminal');
const openTerminalButton = document.getElementById('open-terminal');

closeTerminalButton.addEventListener('click', () => {
	const terminal = document.getElementById('terminal');

	// Add exit animation
	terminal.style.animation = 'slideDown 0.3s ease-in forwards';

	setTimeout(() => {
		terminal.classList.add('hidden');
		terminal.style.animation = ''; // Reset animation
		// Show the floating open button
		openTerminalButton.classList.remove('hidden');
	}, 300);
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

// Terminal resize functionality
const resizeHandle = document.getElementById('terminal-resize-handle');
const terminal = document.getElementById('terminal');

let isResizing = false;
let startY = 0;
let startHeight = 0;

resizeHandle.addEventListener('mousedown', (e) => {
	isResizing = true;
	startY = e.clientY;
	startHeight = parseInt(document.defaultView.getComputedStyle(terminal).height, 10);
	document.body.style.userSelect = 'none'; // Prevent text selection while dragging
	e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
	if (!isResizing) return;

	const dy = startY - e.clientY; // Inverted because we're dragging from top
	let newHeight = startHeight + dy;

	// Apply constraints
	const minHeight = 200;
	const maxHeight = window.innerHeight * 0.8;
	newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

	terminal.style.height = newHeight + 'px';
});

document.addEventListener('mouseup', () => {
	if (isResizing) {
		isResizing = false;
		document.body.style.userSelect = ''; // Re-enable text selection
	}
});

// Add slide down animation for close
const slideDownCSS = `
			@keyframes slideDown {
				from {
					transform: translateY(0);
				}
				to {
					transform: translateY(100%);
				}
			}
		`;
const style = document.createElement('style');
style.textContent = slideDownCSS;
document.head.appendChild(style);