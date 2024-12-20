import { http } from '@google-cloud/functions-framework';
import { sLog, uid, timer } from 'ak-tools';
import dotenv from 'dotenv';
dotenv.config();
const { NODE_ENV = "" } = process.env;
if (!NODE_ENV) throw new Error("NODE_ENV is required");
import path from 'path';
import { tmpdir } from 'os';
let TEMP_DIR;
if (NODE_ENV === 'dev') TEMP_DIR = './tmp';
else TEMP_DIR = tmpdir();
TEMP_DIR = path.resolve(TEMP_DIR);
import headless from './components/headless.js';



/**
 * @typedef {import('./components/headless').PARAMS} Params 
 */



// http entry point
// ? https://cloud.google.com/functions/docs/writing/write-http-functions
http('entry', async (req, res) => {
	const runId = uid();
	const reqData = { url: req.url, method: req.method, headers: req.headers, body: req.body, runId };
	let response = {};

	try {
		/** @type {Params} */
		const { body = {} } = req;
		/** @type {Endpoints} */
		const { path } = req;

		if (path === "/" && req.method === "GET") {
			res.set('Cache-Control', 'no-cache');
			res.status(200).sendFile("./components/ui.html", { root: process.cwd() });
			return;
		}

		//todo: actually do auth
		if (body.safeWord !== "let me in...") {
			res.status(401).send("Bro... you're not authorized to be here");
			return;
		}

		const t = timer('job');
		t.start();
		sLog(`START: ${req.path}`, reqData);

		//setup the job
		const [job] = route(path);

		// @ts-ignore
		const result = await job(body);
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
	return await headless(data);
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
