/**
 * Helper para crear instancia de app para tests
 */
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTestApp() {
	const app = express();

	app.set('view engine', 'ejs');
	app.set('views', path.join(__dirname, '../../src/views'));

	app.use(express.urlencoded({ extended: true }));
	app.use(express.json());

	app.use(
		session({
			secret: 'test-secret-key-minimum-32-characters',
			resave: false,
			saveUninitialized: false,
			cookie: { maxAge: 1000 * 60 * 60 },
		})
	);

	// Variables locales para vistas
	app.use((req, res, next) => {
		res.locals.currentUser = req.session?.user || null;
		res.locals.currentPath = req.path;
		next();
	});

	return app;
}

/**
 * Helper para simular sesión autenticada
 */
export function mockSession(app, user) {
	app.use((req, res, next) => {
		req.session.user = user;
		next();
	});
}

/**
 * Usuarios de prueba
 */
export const testUsers = {
	admin: { id: 1, username: 'admin', role: 'admin' },
	supervisor: { id: 2, username: 'supervisor1', role: 'supervisor' },
	tecnico: { id: 3, username: 'tecnico1', role: 'tecnico' },
};

/**
 * Datos de ticket válido
 */
export const validTicketData = {
	requester_name: 'Test User',
	department: 'IT Department',
	support_type: 'Hardware',
	priority: 'Media – Puede esperar unas horas',
	subject: 'Test ticket subject',
	description: 'This is a test ticket description with enough characters',
	has_anydesk: 'no',
};
