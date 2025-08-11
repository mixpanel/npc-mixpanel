/**
 * Navigation-related actions for browser automation
 * Extracted from headless.js for better code organization
 */

/**
 * Navigate back using browser back button
 */
export async function navigateBack(page, log = console.log) {
	try {
		const canGoBack = await page.evaluate(() => window.history.length > 1);
		if (canGoBack && Math.random() < 0.7) { // 70% chance to actually go back if possible
			await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
			log(`    └─ ⬅️ <span style="color: #80E1D9;">Navigated back</span> in browser history`);
			return true;
		}
		return false;
	} catch (error) {
		// Back navigation might fail for various reasons (no history, navigation restrictions, etc.)
		return false;
	}
}

/**
 * Navigate forward using browser forward button
 */
export async function navigateForward(page, log = console.log) {
	try {
		const canGoForward = await page.evaluate(() => window.history.length > 1);
		if (canGoForward && Math.random() < 0.7) { // 70% chance to actually go forward if possible
			await page.goForward({ waitUntil: 'domcontentloaded', timeout: 5000 });
			log(`    └─ ➡️ <span style="color: #80E1D9;">Navigated forward</span> in browser history`);
			return true;
		}
		return false;
	} catch (error) {
		// Forward navigation might fail for various reasons (no history, navigation restrictions, etc.)
		return false;
	}
}