/**
 * Tests E2E para flujos críticos del sistema
 * Verifica que los flujos completos funcionen correctamente
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
	app.use('/', publicRouter);
	return app;
}

beforeAll(async () => {
	await ensureDatabaseInitialized();
	pool = getPool();

	// Obtener usuario admin
	const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
	adminUser = rows[0];

	// App pública
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
	// Limpiar datos de test
	await pool.query("DELETE FROM notifications WHERE ticket_id IN (SELECT id FROM tickets WHERE reference LIKE 'T-FLOW%')");
	await pool.query("DELETE FROM comments WHERE ticket_id IN (SELECT id FROM tickets WHERE reference LIKE 'T-FLOW%')");
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-FLOW%'");
});

// ============================================================================
// FLUJO 1: Creación de ticket completo
// ============================================================================
describe('Critical Flow: Ticket Creation', () => {
	const validTicket = {
		requester_name: 'Flow Test User',
		department: 'IT Department',
		support_type: 'Hardware',
		priority: 'Alta – Necesita atención pronto',
		subject: 'Flow Test - Ticket Creation',
		description: 'This is a complete flow test for ticket creation with all required fields',
		has_anydesk: 'no',
		email: 'flowtest@example.com',
	};

	it('should create ticket and redirect to confirmation', async () => {
		const res = await request(publicApp)
			.post('/tickets')
			.type('form')
			.send(validTicket);

		expect(res.status).toBe(302);
		expect(res.headers.location).toMatch(/\/tickets\/T-/);

		// Extraer referencia del ticket
		const reference = res.headers.location.split('/tickets/')[1];

		// Verificar que el ticket existe en BD
		const { rows } = await pool.query(
			'SELECT * FROM tickets WHERE reference = $1',
			[reference]
		);
		expect(rows.length).toBe(1);
		expect(rows[0].requester_name).toBe(validTicket.requester_name);
		expect(rows[0].status).toBe('Pendiente');
		expect(rows[0].edit_token).toBeTruthy();
	});

	it('should create ticket with AnyDesk code', async () => {
		const ticketWithAnydesk = {
			...validTicket,
			subject: 'Flow Test - With AnyDesk',
			has_anydesk: 'yes',
			anydesk_code: '123456789',
		};

		const res = await request(publicApp)
			.post('/tickets')
			.type('form')
			.send(ticketWithAnydesk);

		expect(res.status).toBe(302);

		const reference = res.headers.location.split('/tickets/')[1];
		const { rows } = await pool.query(
			'SELECT * FROM tickets WHERE reference = $1',
			[reference]
		);
		expect(rows[0].has_anydesk).toBe(true);
		expect(rows[0].anydesk_code).toBe('123456789');
	});
});

// ============================================================================
// FLUJO 2: Login/Logout completo
// ============================================================================
describe('Critical Flow: Login/Logout', () => {
	let loginApp;
	let agent;

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
			res.locals.currentUser = req.session?.user || null;
			res.locals.currentPath = req.path;
			next();
		});
		loginApp.use('/admin', adminRouter);
	});

	it('should complete full login flow', async () => {
		agent = request.agent(loginApp);

		// 1. Acceder a login page
		const loginPage = await agent.get('/admin/login');
		expect(loginPage.status).toBe(200);

		// 2. Hacer login con credenciales válidas
		const loginRes = await agent
			.post('/admin/login')
			.type('form')
			.send({
				username: process.env.ADMIN_USER || 'admin',
				password: process.env.ADMIN_PASSWORD || 'testadmin123',
			});

		expect(loginRes.status).toBe(302);
		expect(loginRes.headers.location).toBe('/admin');

		// 3. Acceder al dashboard (debería funcionar con sesión)
		const dashboardRes = await agent.get('/admin');
		expect(dashboardRes.status).toBe(200);
		expect(dashboardRes.text).toContain('Panel');
	});

	it('should complete logout flow', async () => {
		agent = request.agent(loginApp);

		// Login primero
		await agent
			.post('/admin/login')
			.type('form')
			.send({
				username: process.env.ADMIN_USER || 'admin',
				password: process.env.ADMIN_PASSWORD || 'testadmin123',
			});

		// Logout
		const logoutRes = await agent.get('/admin/logout');
		expect(logoutRes.status).toBe(302);
		expect(logoutRes.headers.location).toBe('/admin/login');

		// Intentar acceder al dashboard después de logout
		const afterLogout = await agent.get('/admin');
		expect(afterLogout.status).toBe(302);
		expect(afterLogout.headers.location).toBe('/admin/login');
	});
});

// ============================================================================
// FLUJO 3: Cambio de estado completo
// ============================================================================
describe('Critical Flow: Status Change', () => {
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
			[`T-FLOW-${Date.now()}`, 'Flow User', 'IT', 'Software', 'Media – Puede esperar unas horas', 'Status Flow Test', 'Testing status changes', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	it('should change status through all valid states', async () => {
		const statuses = ['En Proceso', 'Resuelto', 'Cerrado'];

		for (const status of statuses) {
			const res = await request(authApp)
				.post(`/admin/tickets/${testTicket.reference}/estado`)
				.type('form')
				.send({ status });

			expect(res.status).toBe(302);

			// Verificar en BD
			const { rows } = await pool.query(
				'SELECT status FROM tickets WHERE reference = $1',
				[testTicket.reference]
			);
			expect(rows[0].status).toBe(status);
		}
	});

	it('should update updated_at timestamp on status change', async () => {
		const originalUpdatedAt = testTicket.updated_at;

		// Esperar un momento para asegurar diferencia de tiempo
		await new Promise(resolve => setTimeout(resolve, 100));

		await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/estado`)
			.type('form')
			.send({ status: 'En Proceso' });

		const { rows } = await pool.query(
			'SELECT updated_at FROM tickets WHERE reference = $1',
			[testTicket.reference]
		);

		expect(new Date(rows[0].updated_at).getTime()).toBeGreaterThan(
			new Date(originalUpdatedAt).getTime()
		);
	});
});

// ============================================================================
// FLUJO 4: Asignación de tickets
// ============================================================================
describe('Critical Flow: Ticket Assignment', () => {
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
			[`T-FLOW-${Date.now()}`, 'Flow User', 'IT', 'Hardware', 'Alta – Necesita atención pronto', 'Assignment Flow Test', 'Testing ticket assignment', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	it('should assign ticket to technician', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/asignar`)
			.type('form')
			.send({ technician_id: adminUser.id });

		expect(res.status).toBe(302);

		// Verificar asignación en BD
		const { rows } = await pool.query(
			'SELECT assigned_to FROM tickets WHERE reference = $1',
			[testTicket.reference]
		);
		expect(rows[0].assigned_to).toBe(adminUser.id);
	});

	it('should reassign ticket to different technician', async () => {
		// Asignar primero
		await pool.query(
			'UPDATE tickets SET assigned_to = $1 WHERE reference = $2',
			[adminUser.id, testTicket.reference]
		);

		// Obtener otro usuario si existe
		const { rows: users } = await pool.query(
			"SELECT id FROM users WHERE id != $1 LIMIT 1",
			[adminUser.id]
		);

		if (users.length > 0) {
			const res = await request(authApp)
				.post(`/admin/tickets/${testTicket.reference}/asignar`)
				.type('form')
				.send({ technician_id: users[0].id });

			expect(res.status).toBe(302);

			const { rows } = await pool.query(
				'SELECT assigned_to FROM tickets WHERE reference = $1',
				[testTicket.reference]
			);
			expect(rows[0].assigned_to).toBe(users[0].id);
		}
	});

	it('should unassign ticket', async () => {
		// Asignar primero
		await pool.query(
			'UPDATE tickets SET assigned_to = $1 WHERE reference = $2',
			[adminUser.id, testTicket.reference]
		);

		// Desasignar
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/asignar`)
			.type('form')
			.send({ technician_id: '' });

		expect(res.status).toBe(302);

		const { rows } = await pool.query(
			'SELECT assigned_to FROM tickets WHERE reference = $1',
			[testTicket.reference]
		);
		expect(rows[0].assigned_to).toBeNull();
	});
});

// ============================================================================
// FLUJO 5: Comentarios completos
// ============================================================================
describe('Critical Flow: Comments', () => {
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
			[`T-FLOW-${Date.now()}`, 'Flow User', 'IT', 'Software', 'Baja – No es urgente', 'Comments Flow Test', 'Testing comments flow', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	it('should add public comment from admin', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({
				content: 'This is a public admin comment',
				is_internal: 'false',
			});

		expect(res.status).toBe(302);

		// Verificar comentario en BD
		const { rows } = await pool.query(
			'SELECT * FROM comments WHERE ticket_id = $1 AND is_internal = false',
			[testTicket.id]
		);
		expect(rows.length).toBe(1);
		expect(rows[0].content).toBe('This is a public admin comment');
		expect(rows[0].user_id).toBe(adminUser.id);
	});

	it('should add internal comment (not visible to public)', async () => {
		const res = await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({
				content: 'This is an internal note',
				is_internal: 'true',
			});

		expect(res.status).toBe(302);

		// Verificar comentario interno en BD
		const { rows } = await pool.query(
			'SELECT * FROM comments WHERE ticket_id = $1 AND is_internal = true',
			[testTicket.id]
		);
		expect(rows.length).toBe(1);
		expect(rows[0].is_internal).toBe(true);
	});

	it('should add public comment from anonymous user', async () => {
		const res = await request(publicApp)
			.post(`/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({
				author_name: 'Anonymous User',
				content: 'Public comment from user',
			});

		expect(res.status).toBe(302);

		const { rows } = await pool.query(
			'SELECT * FROM comments WHERE ticket_id = $1 AND author_name = $2',
			[testTicket.id, 'Anonymous User']
		);
		expect(rows.length).toBe(1);
		expect(rows[0].user_id).toBeNull();
	});

	it('should preserve comment order (newest last)', async () => {
		// Agregar múltiples comentarios
		await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({ content: 'First comment', is_internal: 'false' });

		await new Promise(resolve => setTimeout(resolve, 50));

		await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({ content: 'Second comment', is_internal: 'false' });

		const { rows } = await pool.query(
			'SELECT content FROM comments WHERE ticket_id = $1 ORDER BY created_at ASC',
			[testTicket.id]
		);

		expect(rows[0].content).toBe('First comment');
		expect(rows[1].content).toBe('Second comment');
	});
});

// ============================================================================
// FLUJO 6: Notificaciones
// ============================================================================
describe('Critical Flow: Notifications', () => {
	let authApp;

	beforeAll(() => {
		authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
	});

	beforeEach(async () => {
		// Limpiar notificaciones del admin
		await pool.query('DELETE FROM notifications WHERE user_id = $1', [adminUser.id]);
	});

	it('should create notification when ticket is assigned', async () => {
		// Crear ticket
		const { rows: ticketRows } = await pool.query(
			`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING *`,
			[`T-FLOW-${Date.now()}`, 'Notif User', 'IT', 'Hardware', 'Alta – Necesita atención pronto', 'Notification Test', 'Testing notifications', 'Pendiente', `token-${Date.now()}`]
		);
		const ticket = ticketRows[0];

		// Asignar ticket (esto debería crear notificación)
		await request(authApp)
			.post(`/admin/tickets/${ticket.reference}/asignar`)
			.type('form')
			.send({ technician_id: adminUser.id });

		// Verificar que se creó notificación
		const { rows: notifications } = await pool.query(
			`SELECT * FROM notifications WHERE user_id = $1 AND ticket_id = $2 AND type = 'ticket_assigned'`,
			[adminUser.id, ticket.id]
		);

		expect(notifications.length).toBe(1);
		expect(notifications[0].title).toContain('asignado');
	});

	it('should fetch notifications via API', async () => {
		// Crear notificación de prueba
		await pool.query(
			`INSERT INTO notifications (user_id, type, title, message)
			 VALUES ($1, $2, $3, $4)`,
			[adminUser.id, 'test', 'Test Notification', 'This is a test']
		);

		const res = await request(authApp).get('/admin/notifications');

		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('notifications');
		expect(res.body).toHaveProperty('count');
		expect(res.body.notifications.length).toBeGreaterThan(0);
	});

	it('should mark all notifications as read', async () => {
		// Crear notificaciones no leídas
		await pool.query(
			`INSERT INTO notifications (user_id, type, title, message, is_read)
			 VALUES ($1, $2, $3, $4, false), ($1, $2, $3, $4, false)`,
			[adminUser.id, 'test', 'Unread', 'Test message']
		);

		// Marcar todas como leídas
		const res = await request(authApp).post('/admin/notifications/read-all');
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);

		// Verificar que todas están leídas
		const { rows } = await pool.query(
			'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
			[adminUser.id]
		);
		expect(parseInt(rows[0].count)).toBe(0);
	});

	it('should return unread count', async () => {
		// Crear notificaciones mixtas
		await pool.query(
			`INSERT INTO notifications (user_id, type, title, message, is_read)
			 VALUES ($1, 'test', 'Unread 1', 'msg', false),
			        ($1, 'test', 'Unread 2', 'msg', false),
			        ($1, 'test', 'Read', 'msg', true)`,
			[adminUser.id]
		);

		const res = await request(authApp).get('/admin/notifications');

		expect(res.status).toBe(200);
		expect(res.body.count).toBe(2); // Solo las no leídas
	});
});
