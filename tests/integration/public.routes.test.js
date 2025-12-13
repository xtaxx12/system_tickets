/**
 * Tests de integración para rutas públicas
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Importar después de setup
import { ensureDatabaseInitialized, getPool } from '../../src/db.js';
import publicRouter from '../../src/routes/public.js';
import healthRouter from '../../src/routes/health.js';

let app;
let pool;

beforeAll(async () => {
	// Inicializar BD
	await ensureDatabaseInitialized();
	pool = getPool();

	// Crear app de test
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
		res.locals.currentUser = null;
		res.locals.currentPath = req.path;
		next();
	});

	app.use('/', healthRouter);
	app.use('/', publicRouter);
});

beforeEach(async () => {
	// Limpiar tickets de test
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-TEST%'");
});

afterAll(async () => {
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-TEST%'");
});

describe('Health Endpoints', () => {
	it('GET /health should return 200', async () => {
		const res = await request(app).get('/health');
		expect(res.status).toBe(200);
		expect(res.body.status).toBe('ok');
		expect(res.body).toHaveProperty('uptime');
	});

	it('GET /health/ready should check database', async () => {
		const res = await request(app).get('/health/ready');
		expect(res.status).toBe(200);
		expect(res.body.checks.database.status).toBe('ok');
	});

	it('GET /health/metrics should return memory info', async () => {
		const res = await request(app).get('/health/metrics');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('memory');
		expect(res.body).toHaveProperty('uptime');
	});
});

describe('Public Routes - Home', () => {
	it('GET / should render new ticket form', async () => {
		const res = await request(app).get('/');
		expect(res.status).toBe(200);
		expect(res.text).toContain('Nuevo Ticket');
	});
});

describe('Public Routes - Create Ticket', () => {
	const validTicket = {
		requester_name: 'Test User',
		department: 'IT Department',
		support_type: 'Hardware',
		priority: 'Media – Puede esperar unas horas',
		subject: 'Test ticket subject here',
		description: 'This is a test ticket description with enough characters to pass validation',
		has_anydesk: 'no',
	};

	it('POST /tickets should create ticket with valid data', async () => {
		const res = await request(app).post('/tickets').type('form').send(validTicket);

		expect(res.status).toBe(302);
		expect(res.headers.location).toMatch(/\/tickets\/T-/);
	});

	it('POST /tickets should reject empty requester_name', async () => {
		const res = await request(app)
			.post('/tickets')
			.type('form')
			.send({ ...validTicket, requester_name: '' });

		expect(res.status).toBe(400);
	});

	it('POST /tickets should reject invalid support_type', async () => {
		const res = await request(app)
			.post('/tickets')
			.type('form')
			.send({ ...validTicket, support_type: 'InvalidType' });

		expect(res.status).toBe(400);
	});

	it('POST /tickets should reject short description', async () => {
		const res = await request(app)
			.post('/tickets')
			.type('form')
			.send({ ...validTicket, description: 'Short' });

		expect(res.status).toBe(400);
	});

	it('POST /tickets should require anydesk_code when has_anydesk is yes', async () => {
		const res = await request(app)
			.post('/tickets')
			.type('form')
			.send({ ...validTicket, has_anydesk: 'yes', anydesk_code: '' });

		expect(res.status).toBe(400);
	});
});

describe('Public Routes - List Tickets', () => {
	it('GET /tickets should return ticket list', async () => {
		const res = await request(app).get('/tickets');
		expect(res.status).toBe(200);
		expect(res.text).toContain('Listado');
	});

	it('GET /tickets should support pagination', async () => {
		const res = await request(app).get('/tickets?page=1');
		expect(res.status).toBe(200);
	});

	it('GET /tickets should support status filter', async () => {
		const res = await request(app).get('/tickets?status=Pendiente');
		expect(res.status).toBe(200);
	});

	it('GET /tickets should support priority filter', async () => {
		const res = await request(app).get('/tickets?priority=Alta');
		expect(res.status).toBe(200);
	});
});

describe('Public Routes - View Ticket', () => {
	let testTicket;

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

	it('GET /tickets/:reference should show ticket details', async () => {
		const res = await request(app).get(`/tickets/${testTicket.reference}`);
		expect(res.status).toBe(200);
		expect(res.text).toContain(testTicket.reference);
	});

	it('GET /tickets/:reference should return 404 for non-existent ticket', async () => {
		const res = await request(app).get('/tickets/T-NONEXISTENT');
		expect(res.status).toBe(404);
	});
});

describe('Public Routes - Edit Ticket', () => {
	let testTicket;

	beforeEach(async () => {
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

	it('GET /tickets/:reference/editar should require valid token', async () => {
		const res = await request(app).get(`/tickets/${testTicket.reference}/editar?token=invalid`);
		expect(res.status).toBe(403);
	});

	it('GET /tickets/:reference/editar should show form with valid token', async () => {
		const res = await request(app).get(`/tickets/${testTicket.reference}/editar?token=${testTicket.edit_token}`);
		expect(res.status).toBe(200);
		expect(res.text).toContain('Editar');
	});

	it('POST /tickets/:reference/editar should update ticket with valid token', async () => {
		const res = await request(app)
			.post(`/tickets/${testTicket.reference}/editar?token=${testTicket.edit_token}`)
			.type('form')
			.send({ subject: 'Updated Subject Here' });

		expect(res.status).toBe(302);
	});

	it('POST /tickets/:reference/editar should reject invalid token', async () => {
		const res = await request(app)
			.post(`/tickets/${testTicket.reference}/editar?token=invalid`)
			.type('form')
			.send({ subject: 'Updated Subject' });

		expect(res.status).toBe(403);
	});
});

describe('Public Routes - Comments', () => {
	let testTicket;

	beforeEach(async () => {
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

	it('POST /tickets/:reference/comments should add comment', async () => {
		const res = await request(app).post(`/tickets/${testTicket.reference}/comments`).type('form').send({
			author_name: 'Commenter',
			content: 'This is a test comment',
		});

		expect(res.status).toBe(302);
	});

	it('POST /tickets/:reference/comments should reject empty content', async () => {
		const res = await request(app).post(`/tickets/${testTicket.reference}/comments`).type('form').send({
			author_name: 'Commenter',
			content: '',
		});

		expect(res.status).toBe(400);
	});
});
