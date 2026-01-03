import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { uid } from 'ak-tools';
import main from './meeple/headless.js';
import { validateSequences } from './meeple/sequences.js';
import { log } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/cloudLogger.js';
import cookieParser from 'cookie-parser';
import * as Mixpanel from 'mixpanel';
import { Diagnostics } from 'ak-diagnostic';
import { runMicrositesJob, createProductionLogger } from './microsites.js';
import { createRuntimeGuard, authenticateApi, isApiContext } from './middleware/runtimeGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { NODE_ENV = 'production', MIXPANEL_TRACKING_TOKEN = '6c3bc01ddc1f16d01e4fda11d3a4d166' } = process.env;
const RUNTIME_CONTEXT = process.env.RUNTIME_CONTEXT || 'npc-ui';
let io = null;

const app = express();
const httpServer = createServer(app);
const mp = Mixpanel.init(MIXPANEL_TRACKING_TOKEN, {
	debug: NODE_ENV === 'dev',
	geolocate: false,
	keepAlive: false
});

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function coerceTypes(obj) {
	const coerced = {};
	for (const [key, value] of Object.entries(obj)) {
		// Boolean coercion
		if (value === 'true') {
			coerced[key] = true;
		} else if (value === 'false') {
			coerced[key] = false;
		}
		// Number coercion
		else if (!isNaN(value) && !isNaN(parseFloat(value)) && value !== '') {
			coerced[key] = parseFloat(value);
		}
		// Keep as string
		else {
			coerced[key] = value;
		}
	}
	return coerced;
}

// Initialize Socket.IO server with Cloud Run optimizations (UI only, not API)
if (!isApiContext) {
	io = new Server(httpServer, {
		cors: {
			origin: '*', // Adjust in production for security
			methods: ['GET', 'POST']
		},
		// Cloud Run optimizations
		transports: ['websocket', 'polling'], // Allow both but prefer WebSocket
		allowEIO3: true, // Allow different Engine.IO versions
		pingTimeout: 60000, // 60 seconds (Cloud Run timeout)
		pingInterval: 25000, // 25 seconds
		upgradeTimeout: 30000, // 30 seconds for upgrade
		maxHttpBufferSize: 1e6 // 1MB max buffer
	});

	io.on('connection', socket => {
		// Extract user from socket auth (passed from client)
		const user = socket.handshake.auth?.user || 'anonymous';
		logger.info(`SOCKET CONNECTED: ${socket.id}`, { socketId: socket.id, user });
		const startTime = Date.now();

		socket.on('start_job', async data => {
			const diagnostics = new Diagnostics({
				name: 'npc-mixpanel-server'
			});
			let coercedData;
			try {
				const jobId = uid(4);
				coercedData = coerceTypes(data);

				// Send initial status to general tab (no meepleId)
				socket.emit('job_update', { message: `🚀 Starting simulation job: ${jobId}`, meepleId: null });
				socket.emit('job_update', {
					message: `📋 Configuration: ${coercedData.users} meeples, concurrency: ${Math.min(coercedData.users, coercedData.concurrency || 10)}, headless: ${coercedData.headless}`,
					meepleId: null
				});
				socket.emit('job_update', { message: `🎯 Target: ${coercedData.url}`, meepleId: null });
				socket.emit('job_update', {
					message: `💉 Mixpanel injection: ${coercedData.inject ? 'enabled' : 'disabled'}`,
					meepleId: null
				});
				socket.emit('job_update', { message: `⏰ Job started at ${new Date().toLocaleTimeString()}`, meepleId: null });
				socket.emit('job_update', { message: ``, meepleId: null }); // Empty line for spacing
				socket.emit('job_update', {
					message: `👀 Watch individual meeple progress in their dedicated tabs`,
					meepleId: null
				});
				socket.emit('job_update', { message: ``, meepleId: null }); // Empty line for spacing

				// Server-side analytics: Track job start
				logger.notice(`/SIMULATE START`, { ...coercedData, user, jobId });
				diagnostics.start();

				// Mixpanel server-side tracking
				const userId = user || 'unauthenticated';
				mp.track('server: job start', {
					distinct_id: userId,
					jobId,
					url: coercedData.url,
					users: coercedData.users,
					concurrency: coercedData.concurrency,
					headless: coercedData.headless,
					inject: coercedData.inject
				});

				// Enhanced job logger with periodic progress updates
				const jobStartTime = Date.now();
				const completedMeeples = new Set();
				const totalMeeples = coercedData.users;

				const jobLogger = (message, meepleId) => {
					// Send all messages through the existing log function
					log(message, meepleId, socket);

					// Track meeple completions for general tab progress updates (only on first completion message per meeple)
					if (
						meepleId &&
						!completedMeeples.has(meepleId) &&
						(message.includes('completed!') || message.includes('timed out') || message.includes('failed:'))
					) {
						completedMeeples.add(meepleId);
						const elapsed = ((Date.now() - jobStartTime) / 1000).toFixed(1);
						const progress = ((completedMeeples.size / totalMeeples) * 100).toFixed(1);

						socket.emit('job_update', {
							message: `📈 Progress: ${completedMeeples.size}/${totalMeeples} meeples completed (${progress}%) | Elapsed: ${elapsed}s`,
							meepleId: null
						});

						if (completedMeeples.size === totalMeeples) {
							socket.emit('job_update', { message: ``, meepleId: null });
							socket.emit('job_update', { message: `🎯 All meeples have finished their missions!`, meepleId: null });
						}
					}

					// Track meeple spawns for general tab
					if (meepleId && message.includes('Spawning')) {
						const match = message.match(/\((\d+)\/(\d+)\)/);
						if (match) {
							const spawnNumber = parseInt(match[1]);
							const totalFromMessage = parseInt(match[2]);

							// Use the total from the message to ensure consistency
							const actualTotal = totalFromMessage || totalMeeples;

							// Validate spawn number is within expected range
							if (spawnNumber <= actualTotal) {
								socket.emit('job_update', {
									message: `🎬 Meeple ${spawnNumber}/${actualTotal} spawned: <span style="color: #FF7557;">${meepleId}</span>`,
									meepleId: null
								});
							}
						}
					}
				};

				// Send periodic time updates
				const progressInterval = setInterval(() => {
					const elapsed = ((Date.now() - jobStartTime) / 1000).toFixed(1);
					socket.emit('job_update', {
						message: `⏱️ Job running for ${elapsed}s | Active meeples: ${totalMeeples - completedMeeples.size}`,
						meepleId: null
					});
				}, 30000); // Every 30 seconds

				const result = await main(coercedData, jobLogger);

				// Clear the progress interval
				clearInterval(progressInterval);

				const endTime = Date.now();
				const duration = (endTime - startTime) / 1000;
				diagnostics.stop();
				const report = diagnostics.report();

				// Server-side analytics: Track job completion
				logger.notice(`/SIMULATE END in ${duration} seconds`, {
					...coercedData,
					user,
					jobId,
					duration,
					completedMeeples,
					totalMeeples,
					report
				});

				// Mixpanel server-side tracking
				mp.track('server: job finish', {
					distinct_id: userId,
					jobId,
					duration,
					completedMeeples,
					totalMeeples,
					url: coercedData.url,
					users: coercedData.users,
					diagnostics: report
				});

				// Enhanced completion summary for general tab
				socket.emit('job_update', { message: ``, meepleId: null });
				socket.emit('job_update', { message: `🏁 Simulation Complete!`, meepleId: null });
				socket.emit('job_update', { message: `⏱️ Total duration: ${duration.toFixed(2)} seconds`, meepleId: null });
				socket.emit('job_update', { message: `📊 Check the detailed summary below for results`, meepleId: null });
				socket.emit('job_update', { message: `✅ Job completed: ${jobId}`, meepleId: null });
				socket.emit('job_complete', result);
			} catch (error) {
				// Server-side analytics: Track job error
				logger.error(`/SIMULATE ERROR`, {
					user,
					error: error.message,
					stack: error.stack,
					data: coercedData
				});

				// Mixpanel server-side tracking
				const userId = user || 'unauthenticated';
				diagnostics.stop();
				const report = diagnostics.report();
				mp.track('server: job error', {
					distinct_id: userId,
					jobId: coercedData.jobId,
					error: error.message,
					url: coercedData.url,
					users: coercedData.users,
					diagnostics: report
				});

				socket.emit('error', `❌ Job failed: ${error.message}`);
			}
		});

		socket.on('disconnect', () => {
			logger.info(`SOCKET DISCONNECTED: ${socket.id}`, { socketId: socket.id });
			// Jobs continue running even if client disconnects
		});
	});
} // End of if (!isApiContext) for WebSocket

// Apply runtime guard middleware (must come before routes)
app.use(createRuntimeGuard());

// Serve static files (UI only, not API)
if (!isApiContext) {
	app.use(express.static('ui'));
}
app.use(cookieParser());

app.use((req, res, next) => {
	//for idmgmt: https://cloud.google.com/iap/docs/identity-howto
	const rawUser = req.headers['x-goog-authenticated-user-email'];
	if (rawUser) {
		let user;
		try {
			// URL decode first, then extract email from accounts.google.com:user@domain.com format
			const decodedUser = decodeURIComponent(rawUser);
			user = decodedUser.includes(':') ? decodedUser.split(':').pop() : decodedUser;
		} catch (error) {
			user = 'anonymous';
		}
		res.cookie('user', user, {
			maxAge: 900000,
			httpOnly: false
			//sameSite: 'none'
		});
	}
	next();
});

// API routes
app.get('/ping', (req, res) => {
	res.json({
		status: 'ok',
		message: 'npc-mixpanel service is alive',
		environment: NODE_ENV,
		context: RUNTIME_CONTEXT,
		echo: req.query.data
	});
});

// API documentation endpoint
app.get('/help', (_req, res) => {
	res.json({
		name: 'npc-mixpanel-api',
		version: '1.0.0',
		description: 'Cloud-based web automation service for simulating realistic user behavior on websites',
		authentication: {
			user_id: {
				required: true,
				type: 'string',
				format: 'Must end with @mixpanel.com',
				description: 'Your Mixpanel email address'
			},
			safe_word: {
				required: true,
				type: 'string',
				description: 'Authentication password (contact admin for value)'
			}
		},
		endpoints: {
			'GET /help': {
				auth: false,
				description: 'Returns this API documentation'
			},
			'GET /ping': {
				auth: false,
				description: 'Health check endpoint'
			},
			'POST /simulate': {
				auth: true,
				description: 'Run a meeple simulation on a target website',
				parameters: {
					url: {
						type: 'string',
						required: true,
						description: 'Target URL to simulate user behavior on'
					},
					users: {
						type: 'number',
						default: 10,
						max: 25,
						description: 'Number of meeples (simulated users) to spawn'
					},
					concurrency: {
						type: 'number',
						default: 10,
						max: 10,
						description: 'Maximum concurrent meeples running at once'
					},
					headless: {
						type: 'boolean',
						default: true,
						description: 'Run browser in headless mode (no visible window)'
					},
					inject: {
						type: 'boolean',
						default: true,
						description: 'Inject Mixpanel analytics tracking into the page'
					},
					past: {
						type: 'boolean',
						default: false,
						description: 'Simulate past timestamps for analytics events'
					},
					token: {
						type: 'string',
						optional: true,
						description: 'Override Mixpanel token for tracking'
					},
					maxActions: {
						type: 'number',
						optional: true,
						description: 'Maximum number of actions per meeple session'
					},
					masking: {
						type: 'boolean',
						default: false,
						description: 'Enable element masking for autocapture'
					},
					sequences: {
						type: 'object',
						optional: true,
						description: 'Deterministic sequences for reproducible user journeys',
						schema: {
							'[sequenceName]': {
								description: { type: 'string', optional: true },
								temperature: {
									type: 'number',
									range: [0, 10],
									default: 5,
									description: '0=random, 10=strict sequence following'
								},
								'chaos-range': {
									type: '[number, number]',
									optional: true,
									description: 'Multiplier range for temperature variability'
								},
								actions: {
									type: 'array',
									description: 'Array of actions to perform',
									items: {
										action: {
											type: 'string',
											enum: ['click', 'type', 'select', 'fillOutForm']
										},
										selector: { type: 'string', required: true },
										text: { type: 'string', requiredFor: 'type' },
										value: { type: 'string', requiredFor: 'select' }
									}
								}
							}
						}
					}
				}
			},
			'POST /microsites': {
				auth: true,
				description: 'Run simulations across all 6 Mixpanel microsites sequentially',
				parameters: {
					users: {
						type: 'number',
						default: 5,
						description: 'Meeples per microsite'
					},
					concurrency: {
						type: 'number',
						default: 5,
						description: 'Concurrent meeples per microsite'
					},
					headless: {
						type: 'boolean',
						default: true,
						description: 'Run browser in headless mode'
					}
				}
			}
		},
		responseFormats: {
			success: {
				results: 'SimulationResult[]',
				duration: 'number (seconds)'
			},
			error: {
				error: 'string',
				details: 'string[] (optional)'
			},
			authError: {
				error: 'string',
				code: 401
			}
		}
	});
});

// Main UI route (UI only, not API - blocked by middleware)
if (!isApiContext) {
	app.get('/', (_req, res) => {
		res.sendFile(path.join(__dirname, 'ui', 'ui.html'));
	});
}

// Simulate endpoint (alternative route)
app.post('/simulate', async (req, res) => {
	const runId = uid();

	// API context requires authentication
	if (isApiContext) {
		const auth = authenticateApi(req);
		if (!auth.ok) {
			logger.notice(`/SIMULATE auth failed`, { error: auth.error, ip: req.ip });
			return res.status(401).json({ error: auth.error, code: 401 });
		}
	}

	// Extract user from IAP header (URL decode first, then parse)
	const rawUser = req.headers['x-goog-authenticated-user-email'];
	let user, userId;
	try {
		const decodedUser = decodeURIComponent(rawUser);
		user = decodedUser.includes(':') ? decodedUser.split(':').pop() : decodedUser;
	} catch (error) {
		// For API context, use the authenticated user_id
		user = isApiContext ? req.body?.user_id || req.query?.user_id || 'API' : 'CRON';
	}

	try {
		const mergedParams = {
			...coerceTypes(req.query || {}),
			...req.body,
			runId
		};

		// Validate sequences parameter if provided
		if (mergedParams.sequences) {
			const validation = validateSequences(mergedParams.sequences);
			if (!validation.valid) {
				logger.error(`/SIMULATE validation error`, { errors: validation.errors, user, rawUser });
				return res.status(400).json({
					error: 'Invalid sequences specification',
					details: validation.errors
				});
			}
		}

		const startTime = Date.now();

		// Server-side analytics: Track API job start
		logger.notice(`/SIMULATE START`, { ...mergedParams, user, rawUser });

		// Mixpanel server-side tracking
		userId = user || 'unauthenticated';
		mp.track('server: job start', {
			distinct_id: userId,
			runId,
			url: mergedParams.url,
			users: mergedParams.users,
			source: 'api'
		});

		const result = await main(mergedParams, log);
		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;

		// Server-side analytics: Track API job completion
		logger.notice(`/SIMULATE END in ${duration} seconds`, {
			...mergedParams,
			user,
			duration,
			rawUser
		});

		// Mixpanel server-side tracking
		mp.track('server: job finish', {
			distinct_id: userId,
			runId,
			duration,
			url: mergedParams.url,
			users: mergedParams.users,
			source: 'api'
		});

		res.status(200).json(result);
	} catch (error) {
		// Server-side analytics: Track API job error
		logger.error(`ERROR: ${req.path}`, {
			path: req.path,
			user,
			error: error.message,
			stack: error.stack,
			runId
		});

		// Mixpanel server-side tracking
		mp.track('server: job error', {
			distinct_id: userId,
			runId,
			error: error.message,
			source: 'api'
		});

		res.status(500).json({ error: error.message });
	}
});

// Microsites endpoint - runs all 6 microsites sequentially (API only)
app.post('/microsites', async (req, res) => {
	const jobId = uid();

	// API context requires authentication (UI is blocked by middleware anyway)
	if (isApiContext) {
		const auth = authenticateApi(req);
		if (!auth.ok) {
			logger.notice(`/MICROSITES auth failed`, { error: auth.error, ip: req.ip });
			return res.status(401).json({ error: auth.error, code: 401 });
		}
	}

	// Extract user from IAP header (URL decode first, then parse)
	const rawUser = req.headers['x-goog-authenticated-user-email'];
	let user, userId;
	try {
		const decodedUser = decodeURIComponent(rawUser);
		user = decodedUser.includes(':') ? decodedUser.split(':').pop() : decodedUser;
	} catch (error) {
		// For API context, use the authenticated user_id
		user = isApiContext ? req.body?.user_id || req.query?.user_id || 'API' : 'CRON';
	}

	try {
		const mergedParams = {
			...coerceTypes(req.query || {}),
			...req.body,
			jobId
		};

		const startTime = Date.now();

		// Server-side analytics: Track microsites job start
		logger.notice(`/MICROSITES START`, { ...mergedParams, user, rawUser });

		// Mixpanel server-side tracking
		userId = user || 'unauthenticated';
		mp.track('server: microsites job start', {
			distinct_id: 'CRON',
			jobId,
			source: 'api'
		});

		// Run the microsites job (no WebSocket, returns aggregated results)
		// Use production logger to filter verbose meeple logs in GCP
		const result = await runMicrositesJob(mergedParams, createProductionLogger());

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;

		// Server-side analytics: Track microsites job completion
		logger.notice(`/MICROSITES END in ${duration} seconds`, {
			...mergedParams,
			user,
			duration,
			rawUser,
			summary: result.summary
		});

		// Mixpanel server-side tracking
		mp.track('server: microsites job finish', {
			distinct_id: 'CRON',
			jobId,
			duration,
			source: 'api',
			...result.summary
		});

		res.status(200).json(result);
	} catch (error) {
		// Server-side analytics: Track microsites job error
		logger.error(`ERROR: ${req.path}`, {
			path: req.path,
			user,
			error: error.message,
			stack: error.stack,
			jobId
		});

		// Mixpanel server-side tracking
		mp.track('server: microsites job error', {
			distinct_id: userId,
			jobId,
			error: error.message,
			source: 'api'
		});

		res.status(500).json({ error: error.message });
	}
});

// Also support GET requests for microsites (for simple CRON jobs)
app.get('/microsites', async (req, res) => {
	const jobId = uid();
	// Extract user from IAP header (URL decode first, then parse)
	const rawUser = req.headers['x-goog-authenticated-user-email'];
	let user, userId;
	try {
		const decodedUser = decodeURIComponent(rawUser);
		user = decodedUser.includes(':') ? decodedUser.split(':').pop() : decodedUser;
	} catch (error) {
		user = 'CRON';
	}

	try {
		const mergedParams = {
			...coerceTypes(req.query || {}),
			jobId
		};

		const startTime = Date.now();

		// Server-side analytics: Track microsites job start
		logger.notice(`/MICROSITES GET START`, { ...mergedParams, user, rawUser });

		// Mixpanel server-side tracking
		userId = user || 'unauthenticated';
		mp.track('server: microsites job start', {
			distinct_id: userId,
			jobId,
			source: 'api-get'
		});

		// Run the microsites job (no WebSocket, returns aggregated results)
		// Use production logger to filter verbose meeple logs in GCP
		const result = await runMicrositesJob(mergedParams, createProductionLogger());

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;

		// Server-side analytics: Track microsites job completion
		logger.notice(`/MICROSITES GET END in ${duration} seconds`, {
			...mergedParams,
			user,
			duration,
			rawUser,
			summary: result.summary
		});

		// Mixpanel server-side tracking
		mp.track('server: microsites job finish', {
			distinct_id: userId,
			jobId,
			duration,
			source: 'api-get',
			...result.summary
		});

		res.status(200).json(result);
	} catch (error) {
		// Server-side analytics: Track microsites job error
		logger.error(`ERROR: ${req.path}`, {
			path: req.path,
			user,
			error: error.message,
			stack: error.stack,
			jobId
		});

		// Mixpanel server-side tracking
		mp.track('server: microsites job error', {
			distinct_id: userId,
			jobId,
			error: error.message,
			source: 'api-get'
		});

		res.status(500).json({ error: error.message });
	}
});

// Catch-all for SPA routing (UI only)
if (!isApiContext) {
	app.get('*', (_req, res) => {
		res.sendFile(path.join(__dirname, 'ui', 'ui.html'));
	});
} else {
	// API context: return 404 for unknown routes
	app.use((_req, res) => {
		res.status(404).json({
			error: 'Not found',
			message: 'Unknown endpoint. Use GET /help for API documentation.'
		});
	});
}

// Only start the server if this file is run directly (not imported)
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const port = process.env.PORT || 8080;
	httpServer.listen(port, () => {
		const contextLabel = isApiContext ? 'API' : 'UI';
		if (NODE_ENV === 'dev') {
			console.log(`\n[DEV - ${contextLabel}]\nExpress server listening on port ${port}\nhttp://localhost:${port}`);
			console.log(`Runtime context: ${RUNTIME_CONTEXT}`);
		} else {
			console.log(`${NODE_ENV} [${contextLabel}]: npc-mixpanel server running on port ${port}`);
		}
	});
} else {
	io = null;
}
