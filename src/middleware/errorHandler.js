/**
 * Manejo centralizado de errores
 */

// Clases de error personalizadas
class AppError extends Error {
	constructor(message, statusCode = 500, isOperational = true) {
		super(message);
		this.statusCode = statusCode;
		this.isOperational = isOperational;
		this.timestamp = new Date().toISOString();
		Error.captureStackTrace(this, this.constructor);
	}
}

class ValidationError extends AppError {
	constructor(message, errors = {}) {
		super(message, 400);
		this.name = 'ValidationError';
		this.errors = errors;
	}
}

class NotFoundError extends AppError {
	constructor(resource = 'Recurso') {
		super(`${resource} no encontrado`, 404);
		this.name = 'NotFoundError';
	}
}

class UnauthorizedError extends AppError {
	constructor(message = 'No autorizado') {
		super(message, 401);
		this.name = 'UnauthorizedError';
	}
}

class ForbiddenError extends AppError {
	constructor(message = 'Acceso denegado') {
		super(message, 403);
		this.name = 'ForbiddenError';
	}
}

/**
 * Wrapper para funciones async en rutas
 */
function asyncHandler(fn) {
	return (req, res, next) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}

/**
 * Logger de errores
 */
function errorLogger(err, req, res, next) {
	const logData = {
		timestamp: new Date().toISOString(),
		method: req.method,
		url: req.originalUrl,
		ip: req.ip,
		userId: req.session?.user?.id,
		error: {
			name: err.name,
			message: err.message,
			statusCode: err.statusCode,
			stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
		},
	};

	if (err.statusCode >= 500 || !err.isOperational) {
		console.error('❌ ERROR:', JSON.stringify(logData, null, 2));
	} else {
		console.warn('⚠️ Warning:', logData.error.message);
	}

	next(err);
}

/**
 * Manejador de errores para API (JSON)
 */
function apiErrorHandler(err, req, res, next) {
	if (!req.path.startsWith('/api') && !req.xhr) {
		return next(err);
	}

	const statusCode = err.statusCode || 500;
	res.status(statusCode).json({
		success: false,
		error: {
			message: err.isOperational ? err.message : 'Error interno del servidor',
			...(err.errors && { details: err.errors }),
			...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
		},
	});
}

/**
 * Manejador de errores para vistas (HTML)
 */
function viewErrorHandler(err, req, res, next) {
	const statusCode = err.statusCode || 500;

	if (statusCode === 404) {
		return res.status(404).render('partials/404', {
			title: 'No encontrado',
			user: req.session?.user,
		});
	}

	res.status(statusCode).render('admin/error', {
		title: 'Error',
		message: err.isOperational ? err.message : 'Ha ocurrido un error inesperado',
		user: req.session?.user,
	});
}

/**
 * Manejador de errores no capturados
 */
function setupUncaughtHandlers() {
	process.on('uncaughtException', (err) => {
		console.error('❌ UNCAUGHT EXCEPTION:', err);
		process.exit(1);
	});

	process.on('unhandledRejection', (reason, promise) => {
		console.error('❌ UNHANDLED REJECTION:', reason);
	});
}

module.exports = {
	AppError,
	ValidationError,
	NotFoundError,
	UnauthorizedError,
	ForbiddenError,
	asyncHandler,
	errorLogger,
	apiErrorHandler,
	viewErrorHandler,
	setupUncaughtHandlers,
};
