/**
 * Configuración centralizada de la aplicación
 */
require('dotenv').config();

const config = {
	env: process.env.NODE_ENV || 'development',
	port: parseInt(process.env.PORT || '3000', 10),

	// Base de datos
	db: {
		host: process.env.PGHOST || 'localhost',
		port: parseInt(process.env.PGPORT || '5432', 10),
		user: process.env.PGUSER || 'postgres',
		password: process.env.PGPASSWORD,
		database: process.env.PGDATABASE || 'tickets',
		ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
	},

	// Sesión
	session: {
		secret: process.env.SESSION_SECRET,
		maxAge: 1000 * 60 * 60 * 8, // 8 horas
	},

	// Admin por defecto
	admin: {
		username: process.env.ADMIN_USER || 'admin',
		password: process.env.ADMIN_PASSWORD,
	},

	// Email
	smtp: {
		host: process.env.SMTP_HOST,
		port: parseInt(process.env.SMTP_PORT || '587', 10),
		secure: process.env.SMTP_SECURE === 'true',
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
		from: process.env.SMTP_FROM || 'soporte@example.com',
	},

	// App
	baseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,

	// Uploads
	uploads: {
		maxSize: 5 * 1024 * 1024, // 5MB
		allowedTypes: /jpeg|jpg|png|gif|webp/,
	},
};

// Validar configuración crítica
function validateConfig() {
	const errors = [];

	if (!config.session.secret || config.session.secret.length < 32) {
		errors.push('SESSION_SECRET debe tener al menos 32 caracteres');
	}

	if (!config.db.password) {
		errors.push('PGPASSWORD es requerido');
	}

	if (config.env === 'production') {
		if (!config.admin.password || config.admin.password === 'admin123') {
			errors.push('ADMIN_PASSWORD debe cambiarse en producción');
		}
	}

	if (errors.length > 0) {
		console.error('❌ Errores de configuración:');
		errors.forEach(e => console.error(`   - ${e}`));
		if (config.env === 'production') {
			process.exit(1);
		}
	}
}

validateConfig();

module.exports = config;
