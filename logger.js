/**
 * Logger utility for WebSocket and console logging
 */

let activeSocket = null;
const { NODE_ENV = "production" } = process.env;

export function setActiveSocket(socket) {
	activeSocket = socket;
}

export function log(message) {
	if (NODE_ENV !== "production") console.log(message);
	if (activeSocket) {
		activeSocket.emit('job_update', message);
	}
}