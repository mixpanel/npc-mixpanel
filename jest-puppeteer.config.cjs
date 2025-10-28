module.exports = {
	launch: {
		headless: 'new',
		args: [
			'--disable-web-security',
			'--disable-features=VizDisplayCompositor',
			'--disable-site-isolation-trials',
			'--disable-blink-features=AutomationControlled',
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
			'--disable-gpu'
		],
		defaultViewport: {
			width: 1920,
			height: 1080
		}
	},
	browserContext: 'default'
};
