/**
 * Logger utility for WebSocket and console logging
 */

let activeSocket = null;

export function setActiveSocket(socket) {
    activeSocket = socket;
}

export function log(message) {
    console.log(message);
    if (activeSocket) {
        activeSocket.emit('job_update', message);
    }
}