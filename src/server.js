const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

// Cargar configuración (incluye dotenv)
const config = require('./config');

// Middlewares de seguridad
const { helmetConfig, generalLimiter } = require('./middleware/security');
const { errorLogger, apiErrorHandler, viewErrorHandler, setupUncaughtHandlers } = require('./middleware/errorHandler');

// Base de datos
const { ensureDatabaseInitialized } = require('./db');

// Configurar manejadores de errores no capturados
setupUncaughtHandlers();

const app = express();

// Crear carpetas necesarias
const uploadDir = path.join(__dirname, '..', 'uploads');
const publicDir = path.join(__dirname, '..', 'public');
[uploadDir, publicDir].forEach(dir => {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
});

// ============================================================================
// Middlewares de Seguridad
// ============================================================================
app.use(helmetConfig);
app.use(generalLimiter);

// ============================================================================
// Configuración de Express
// ============================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// ============================================================================
// Sesiones
// ============================================================================
app.use(
	session({
		secret: config.session.secret,
		resave: false,
		saveUninitialized: false,
		name: 'sid',
		cookie: {
			maxAge: config.session.maxAge,
			httpOnly: true,
			secure: config.env === 'production',
			sameSite: 'lax',
		},
	})
);

// ============================================================================
// Archivos Estáticos
// ============================================================================
app.use('/public', express.static(publicDir, { maxAge: '1d' }));
app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

// ============================================================================
// Variables locales para vistas
// ============================================================================
app.use((req, res, next) => {
	res.locals.currentUser = req.session?.user || null;
	res.locals.currentPath = req.path;
	next();
});

// ============================================================================
// Rutas
// ============================================================================
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');

app.use('/', publicRouter);
app.use('/admin', adminRouter);

// ============================================================================
// 404
// ============================================================================
app.use((req, res) => {
	res.status(404).render('partials/404', {
		title: 'No encontrado',
		user: req.session?.user,
	});
});

// ============================================================================
// Manejo de Errores
// ============================================================================
app.use(errorLogger);
app.use(apiErrorHandler);
app.use(viewErrorHandler);

// ============================================================================
// Inicialización
// ============================================================================
async function startServer() {
	try {
		await ensureDatabaseInitialized();
		console.log('✅ Base de datos inicializada');

		app.listen(config.port, () => {
			console.log(`🚀 Servidor escuchando en http://localhost:${config.port}`);
			console.log(`📝 Entorno: ${config.env}`);
		});
	} catch (err) {
		console.error('❌ Error iniciando servidor:', err);
		process.exit(1);
	}
}

startServer();
