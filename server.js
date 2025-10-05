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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
	NODE_ENV = 'production',
	MIXPANEL_TRACKING_TOKEN = '6c3bc01ddc1f16d01e4fda11d3a4d166'
} = process.env;
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

// Initialize Socket.IO server
io = new Server(httpServer, {
	cors: {
		origin: '*', // Adjust in production for security
		methods: ['GET', 'POST']
	}
});

io.on('connection', (socket) => {
	// Extract user from socket auth (passed from client)
	const user = socket.handshake.auth?.user || 'anonymous';
	logger.info(`SOCKET CONNECTED: ${socket.id}`, { socketId: socket.id, user });
	const startTime = Date.now();

	socket.on('start_job', async (data) => {
		const diagnostics = new Diagnostics({
			name: 'npc-mixpanel-server',
		});
		let coercedData;
		try {
			const jobId = uid(4);
			coercedData = coerceTypes(data);


			// Send initial status to general tab (no meepleId)
			socket.emit('job_update', { message: `🚀 Starting simulation job: ${jobId}`, meepleId: null });
			socket.emit('job_update', { message: `📋 Configuration: ${coercedData.users} meeples, concurrency: ${Math.min(coercedData.users, coercedData.concurrency || 10)}, headless: ${coercedData.headless}`, meepleId: null });
			socket.emit('job_update', { message: `🎯 Target: ${coercedData.url}`, meepleId: null });
			socket.emit('job_update', { message: `💉 Mixpanel injection: ${coercedData.inject ? 'enabled' : 'disabled'}`, meepleId: null });
			socket.emit('job_update', { message: `⏰ Job started at ${new Date().toLocaleTimeString()}`, meepleId: null });
			socket.emit('job_update', { message: ``, meepleId: null }); // Empty line for spacing
			socket.emit('job_update', { message: `👀 Watch individual meeple progress in their dedicated tabs`, meepleId: null });
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
				if (meepleId && !completedMeeples.has(meepleId) && (message.includes('completed!') || message.includes('timed out') || message.includes('failed:'))) {
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


// Serve static files (UI)
app.use(express.static('ui'));
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
		echo: req.query.data
	});
});

// Main UI route
app.get('/', (_req, res) => {
	res.sendFile(path.join(__dirname, 'ui', 'ui.html'));
});


// Simulate endpoint (alternative route)
app.post('/simulate', async (req, res) => {
	const runId = uid();
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

// Catch-all for SPA routing
app.get('*', (_req, res) => {
	res.sendFile(path.join(__dirname, 'ui', 'ui.html'));
});

// Only start the server if this file is run directly (not imported)
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const port = process.env.PORT || 8080;
	httpServer.listen(port, () => {
		if (NODE_ENV === 'dev') {
			console.log(`\n[DEV]\nExpress server listening on port ${port}\nhttp://localhost:${port}`);
		} else {
			console.log(`${NODE_ENV}: npc-mixpanel server running on port ${port}`);
		}
	});
} else {
	io = null;
}