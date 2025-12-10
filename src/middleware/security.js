/**
 * Middlewares de seguridad
 */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Configuración de Helmet para seguridad HTTP
const helmetConfig = helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:"],
			scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
			imgSrc: ["'self'", "data:", "blob:", "https:"],
			fontSrc: ["'self'", "https:", "data:"],
			connectSrc: ["'self'", "https:"],
		},
	},
	crossOriginEmbedderPolicy: false,
	crossOriginResourcePolicy: { policy: "cross-origin" },
});

// Rate limiting general
const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 100, // máximo 100 requests por ventana
	message: 'Demasiadas solicitudes, intenta de nuevo más tarde',
	standardHeaders: true,
	legacyHeaders: false,
});

// Rate limiting estricto para login
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 5, // máximo 5 intentos
	message: 'Demasiados intentos de login, intenta de nuevo en 15 minutos',
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: true,
});

// Rate limiting para creación de tickets
const ticketCreationLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hora
	max: 10, // máximo 10 tickets por hora
	message: 'Has creado demasiados tickets, intenta de nuevo más tarde',
	standardHeaders: true,
	legacyHeaders: false,
});

// Rate limiting para comentarios
const commentLimiter = rateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutos
	max: 10, // máximo 10 comentarios
	message: 'Demasiados comentarios, espera un momento',
	standardHeaders: true,
	legacyHeaders: false,
});

module.exports = {
	helmetConfig,
	generalLimiter,
	loginLimiter,
	ticketCreationLimiter,
	commentLimiter,
};
