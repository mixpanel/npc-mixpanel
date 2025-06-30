import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { uid } from 'ak-tools';
import main from './headless.js';
import { log, setActiveSocket } from './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { sLog } from 'ak-tools';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { NODE_ENV = "production" } = process.env;
let io = null;
let activeSocket = null;
let activeJob = null;

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
	sLog(`SOCKET CONNECTED: ${socket.id}`, { socketId: socket.id }, 'info');
	activeSocket = socket;
	setActiveSocket(socket);

	// If there's an active job, associate the reconnected client with it
	if (activeJob) {
		activeJob.socketId = socket.id;
		activeSocket = socket;
		setActiveSocket(socket);
		socket.emit('job_update', `Resuming updates for job: ${activeJob.jobId}`);
	}

	socket.on('start_job', async (data) => {
		try {
			// If there's already an active job, prevent starting a new one
			if (activeJob) {
				activeJob.socketId = socket.id;
				activeSocket = socket;
				setActiveSocket(socket);
				socket.emit('job_update', `Resuming updates for job: ${activeJob.jobId}`);
				return;
			}

			const jobId = uid(4);
			const coercedData = coerceTypes(data);

			// Track the active job and its associated socket
			activeJob = {
				jobId,
				socketId: socket.id,
				data: coercedData,
			};

			socket.emit('job_update', `🚀 Starting simulation job: ${jobId}`);

			const result = await main(coercedData, log);

			socket.emit('job_update', `✅ Job completed: ${jobId}`);
			socket.emit('job_complete', result);

			// Clear the active job
			activeJob = null;
			activeSocket = null;

		} catch (error) {
			socket.emit('error', `❌ Job failed: ${error.message}`);
			activeJob = null;
			activeSocket = null;
		}
	});

	socket.on('disconnect', () => {
		sLog(`SOCKET DISCONNECTED: ${socket.id}`, { socketId: socket.id }, 'info');
		activeSocket = null;
		setActiveSocket(null);
		// Don't clear activeJob here - job may still be running
	});
});


// Serve static files (UI)
app.use(express.static('ui'));

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

// HTTP endpoint for direct API calls (backwards compatibility)
app.post('/entry', async (req, res) => {
	const runId = uid();

	try {
		// Merge query params and body params
		const mergedParams = {
			...coerceTypes(req.query || {}),
			...req.body,
			runId
		};

		// Auth check
		if (mergedParams.safeWord !== "let me in...") {
			return res.status(401).send("Bro... you're not authorized to be here");
		}

		const result = await main(mergedParams, log);
		res.status(200).json(result);

	} catch (error) {
		console.error(`ERROR: ${req.path}`, error);
		res.status(500).json({ error: error.message });
	}
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
		sLog(`/SIMULATE START`, mergedParams, 'NOTICE');
		const result = await main(mergedParams, log);
		const endTime = Date.now();
		const duration = endTime - startTime / 1000;
		sLog(`/SIMULATE END in ${duration} seconds`, mergedParams, 'NOTICE');
		res.status(200).json(result);

	} catch (error) {
		console.error(`ERROR: ${req.path}`, error);
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