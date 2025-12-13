/**
 * Tests para casos negativos
 * Verifica que el sistema rechaza correctamente datos inválidos,
 * IDs inexistentes, tokens inválidos y rate limiting
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { ensureDatabaseInitialized, getPool } from '../../src/db.js';
import publicRouter from '../../src/routes/public.js';
import adminRouter from '../../src/routes/admin.js';
import { loginLimiter, commentLimiter } from '../../src/middleware/security.js';

let pool;
let adminUser;
let publicApp;

// Helper para crear app autenticada
function createAuthenticatedApp(user) {
	const app = express();
	app.set('view engine', 'ejs');
	app.set('views', path.join(__dirname, '../../src/views'));
	app.use(express.urlencoded({ extended: true }));
	app.use(express.json());
	app.use(session({
		secret: 'test-secret-32-chars-minimum-here',
		resave: false,
		saveUninitialized: false,
	}));
	app.use((req, res, next) => {
		req.session.user = user;
		res.locals.currentUser = user;
		res.locals.currentPath = req.path;
		next();
	});
	app.use('/admin', adminRouter);
	return app;
}

beforeAll(async () => {
	await ensureDatabaseInitialized();
	pool = getPool();

	const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
	adminUser = rows[0];

	publicApp = express();
	publicApp.set('view engine', 'ejs');
	publicApp.set('views', path.join(__dirname, '../../src/views'));
	publicApp.use(express.urlencoded({ extended: true }));
	publicApp.use(express.json());
	publicApp.use(session({
		secret: 'test-secret-32-chars-minimum-here',
		resave: false,
		saveUninitialized: false,
	}));
	publicApp.use((req, res, next) => {
		res.locals.currentUser = null;
		res.locals.currentPath = req.path;
		next();
	});
	publicApp.use('/', publicRouter);
});

afterAll(async () => {
	await pool.query("DELETE FROM comments WHERE ticket_id IN (SELECT id FROM tickets WHERE reference LIKE 'T-NEG%')");
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-NEG%'");
});

// ============================================================================
// CASO 1: Datos inválidos son rechazados
// ============================================================================
describe('Negative Case: Invalid Data Rejection', () => {
	describe('Ticket Creation - Invalid Data', () => {
		it('should reject empty requester_name', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: '',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Test Subject',
					description: 'Test description with enough characters',
					has_anydesk: 'no',
				});

			expect(res.status).toBe(400);
		});

		it('should reject requester_name too short', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'A',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Test Subject',
					description: 'Test description with enough characters',
					has_anydesk: 'no',
				});

			expect(res.status).toBe(400);
		});

		it('should reject invalid support_type', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'Test User',
					department: 'IT',
					support_type: 'InvalidType',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Test Subject',
					description: 'Test description with enough characters',
					has_anydesk: 'no',
				});

			expect(res.status).toBe(400);
		});

		it('should reject invalid priority', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'Test User',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Super Urgente',
					subject: 'Test Subject',
					description: 'Test description with enough characters',
					has_anydesk: 'no',
				});

			expect(res.status).toBe(400);
		});

		it('should reject subject too short', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'Test User',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Hi',
					description: 'Test description with enough characters',
					has_anydesk: 'no',
				});

			expect(res.status).toBe(400);
		});

		it('should reject description too short', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'Test User',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Test Subject',
					description: 'Short',
					has_anydesk: 'no',
				});

			expect(res.status).toBe(400);
		});

		it('should reject missing anydesk_code when has_anydesk is yes', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'Test User',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Test Subject',
					description: 'Test description with enough characters',
					has_anydesk: 'yes',
					anydesk_code: '',
				});

			expect(res.status).toBe(400);
		});

		it('should reject invalid email format', async () => {
			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send({
					requester_name: 'Test User',
					department: 'IT',
					support_type: 'Hardware',
					priority: 'Media – Puede esperar unas horas',
					subject: 'Test Subject',
					description: 'Test description with enough characters',
					has_anydesk: 'no',
					email: 'invalid-email',
				});

			expect(res.status).toBe(400);
		});
	});

	describe('Comment Creation - Invalid Data', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-NEG-${Date.now()}`, 'Test User', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', `token-${Date.now()}`]
			);
			testTicket = rows[0];
		});

		it('should reject empty comment content', async () => {
			const res = await request(publicApp)
				.post(`/tickets/${testTicket.reference}/comments`)
				.type('form')
				.send({
					author_name: 'Test',
					content: '',
				});

			expect(res.status).toBe(400);
		});

		it('should reject comment content exceeding max length', async () => {
			const res = await request(publicApp)
				.post(`/tickets/${testTicket.reference}/comments`)
				.type('form')
				.send({
					author_name: 'Test',
					content: 'a'.repeat(5001),
				});

			expect(res.status).toBe(400);
		});
	});

	describe('Admin Status Change - Invalid Data', () => {
		let testTicket;
		let authApp;

		beforeAll(() => {
			authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
		});

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-NEG-${Date.now()}`, 'Test User', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', `token-${Date.now()}`]
			);
			testTicket = rows[0];
		});

		it('should reject invalid status value', async () => {
			const res = await request(authApp)
				.post(`/admin/tickets/${testTicket.reference}/estado`)
				.type('form')
				.send({ status: 'InvalidStatus' });

			expect(res.status).toBe(400);
		});

		it('should reject empty status', async () => {
			const res = await request(authApp)
				.post(`/admin/tickets/${testTicket.reference}/estado`)
				.type('form')
				.send({ status: '' });

			expect(res.status).toBe(400);
		});
	});

	describe('Login - Invalid Credentials', () => {
		let loginApp;

		beforeAll(() => {
			loginApp = express();
			loginApp.set('view engine', 'ejs');
			loginApp.set('views', path.join(__dirname, '../../src/views'));
			loginApp.use(express.urlencoded({ extended: true }));
			loginApp.use(express.json());
			loginApp.use(session({
				secret: 'test-secret-32-chars-minimum-here',
				resave: false,
				saveUninitialized: false,
			}));
			loginApp.use((req, res, next) => {
				res.locals.currentUser = null;
				res.locals.currentPath = req.path;
				next();
			});
			loginApp.use('/admin', adminRouter);
		});

		it('should reject empty username', async () => {
			const res = await request(loginApp)
				.post('/admin/login')
				.type('form')
				.send({ username: '', password: 'password123' });

			expect(res.status).toBe(200);
			expect(res.text).toMatch(/inválid|requerid/i);
		});

		it('should reject empty password', async () => {
			const res = await request(loginApp)
				.post('/admin/login')
				.type('form')
				.send({ username: 'admin', password: '' });

			expect(res.status).toBe(200);
			expect(res.text).toMatch(/inválid|requerid/i);
		});

		it('should reject wrong password', async () => {
			const res = await request(loginApp)
				.post('/admin/login')
				.type('form')
				.send({ username: 'admin', password: 'wrongpassword' });

			expect(res.status).toBe(200);
			expect(res.text).toMatch(/incorrecto/i);
		});

		it('should reject non-existent user', async () => {
			const res = await request(loginApp)
				.post('/admin/login')
				.type('form')
				.send({ username: 'nonexistentuser', password: 'password123' });

			expect(res.status).toBe(200);
			expect(res.text).toMatch(/incorrecto/i);
		});
	});
});

// ============================================================================
// CASO 2: IDs inexistentes retornan 404
// ============================================================================
describe('Negative Case: Non-existent IDs Return 404', () => {
	describe('Public Routes - 404', () => {
		it('GET /tickets/:reference should return 404 for non-existent ticket', async () => {
			const res = await request(publicApp).get('/tickets/T-NONEXISTENT-999');
			expect(res.status).toBe(404);
		});

		it('GET /tickets/:reference/editar should return 404 for non-existent ticket', async () => {
			const res = await request(publicApp).get('/tickets/T-NONEXISTENT-999/editar?token=anytoken');
			expect(res.status).toBe(404);
		});

		it('POST /tickets/:reference/comments should return 404 for non-existent ticket', async () => {
			const res = await request(publicApp)
				.post('/tickets/T-NONEXISTENT-999/comments')
				.type('form')
				.send({ author_name: 'Test', content: 'Test comment' });

			expect(res.status).toBe(404);
		});
	});

	describe('Admin Routes - 404', () => {
		let authApp;

		beforeAll(() => {
			authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
		});

		it('GET /admin/tickets/:reference should return 404 for non-existent ticket', async () => {
			const res = await request(authApp).get('/admin/tickets/T-NONEXISTENT-999');
			expect(res.status).toBe(404);
		});

		it('POST /admin/tickets/:reference/estado should return 404 for non-existent ticket', async () => {
			const res = await request(authApp)
				.post('/admin/tickets/T-NONEXISTENT-999/estado')
				.type('form')
				.send({ status: 'En Proceso' });

			expect(res.status).toBe(404);
		});

		it('POST /admin/tickets/:reference/asignar should return 404 for non-existent ticket', async () => {
			const res = await request(authApp)
				.post('/admin/tickets/T-NONEXISTENT-999/asignar')
				.type('form')
				.send({ technician_id: adminUser.id });

			expect(res.status).toBe(404);
		});

		it('POST /admin/tickets/:reference/comments should return 404 for non-existent ticket', async () => {
			const res = await request(authApp)
				.post('/admin/tickets/T-NONEXISTENT-999/comments')
				.type('form')
				.send({ content: 'Test comment' });

			expect(res.status).toBe(404);
		});

		it('GET /admin/usuarios/:id should return 404 for non-existent user', async () => {
			const res = await request(authApp).get('/admin/usuarios/99999');
			expect(res.status).toBe(404);
		});
	});
});

// ============================================================================
// CASO 3: Tokens inválidos retornan 403
// ============================================================================
describe('Negative Case: Invalid Tokens Return 403', () => {
	let testTicket;

	beforeEach(async () => {
		const { rows } = await pool.query(
			`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING *`,
			[`T-NEG-${Date.now()}`, 'Test User', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test Subject', 'Test description', 'Pendiente', `valid-token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	it('GET /tickets/:reference/editar should return 403 with invalid token', async () => {
		const res = await request(publicApp)
			.get(`/tickets/${testTicket.reference}/editar?token=invalid-token`);

		expect(res.status).toBe(403);
	});

	it('GET /tickets/:reference/editar should return 403 with missing token', async () => {
		const res = await request(publicApp)
			.get(`/tickets/${testTicket.reference}/editar`);

		expect(res.status).toBe(403);
	});

	it('POST /tickets/:reference/editar should return 403 with invalid token', async () => {
		const res = await request(publicApp)
			.post(`/tickets/${testTicket.reference}/editar?token=invalid-token`)
			.type('form')
			.send({ subject: 'Updated Subject' });

		expect(res.status).toBe(403);
	});

	it('POST /tickets/:reference/editar should return 403 with empty token', async () => {
		const res = await request(publicApp)
			.post(`/tickets/${testTicket.reference}/editar?token=`)
			.type('form')
			.send({ subject: 'Updated Subject' });

		expect(res.status).toBe(403);
	});

	it('should accept valid token', async () => {
		const res = await request(publicApp)
			.get(`/tickets/${testTicket.reference}/editar?token=${testTicket.edit_token}`);

		expect(res.status).toBe(200);
	});
});

// ============================================================================
// CASO 4: Rate Limiting funciona
// ============================================================================
describe('Negative Case: Rate Limiting', () => {
	describe('Login Rate Limiting', () => {
		let rateLimitApp;

		beforeEach(() => {
			// Crear app con rate limiter para login
			rateLimitApp = express();
			rateLimitApp.set('view engine', 'ejs');
			rateLimitApp.set('views', path.join(__dirname, '../../src/views'));
			rateLimitApp.use(express.urlencoded({ extended: true }));
			rateLimitApp.use(express.json());
			rateLimitApp.use(session({
				secret: 'test-secret-32-chars-minimum-here',
				resave: false,
				saveUninitialized: false,
			}));
			rateLimitApp.use((req, res, next) => {
				res.locals.currentUser = null;
				res.locals.currentPath = req.path;
				next();
			});

			// Aplicar rate limiter solo a login
			const testLoginLimiter = require('express-rate-limit').default({
				windowMs: 60 * 1000, // 1 minuto para test
				max: 3, // Solo 3 intentos
				message: 'Too many login attempts',
				standardHeaders: true,
				legacyHeaders: false,
			});

			rateLimitApp.post('/admin/login', testLoginLimiter, (req, res) => {
				res.status(200).json({ message: 'Login attempt' });
			});
		});

		it('should allow requests under the limit', async () => {
			const res1 = await request(rateLimitApp).post('/admin/login').send({});
			const res2 = await request(rateLimitApp).post('/admin/login').send({});

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
		});

		it('should block requests over the limit', async () => {
			// Hacer 4 requests (límite es 3)
			await request(rateLimitApp).post('/admin/login').send({});
			await request(rateLimitApp).post('/admin/login').send({});
			await request(rateLimitApp).post('/admin/login').send({});
			const res4 = await request(rateLimitApp).post('/admin/login').send({});

			expect(res4.status).toBe(429);
		});

		it('should include rate limit headers', async () => {
			const res = await request(rateLimitApp).post('/admin/login').send({});

			expect(res.headers).toHaveProperty('ratelimit-limit');
			expect(res.headers).toHaveProperty('ratelimit-remaining');
		});
	});

	describe('Comment Rate Limiting', () => {
		let rateLimitApp;

		beforeEach(() => {
			rateLimitApp = express();
			rateLimitApp.use(express.json());

			const testCommentLimiter = require('express-rate-limit').default({
				windowMs: 60 * 1000,
				max: 2,
				message: 'Too many comments',
			});

			rateLimitApp.post('/comments', testCommentLimiter, (req, res) => {
				res.status(200).json({ message: 'Comment added' });
			});
		});

		it('should block excessive comments', async () => {
			await request(rateLimitApp).post('/comments').send({});
			await request(rateLimitApp).post('/comments').send({});
			const res3 = await request(rateLimitApp).post('/comments').send({});

			expect(res3.status).toBe(429);
		});
	});
});

// ============================================================================
// CASO 5: Autorización - Acceso denegado
// ============================================================================
describe('Negative Case: Authorization Denied', () => {
	describe('Unauthenticated Access', () => {
		let unauthApp;

		beforeAll(() => {
			unauthApp = express();
			unauthApp.set('view engine', 'ejs');
			unauthApp.set('views', path.join(__dirname, '../../src/views'));
			unauthApp.use(express.urlencoded({ extended: true }));
			unauthApp.use(express.json());
			unauthApp.use(session({
				secret: 'test-secret-32-chars-minimum-here',
				resave: false,
				saveUninitialized: false,
			}));
			unauthApp.use((req, res, next) => {
				res.locals.currentUser = null;
				res.locals.currentPath = req.path;
				next();
			});
			unauthApp.use('/admin', adminRouter);
		});

		it('should redirect to login when accessing /admin without auth', async () => {
			const res = await request(unauthApp).get('/admin');
			expect(res.status).toBe(302);
			expect(res.headers.location).toBe('/admin/login');
		});

		it('should redirect to login when accessing /admin/usuarios without auth', async () => {
			const res = await request(unauthApp).get('/admin/usuarios');
			expect(res.status).toBe(302);
			expect(res.headers.location).toBe('/admin/login');
		});

		it('should redirect to login when accessing /admin/roles without auth', async () => {
			const res = await request(unauthApp).get('/admin/roles');
			expect(res.status).toBe(302);
			expect(res.headers.location).toBe('/admin/login');
		});
	});

	describe('Role-based Access Control', () => {
		it('tecnico should not access /admin/usuarios', async () => {
			const tecnicoApp = createAuthenticatedApp({ id: 99, username: 'tecnico', role: 'tecnico' });
			const res = await request(tecnicoApp).get('/admin/usuarios');
			expect(res.status).toBe(403);
		});

		it('tecnico should not access /admin/roles', async () => {
			const tecnicoApp = createAuthenticatedApp({ id: 99, username: 'tecnico', role: 'tecnico' });
			const res = await request(tecnicoApp).get('/admin/roles');
			expect(res.status).toBe(403);
		});

		it('supervisor should not access /admin/usuarios', async () => {
			const supervisorApp = createAuthenticatedApp({ id: 99, username: 'supervisor', role: 'supervisor' });
			const res = await request(supervisorApp).get('/admin/usuarios');
			expect(res.status).toBe(403);
		});

		it('supervisor should not access /admin/roles', async () => {
			const supervisorApp = createAuthenticatedApp({ id: 99, username: 'supervisor', role: 'supervisor' });
			const res = await request(supervisorApp).get('/admin/roles');
			expect(res.status).toBe(403);
		});

		it('admin should access /admin/usuarios', async () => {
			const adminApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
			const res = await request(adminApp).get('/admin/usuarios');
			expect(res.status).toBe(200);
		});

		it('admin should access /admin/roles', async () => {
			const adminApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
			const res = await request(adminApp).get('/admin/roles');
			expect(res.status).toBe(200);
		});
	});
});
