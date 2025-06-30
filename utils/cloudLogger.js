/**
 * Cloud Run/Google Cloud Logging compatible structured logger
 * @param {string} [message] - accompanying message
 * @param {(string | JSON | object)} data - data to log; preferably structured
 * @param {string} [severity='INFO'] - google cloud severity label
 */
export function cloudLog(message = "LOG:", data = {}, severity = 'INFO') {
    // Create a structured log object (NOT stringified)
    let structuredLog = {
        severity: severity.toUpperCase(),
        message: message,
        timestamp: new Date().toISOString(),
    };

    // Add data if present
    let hasData = false;
    if (Array.isArray(data) && data.length > 0) hasData = true;
    if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) hasData = true;
    if (typeof data === 'string' && data.length > 0) hasData = true;
    if (typeof data === 'number' || typeof data === 'boolean') hasData = true;
    
    if (hasData) {
        structuredLog.data = data;
    }

    // For Cloud Run: log the object directly (don't stringify)
    console.log(structuredLog);
    
    return structuredLog;
}

/**
 * Enhanced logger with convenience methods
 */
export const logger = {
    info: (message, data) => cloudLog(message, data, 'INFO'),
    debug: (message, data) => cloudLog(message, data, 'DEBUG'),
    notice: (message, data) => cloudLog(message, data, 'NOTICE'),
    warning: (message, data) => cloudLog(message, data, 'WARNING'),
    error: (message, data) => cloudLog(message, data, 'ERROR'),
    critical: (message, data) => cloudLog(message, data, 'CRITICAL'),
};

export default cloudLog;