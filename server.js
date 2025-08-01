import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { uid } from 'ak-tools';
import main from './utils/headless.js';
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

			socket.emit('job_update', `🚀 Starting simulation job: ${jobId}`);
			socket.emit('job_update', `look in the console tabs for meeple updates`);
			logger.notice(`/SIMULATE START`, coercedData);
			
			// Create job-specific logger that sends to this socket
			const jobLogger = (message, meepleId) => log(message, meepleId, socket);
			const result = await main(coercedData, jobLogger);
			const endTime = Date.now();
			const duration = (endTime - startTime) / 1000;
			logger.notice(`/SIMULATE END in ${duration} seconds`, { ...coercedData, duration });
			socket.emit('job_update', `✅ Job completed: ${jobId}`);
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