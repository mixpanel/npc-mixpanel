/**
 * Logger utility for WebSocket and console logging
 */

const { NODE_ENV = 'production' } = process.env;

export function log(message, meepleId = null, socket = null) {
	if (NODE_ENV !== 'production') console.log(message);
	if (socket) {
		socket.emit('job_update', { message, meepleId });
	}
}
