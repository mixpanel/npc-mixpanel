/**
 * Runtime Guard Middleware
 *
 * Controls access to endpoints based on RUNTIME_CONTEXT environment variable.
 * - npc-ui: UI service (private, behind IAP)
 * - npc-api: API service (public, requires user_id + safe_word auth)
 */

const RUNTIME_CONTEXT = process.env.RUNTIME_CONTEXT || 'npc-ui';
export const isApiContext = RUNTIME_CONTEXT === 'npc-api';

// Allowed hosts for API service
const ALLOWED_API_HOSTS = [
	'localhost',
	'127.0.0.1',
	'npc-mixpanel-api-lmozz6xkha-uc.a.run.app',
	'npc-mixpanel-api-1078767167468.us-central1.run.app'
];

/**
 * Authenticate API requests
 * Requires user_id ending in @mixpanel.com and safe_word = 'pickles'
 */
export function authenticateApi(req) {
	const userId = req.body?.user_id || req.query?.user_id;
	const safeWord = req.body?.safe_word || req.query?.safe_word;

	if (!userId || typeof userId !== 'string') {
		return { ok: false, error: 'Missing user_id parameter' };
	}

	if (!userId.endsWith('@mixpanel.com')) {
		return { ok: false, error: 'user_id must end with @mixpanel.com' };
	}

	if (safeWord !== 'pickles') {
		return { ok: false, error: 'Invalid or missing safe_word' };
	}

	return { ok: true, userId };
}

/**
 * Validate host for API service
 */
function isAllowedHost(host) {
	if (!host) return false;
	const hostname = host.split(':')[0]; // Remove port if present
	return ALLOWED_API_HOSTS.some(allowed => hostname === allowed || hostname.endsWith(allowed));
}

/**
 * Create runtime guard middleware
 * Blocks/allows endpoints based on RUNTIME_CONTEXT
 */
export function createRuntimeGuard() {
	return (req, res, next) => {
		const path = req.path;
		const method = req.method;

		if (isApiContext) {
			// API Service restrictions

			// Validate host
			const host = req.get('host');
			if (!isAllowedHost(host)) {
				return res.status(403).json({
					error: 'Forbidden',
					message: 'This endpoint is not accessible from this host'
				});
			}

			// Block UI routes (root path that would serve HTML)
			if (path === '/') {
				return res.status(403).json({
					error: 'UI not available',
					message: 'The web UI is not available on the API service. Use GET /help for API documentation.'
				});
			}

			// Block static file requests (common UI assets)
			if (
				path.startsWith('/ui') ||
				path.endsWith('.html') ||
				path.endsWith('.css') ||
				path.endsWith('.js') ||
				path.endsWith('.ico')
			) {
				return res.status(403).json({
					error: 'Static files not available',
					message: 'Static files are not served on the API service'
				});
			}

			// Block GET /microsites (only POST allowed)
			if (path === '/microsites' && method === 'GET') {
				return res.status(403).json({
					error: 'Method not allowed',
					message: 'GET /microsites is not available. Use POST /microsites with authentication.'
				});
			}
		} else {
			// UI Service restrictions

			// Block /microsites on UI service (API only)
			if (path === '/microsites') {
				return res.status(403).json({
					error: 'Endpoint not available',
					message: '/microsites is only available on the API service'
				});
			}
		}

		next();
	};
}

export default { createRuntimeGuard, authenticateApi, isApiContext };
