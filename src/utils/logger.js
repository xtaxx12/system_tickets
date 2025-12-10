/**
 * Sistema de logging estructurado con Winston
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Formato personalizado para consola
const consoleFormat = winston.format.combine(
	winston.format.timestamp({ format: 'HH:mm:ss' }),
	winston.format.colorize(),
	winston.format.printf(({ timestamp, level, message, ...meta }) => {
		const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
		return `${timestamp} ${level}: ${message}${metaStr}`;
	})
);

// Formato para archivos (JSON estructurado)
const fileFormat = winston.format.combine(
	winston.format.timestamp(),
	winston.format.errors({ stack: true }),
	winston.format.json()
);

// Crear logger
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
	defaultMeta: { service: 'tickets-system' },
	transports: [
		// Errores a archivo separado
		new winston.transports.File({
			filename: path.join(logsDir, 'error.log'),
			level: 'error',
			format: fileFormat,
			maxsize: 5242880, // 5MB
			maxFiles: 5,
		}),
		// Todos los logs a archivo combinado
		new winston.transports.File({
			filename: path.join(logsDir, 'combined.log'),
			format: fileFormat,
			maxsize: 5242880, // 5MB
			maxFiles: 5,
		}),
	],
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== 'production') {
	logger.add(new winston.transports.Console({
		format: consoleFormat,
	}));
} else {
	// En producción, solo errores y warnings en consola
	logger.add(new winston.transports.Console({
		level: 'warn',
		format: consoleFormat,
	}));
}

// Helpers para logging de requests HTTP
logger.logRequest = (req, res, duration) => {
	const logData = {
		method: req.method,
		url: req.originalUrl,
		status: res.statusCode,
		duration: `${duration}ms`,
		ip: req.ip,
		userAgent: req.get('user-agent'),
		userId: req.session?.user?.id,
	};

	if (res.statusCode >= 500) {
		logger.error('Request failed', logData);
	} else if (res.statusCode >= 400) {
		logger.warn('Request error', logData);
	} else {
		logger.info('Request completed', logData);
	}
};

// Helper para errores
logger.logError = (err, req = null) => {
	const logData = {
		error: err.message,
		stack: err.stack,
		name: err.name,
		statusCode: err.statusCode,
	};

	if (req) {
		logData.method = req.method;
		logData.url = req.originalUrl;
		logData.ip = req.ip;
		logData.userId = req.session?.user?.id;
	}

	logger.error('Application error', logData);
};

// Helper para eventos de seguridad
logger.logSecurity = (event, details) => {
	logger.warn('Security event', { event, ...details });
};

// Helper para eventos de negocio
logger.logBusiness = (event, details) => {
	logger.info('Business event', { event, ...details });
};

module.exports = logger;
