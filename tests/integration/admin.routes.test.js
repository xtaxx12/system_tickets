/**
 * Tests de integración para rutas admin
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { ensureDatabaseInitialized, getPool } from '../../src/db.js';
import adminRouter from '../../src/routes/admin.js';

let app;
let pool;
let adminUser;
let testTicket;

// Helper para crear sesión autenticada
function createAuthenticatedApp(user) {
	const authApp = express();
	authApp.set('view engine', 'ejs');
	authApp.set('views', path.join(__dirname, '../../src/views'));
	authApp.use(express.urlencoded({ extended: true }));
	authApp.use(express.json());
	authApp.use(
		session({
			secret: 'test-secret-32-chars-minimum-here',
			resave: false,
			saveUninitialized: false,
		})
	);

	// Inyectar sesión de usuario
	authApp.use((req, res, next) => {
		req.session.user = user;
		res.locals.currentUser = user;
		res.locals.currentPath = req.path;
		next();
	});

	authApp.use('/admin', adminRouter);
	return authApp;
}

beforeAll(async () => {
	await ensureDatabaseInitialized();
	pool = getPool();

	// Obtener usuario admin
	const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
	adminUser = rows[0];

	// App sin autenticación para tests de login
	app = express();
	app.set('view engine', 'ejs');
	app.set('views', path.join(__dirname, '../../src/views'));
	app.use(express.urlencoded({ extended: true }));
	app.use(express.json());
	app.use(
		session({
			secret: 'test-secret-32-chars-minimum-here',
			resave: false,
			saveUninitialized: false,
		})
	);
	app.use((req, res, next) => {
		res.locals.currentUser = req.session?.user || null;
		res.locals.currentPath = req.path;
		next();
	});
	app.use('/admin', adminRouter);
});

beforeEach(async () => {
	// Crear ticket de prueba
	const { rows } = await pool.query(
		`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING *`,
		[
			`T-TEST-${Date.now()}`,
			'Test User',
			'IT',
			'Hardware',
			'Media – Puede esperar unas horas',
			'Test Subject',
			'Test description here',
			'Pendiente',
			`token-${Date.now()}`,
		]
	);
	testTicket = rows[0];
});

afterAll(async () => {
	await pool.query("DELETE FROM comments WHERE ticket_id IN (SELECT id FROM tickets WHERE reference LIKE 'T-TEST%')");
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-TEST%'");
});

// ============================================================================
// Tests de Autenticación
// ============================================================================
describe('Admin Authentication', () => {
	it('GET /admin/login should render login page', async () => {
		const res = await request(app).get('/admin/login');
		expect(res.status).toBe(200);
		expect(res.text).toContain('login');
	});

	it('GET /admin should redirect to login when not authenticated', async () => {
		const res = await request(app).get('/admin');
		expect(res.status).toBe(302);
		expect(res.headers.location).toBe('/admin/login');
	});

	it('POST /admin/login should reject empty credentials', async () => {
		const res = await request(app).post('/admin/login').type('form').send({ username: '', password: '' });

		expect(res.status).toBe(200);
		expect(res.text).toContain('inválid');
	});

	it('POST /admin/login should reject wrong password', async () => {
		const res = await request(app).post('/admin/login').type('form').send({
			username: 'admin',
			password: 'wrongpassword',
		});

		expect(res.status).toBe(200);
		expect(res.text).toContain('incorrecto');
	});

	it('POST /admin/login should accept valid credentials', async () => {
		const res = await request(app).post('/admin/login').type('form').send({
			username: process.env.ADMIN_USER || 'admin',
			password: process.env.ADMIN_PASSWORD || 'testadmin123',
		});

		expect(res.status).toBe(302);
		expect(res.headers.location).toBe('/admin');
	});
});

// ============================================================================
// Tests de Dashboard (requiere autenticación)
// ============================================================================
describe('Admin Dashboard', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('GET /admin should show dashboard when authenticated', async () => {
		const res = await request(authApp).get('/admin');
		expect(res.status).toBe(200);
		expect(res.text).toContain('Panel');
	});

	it('GET /admin should support status filter', async () => {
		const res = await request(authApp).get('/admin?status=Pendiente');
		expect(res.status).toBe(200);
	});

	it('GET /admin should support my_tickets filter', async () => {
		const res = await request(authApp).get('/admin?my_tickets=true');
		expect(res.status).toBe(200);
	});

	it('GET /admin should support pagination', async () => {
		const res = await request(authApp).get('/admin?page=1');
		expect(res.status).toBe(200);
	});
});

// ============================================================================
// Tests de Detalle de Ticket
// ============================================================================
describe('Admin Ticket Detail', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('GET /admin/tickets/:reference should show ticket details', async () => {
		const res = await request(authApp).get(`/admin/tickets/${testTicket.reference}`);
		expect(res.status).toBe(200);
		expect(res.text).toContain(testTicket.reference);
	});

	it('GET /admin/tickets/:reference should return 404 for non-existent', async () => {
		const res = await request(authApp).get('/admin/tickets/T-NONEXISTENT');
		expect(res.status).toBe(404);
	});
});

// ============================================================================
// Tests de Cambio de Estado
// ============================================================================
describe('Admin Change Status', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('POST /admin/tickets/:reference/estado should change status', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/estado`)
			.type('form')
			.send({ status: 'En Proceso' });

		expect(res.status).toBe(302);

		// Verificar cambio en BD
		const { rows } = await pool.query('SELECT status FROM tickets WHERE reference = $1', [testTicket.reference]);
		expect(rows[0].status).toBe('En Proceso');
	});

	it('POST /admin/tickets/:reference/estado should reject invalid status', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/estado`)
			.type('form')
			.send({ status: 'InvalidStatus' });

		expect(res.status).toBe(400);
	});
});

// ============================================================================
// Tests de Asignación
// ============================================================================
describe('Admin Assign Ticket', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('POST /admin/tickets/:reference/asignar should assign technician', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/asignar`)
			.type('form')
			.send({ technician_id: adminUser.id });

		expect(res.status).toBe(302);

		// Verificar asignación
		const { rows } = await pool.query('SELECT assigned_to FROM tickets WHERE reference = $1', [testTicket.reference]);
		expect(rows[0].assigned_to).toBe(adminUser.id);
	});

	it('POST /admin/tickets/:reference/asignar should allow unassign', async () => {
		// Primero asignar
		await pool.query('UPDATE tickets SET assigned_to = $1 WHERE reference = $2', [adminUser.id, testTicket.reference]);

		// Luego desasignar
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/asignar`)
			.type('form')
			.send({ technician_id: '' });

		expect(res.status).toBe(302);

		const { rows } = await pool.query('SELECT assigned_to FROM tickets WHERE reference = $1', [testTicket.reference]);
		expect(rows[0].assigned_to).toBeNull();
	});
});

// ============================================================================
// Tests de Comentarios Admin
// ============================================================================
describe('Admin Comments', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('POST /admin/tickets/:reference/comments should add public comment', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({ content: 'Admin comment here', is_internal: 'false' });

		expect(res.status).toBe(302);

		// Verificar comentario
		const { rows } = await pool.query('SELECT * FROM comments WHERE ticket_id = $1', [testTicket.id]);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0].is_internal).toBe(false);
	});

	it('POST /admin/tickets/:reference/comments should add internal comment', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({ content: 'Internal note here', is_internal: 'true' });

		expect(res.status).toBe(302);

		const { rows } = await pool.query('SELECT * FROM comments WHERE ticket_id = $1 AND is_internal = true', [
			testTicket.id,
		]);
		expect(rows.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// Tests de Autorización por Rol
// ============================================================================
describe('Admin Role Authorization', () => {
	it('tecnico should not access /admin/usuarios', async () => {
		const tecnicoApp = createAuthenticatedApp({ id: 3, username: 'tecnico1', role: 'tecnico' });
		const res = await request(tecnicoApp).get('/admin/usuarios');
		expect(res.status).toBe(403);
	});

	it('supervisor should not access /admin/usuarios', async () => {
		const supervisorApp = createAuthenticatedApp({ id: 2, username: 'supervisor1', role: 'supervisor' });
		const res = await request(supervisorApp).get('/admin/usuarios');
		expect(res.status).toBe(403);
	});

	it('admin should access /admin/usuarios', async () => {
		const adminApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
		const res = await request(adminApp).get('/admin/usuarios');
		expect(res.status).toBe(200);
	});
});

// ============================================================================
// Tests de Notificaciones
// ============================================================================
describe('Admin Notifications', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('GET /admin/notifications should return JSON', async () => {
		const res = await request(authApp).get('/admin/notifications');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('notifications');
		expect(res.body).toHaveProperty('count');
	});

	it('POST /admin/notifications/read-all should mark all as read', async () => {
		const res = await request(authApp).post('/admin/notifications/read-all');
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
	});
});

// ============================================================================
// Tests de Perfil
// ============================================================================
describe('Admin Profile', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	it('GET /admin/perfil should show profile page', async () => {
		const res = await request(authApp).get('/admin/perfil');
		expect(res.status).toBe(200);
		expect(res.text).toContain('Perfil');
	});
});
