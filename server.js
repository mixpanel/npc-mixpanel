import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { uid } from 'ak-tools';
import main from './meeple/headless.js';
import { log } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudLog, logger } from './utils/cloudLogger.js';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { NODE_ENV = "production" } = process.env;
let io = null;

const app = express();
const httpServer = createServer(app);

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
		origin: "*", // Adjust in production for security
		methods: ["GET", "POST"]
	}
});

io.on('connection', (socket) => {
	logger.info(`SOCKET CONNECTED: ${socket.id}`, { socketId: socket.id });
	var startTime = Date.now();

	socket.on('start_job', async (data) => {
		try {
			const jobId = uid(4);
			const coercedData = coerceTypes(data);

			// Send initial status to general tab (no meepleId)
			socket.emit('job_update', { message: `🚀 Starting simulation job: ${jobId}`, meepleId: null });
			socket.emit('job_update', { message: `📋 Configuration: ${coercedData.users} meeples, concurrency: ${Math.min(coercedData.users, coercedData.concurrency || 10)}, headless: ${coercedData.headless}`, meepleId: null });
			socket.emit('job_update', { message: `🎯 Target: ${coercedData.url}`, meepleId: null });
			socket.emit('job_update', { message: `💉 Mixpanel injection: ${coercedData.inject ? 'enabled' : 'disabled'}`, meepleId: null });
			socket.emit('job_update', { message: `⏰ Job started at ${new Date().toLocaleTimeString()}`, meepleId: null });
			socket.emit('job_update', { message: ``, meepleId: null }); // Empty line for spacing
			socket.emit('job_update', { message: `👀 Watch individual meeple progress in their dedicated tabs`, meepleId: null });
			socket.emit('job_update', { message: ``, meepleId: null }); // Empty line for spacing
			
			logger.notice(`/SIMULATE START`, coercedData);
			
			// Enhanced job logger with periodic progress updates
			let jobStartTime = Date.now();
			let completedMeeples = 0;
			let totalMeeples = coercedData.users;
			
			const jobLogger = (message, meepleId) => {
				// Send all messages through the existing log function
				log(message, meepleId, socket);
				
				// Track meeple completions for general tab progress updates
				if (meepleId && (message.includes('completed!') || message.includes('timed out') || message.includes('failed:'))) {
					completedMeeples++;
					const elapsed = ((Date.now() - jobStartTime) / 1000).toFixed(1);
					const progress = ((completedMeeples / totalMeeples) * 100).toFixed(1);
					
					socket.emit('job_update', { 
						message: `📈 Progress: ${completedMeeples}/${totalMeeples} meeples completed (${progress}%) | Elapsed: ${elapsed}s`, 
						meepleId: null 
					});
					
					if (completedMeeples === totalMeeples) {
						socket.emit('job_update', { message: ``, meepleId: null });
						socket.emit('job_update', { message: `🎯 All meeples have finished their missions!`, meepleId: null });
					}
				}
				
				// Track meeple spawns for general tab
				if (meepleId && message.includes('Spawning')) {
					const spawnNumber = message.match(/\((\d+)\/\d+\)/)?.[1];
					if (spawnNumber) {
						socket.emit('job_update', { 
							message: `🎬 Meeple ${spawnNumber}/${totalMeeples} spawned: <span style="color: #FF7557;">${meepleId}</span>`, 
							meepleId: null 
						});
					}
				}
			};
			
			// Send periodic time updates
			const progressInterval = setInterval(() => {
				const elapsed = ((Date.now() - jobStartTime) / 1000).toFixed(1);
				socket.emit('job_update', { 
					message: `⏱️ Job running for ${elapsed}s | Active meeples: ${totalMeeples - completedMeeples}`, 
					meepleId: null 
				});
			}, 30000); // Every 30 seconds
			
			const result = await main(coercedData, jobLogger);
			
			// Clear the progress interval
			clearInterval(progressInterval);
			
			const endTime = Date.now();
			const duration = (endTime - startTime) / 1000;
			logger.notice(`/SIMULATE END in ${duration} seconds`, { ...coercedData, duration });
			
			// Enhanced completion summary for general tab
			socket.emit('job_update', { message: ``, meepleId: null });
			socket.emit('job_update', { message: `🏁 Simulation Complete!`, meepleId: null });
			socket.emit('job_update', { message: `⏱️ Total duration: ${duration.toFixed(2)} seconds`, meepleId: null });
			socket.emit('job_update', { message: `📊 Check the detailed summary below for results`, meepleId: null });
			socket.emit('job_update', { message: `✅ Job completed: ${jobId}`, meepleId: null });
			socket.emit('job_complete', result);

		} catch (error) {
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

app.use(function (req, res, next) {
	//for idmgmt: https://cloud.google.com/iap/docs/identity-howto
	const user = req.headers["x-goog-authenticated-user-email"];
	if (user) {
		res.cookie("user", user, {
			maxAge: 900000,
			httpOnly: false
			//sameSite: 'none'
		});
	}
	next();
});



// API routes
app.get('/ping', async (req, res) => {
	res.json({
		status: "ok",
		message: "npc-mixpanel service is alive",
		environment: NODE_ENV,
		echo: req.query.data
	});
});

// Main UI route
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'ui', 'ui.html'));
});


// Simulate endpoint (alternative route)
app.post('/simulate', async (req, res) => {
	const runId = uid();

	try {
		const mergedParams = {
			...coerceTypes(req.query || {}),
			...req.body,
			runId
		};
		const startTime = Date.now();
		logger.notice(`/SIMULATE START`, mergedParams);
		const result = await main(mergedParams, log);
		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		logger.notice(`/SIMULATE END in ${duration} seconds`, { ...mergedParams, duration });
		res.status(200).json(result);

	} catch (error) {
		logger.error(`ERROR: ${req.path}`, {
			path: req.path,
			error: error.message,
			stack: error.stack,
			runId
		});
		res.status(500).json({ error: error.message });
	}
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
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