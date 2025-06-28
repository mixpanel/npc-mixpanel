import { http } from '@google-cloud/functions-framework';
import { sLog, uid, timer } from 'ak-tools';
import dotenv from 'dotenv';
dotenv.config();
const { NODE_ENV = "" } = process.env;
if (!NODE_ENV) throw new Error("NODE_ENV is required");
import path from 'path';
import { tmpdir } from 'os';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
let TEMP_DIR;
if (NODE_ENV === 'dev') TEMP_DIR = './tmp';
else TEMP_DIR = tmpdir();
TEMP_DIR = path.resolve(TEMP_DIR);
import headless from './components/headless.js';

// WebSocket setup
let io = null;
let activeSocket = null;
let activeJob = null;



/**
 * @typedef {import('./components/headless').PARAMS} Params 
 */

/** List of params that should be coerced to number */
const NUMBER_PARAMS = ['users', 'concurrency'];
/** List of params that should be coerced to boolean */
const BOOLEAN_PARAMS = ['headless', 'past', 'inject'];

/** Coerce query param values to expected types (for GET requests) */
function coerceTypes(params, method) {
    if (method !== "GET") return params; // Only coerce for GET requests

    const coerced = { ...params };
    for (const key of NUMBER_PARAMS) {
        if (key in coerced) coerced[key] = Number(coerced[key]);
    }
    for (const key of BOOLEAN_PARAMS) {
        if (key in coerced) {
            const v = coerced[key];
            // Accept "true", "1", 1 as true; "false", "0", 0 as false
            if (typeof v === 'string') {
                coerced[key] = v === 'true' || v === '1';
            } else {
                coerced[key] = Boolean(v);
            }
        }
    }
    return coerced;
}


// Initialize Socket.IO on a different port in dev mode
if (NODE_ENV === 'dev') {
	const app = express();
	const httpServer = createServer(app);
	
	io = new Server(httpServer, {
		cors: {
			origin: "*",
			methods: ["GET", "POST"]
		}
	});

	io.on('connection', (socket) => {
		console.log('Client connected');
		activeSocket = socket;

		if (activeJob) {
			activeJob.socketId = socket.id;
			activeSocket = socket;
			socket.emit('job_update', `Resuming updates for job: ${activeJob.jobId}`);
		}

		socket.on('start_job', async (data) => {
			try {
				if (activeJob) {
					activeJob.socketId = socket.id;
					activeSocket = socket;
					socket.emit('job_update', `Resuming updates for job: ${activeJob.jobId}`);
					return;
				}

				const jobId = uid(4);

				activeJob = {
					jobId,
					socketId: socket.id,
					data,
				};

				socket.emit('job_update', 'Starting browser simulation...');

				const result = await main(data);

				socket.emit('job_update', 'Simulation completed!');
				socket.emit('job_complete', result);

				activeJob = null;
				activeSocket = null;

			} catch (error) {
				console.error('Error in start_job:', error);
				socket.emit('error', error.message);
				activeJob = null;
				activeSocket = null;
			}
		});

		socket.on('disconnect', () => {
			console.log('Client disconnected');
			activeSocket = null;
		});
	});

	// Use a different port for WebSocket server
	const WS_PORT = 8081;
	httpServer.listen(WS_PORT, () => {
		console.log(`WebSocket server running on port ${WS_PORT}`);
	});
}

// Logger function that emits to websockets
export function log(message) {
	console.log(message);
	if (activeSocket && NODE_ENV === 'dev') {
		activeSocket.emit('job_update', message);
	}
}

// http entry point for cloud functions
http('entry', async (req, res) => {
	const runId = uid();
	
	// Merge query params and body params, giving precedence to body for POST, query for GET
	// For GET: coerce types!
	const mergedParams = {
		...coerceTypes(req.query || {}, req.method),
		...req.body,
		runId
	};
	let response = {};

	try {
		const { path } = req;
		const method = req.method;

		if (path === "/" && method === "GET") {
			res.set('Cache-Control', 'no-cache');
			res.status(200).sendFile("./components/ui.html", { root: process.cwd() });
			return;
		}

		// Auth: check on either method
		if (mergedParams.safeWord !== "let me in...") {
			res.status(401).send("Bro... you're not authorized to be here");
			return;
		}

		const t = timer('job');
		t.start();
		sLog(`START: ${req.path}`, mergedParams);

		// Route & run
		const [job] = route(path);
		const result = await job(mergedParams);
		t.end();
		sLog(`FINISH: ${req.path} ... ${t.report(false).human}`, result);

		//finished
		res.status(200);
		response = result;


	} catch (e) {
		console.error(`ERROR JOB: ${req.path}`, e);
		res.status(500);
		response = { error: e };
	}
	res.send(JSON.stringify(response));
});

async function main(data) {
	return await headless(data, log);
}

async function ping(data) {
	return Promise.resolve({ status: "ok", message: "service is alive", echo: data });
}

async function html() {

}


/*
----
ROUTER
----
*/


/** @typedef {'/' | '/ping'} Endpoints  */

/**
 * determine routes based on path in request
 * @param  {Endpoints} path
 */
function route(path) {
	switch (path) {
		case "/":
			return [main];
		case "/ping":
			return [ping];
		case "/simulate":
			return [main];
		default:
			throw new Error(`Invalid path: ${path}`);
	}
}
