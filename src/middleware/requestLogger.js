/**
 * Middleware para logging de requests HTTP
 */
const logger = require('../utils/logger');

function requestLogger(req, res, next) {
	const startTime = Date.now();

	// Capturar cuando la respuesta termine
	res.on('finish', () => {
		const duration = Date.now() - startTime;
		logger.logRequest(req, res, duration);
	});

	next();
}

module.exports = requestLogger;
