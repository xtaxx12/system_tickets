/**
 * Tests de seguridad
 * Verifica autenticación, permisos, uploads seguros, SQL injection y XSS
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
import { ALLOWED_MIME_TYPES } from '../../src/middleware/upload.js';

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

// Helper para crear app sin autenticación
function createUnauthenticatedApp() {
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
		res.locals.currentUser = null;
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

	const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
	adminUser = rows[0];

	publicApp = createUnauthenticatedApp();
});

afterAll(async () => {
	await pool.query("DELETE FROM comments WHERE ticket_id IN (SELECT id FROM tickets WHERE reference LIKE 'T-SEC%')");
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-SEC%'");
});

// ============================================================================
// SEGURIDAD 1: Rutas admin requieren autenticación
// ============================================================================
describe('Security: Admin Routes Require Authentication', () => {
	let unauthApp;

	beforeAll(() => {
		unauthApp = createUnauthenticatedApp();
	});

	const protectedRoutes = [
		{ method: 'get', path: '/admin' },
		{ method: 'get', path: '/admin/usuarios' },
		{ method: 'get', path: '/admin/roles' },
		{ method: 'get', path: '/admin/perfil' },
		{ method: 'get', path: '/admin/notifications' },
	];

	protectedRoutes.forEach(({ method, path }) => {
		it(`${method.toUpperCase()} ${path} should redirect to login without auth`, async () => {
			const res = await request(unauthApp)[method](path);
			expect(res.status).toBe(302);
			expect(res.headers.location).toBe('/admin/login');
		});
	});

	it('GET /admin/login should be accessible without auth', async () => {
		const res = await request(unauthApp).get('/admin/login');
		expect(res.status).toBe(200);
	});
});

// ============================================================================
// SEGURIDAD 2: Permisos se verifican correctamente
// ============================================================================
describe('Security: Permissions Verified Correctly', () => {
	describe('Role-based Access Control', () => {
		it('admin can access all admin routes', async () => {
			const adminApp = createAuthenticatedApp({ 
				id: adminUser.id, 
				username: 'admin', 
				role: 'admin' 
			});

			const routes = ['/admin', '/admin/usuarios', '/admin/roles', '/admin/perfil'];
			
			for (const route of routes) {
				const res = await request(adminApp).get(route);
				expect(res.status).toBe(200);
			}
		});

		it('supervisor cannot access user management', async () => {
			const supervisorApp = createAuthenticatedApp({ 
				id: 99, 
				username: 'supervisor', 
				role: 'supervisor' 
			});

			const usersRes = await request(supervisorApp).get('/admin/usuarios');
			expect(usersRes.status).toBe(403);
		});

		it('tecnico cannot access user management', async () => {
			const tecnicoApp = createAuthenticatedApp({ 
				id: 99, 
				username: 'tecnico', 
				role: 'tecnico' 
			});

			const usersRes = await request(tecnicoApp).get('/admin/usuarios');
			expect(usersRes.status).toBe(403);
		});
	});
});

// ============================================================================
// SEGURIDAD 3: Uploads solo aceptan imágenes
// ============================================================================
describe('Security: Uploads Only Accept Images', () => {
	it('should verify ALLOWED_MIME_TYPES only contains image types', () => {
		const allowedTypes = Object.keys(ALLOWED_MIME_TYPES);
		
		allowedTypes.forEach(mimeType => {
			expect(mimeType).toMatch(/^image\//);
		});
	});

	it('should have correct extensions for MIME types', () => {
		expect(ALLOWED_MIME_TYPES['image/jpeg']).toBe('jpg');
		expect(ALLOWED_MIME_TYPES['image/png']).toBe('png');
		expect(ALLOWED_MIME_TYPES['image/gif']).toBe('gif');
		expect(ALLOWED_MIME_TYPES['image/webp']).toBe('webp');
	});

	it('should not allow dangerous MIME types', () => {
		const dangerousTypes = [
			'application/x-msdownload',
			'application/x-php',
			'application/javascript',
			'text/html',
			'application/x-sh',
		];

		dangerousTypes.forEach(type => {
			expect(ALLOWED_MIME_TYPES[type]).toBeUndefined();
		});
	});
});

// ============================================================================
// SEGURIDAD 4: No hay SQL Injection
// ============================================================================
describe('Security: No SQL Injection', () => {
	let testTicket;

	beforeEach(async () => {
		const { rows } = await pool.query(
			`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING *`,
			[`T-SEC-${Date.now()}`, 'Test User', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'SQL Test', 'Testing SQL injection', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	it('should safely handle SQL injection in ticket reference', async () => {
		const maliciousRef = "T-123'; DROP TABLE tickets; --";
		const res = await request(publicApp).get(`/tickets/${encodeURIComponent(maliciousRef)}`);
		
		// Should return 404, not crash or execute SQL
		expect(res.status).toBe(404);
		
		// Verify tickets table still exists
		const { rows } = await pool.query('SELECT COUNT(*) FROM tickets');
		expect(rows).toBeDefined();
	});

	it('should safely handle SQL injection in status filter', async () => {
		const authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
		const maliciousStatus = "Pendiente'; DELETE FROM tickets; --";
		
		const res = await request(authApp).get(`/admin?status=${encodeURIComponent(maliciousStatus)}`);
		
		expect(res.status).toBe(200);
		
		// Verify data wasn't deleted
		const { rows } = await pool.query('SELECT COUNT(*) as count FROM tickets');
		expect(parseInt(rows[0].count)).toBeGreaterThan(0);
	});

	it('should safely handle SQL injection in comments', async () => {
		const maliciousComment = {
			author_name: "Hacker",
			content: "Nice ticket'); DELETE FROM comments; --",
		};

		const res = await request(publicApp)
			.post(`/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send(maliciousComment);

		expect(res.status).toBe(302);

		// Verify comments table still exists
		const { rows } = await pool.query('SELECT COUNT(*) as count FROM comments WHERE ticket_id = $1', [testTicket.id]);
		expect(parseInt(rows[0].count)).toBeGreaterThanOrEqual(0);
	});

	it('should safely handle SQL injection in login', async () => {
		const unauthApp = createUnauthenticatedApp();
		const maliciousLogin = {
			username: "admin'--",
			password: "anything",
		};

		const res = await request(unauthApp)
			.post('/admin/login')
			.type('form')
			.send(maliciousLogin);

		// Should fail login, not bypass authentication
		expect(res.status).toBe(200);
	});
});

// ============================================================================
// SEGURIDAD 5: No hay XSS en comentarios (EJS escapa automáticamente)
// ============================================================================
describe('Security: XSS Prevention', () => {
	let testTicket;

	beforeEach(async () => {
		const { rows } = await pool.query(
			`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING *`,
			[`T-SEC-${Date.now()}`, 'Test User', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'XSS Test', 'Testing XSS prevention', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	it('should store XSS payload in DB (EJS escapes on render)', async () => {
		const xssPayload = '<script>alert("XSS")</script>';

		await request(publicApp)
			.post(`/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({
				author_name: 'Tester',
				content: xssPayload,
			});

		// Check what's stored in DB - should be raw (EJS escapes on output)
		const { rows } = await pool.query(
			'SELECT content FROM comments WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1',
			[testTicket.id]
		);

		expect(rows.length).toBe(1);
		// Content is stored as-is, EJS will escape it when rendering
		expect(rows[0].content).toBe(xssPayload);
	});

	it('should escape HTML entities in rendered output', async () => {
		// Add comment with HTML
		await pool.query(
			`INSERT INTO comments (ticket_id, author_name, content, is_internal) VALUES ($1, $2, $3, false)`,
			[testTicket.id, 'Test', '<b>bold</b>']
		);

		const res = await request(publicApp).get(`/tickets/${testTicket.reference}`);
		
		expect(res.status).toBe(200);
		// EJS escapes < and > to &lt; and &gt;
		expect(res.text).toContain('&lt;b&gt;');
	});
});

// ============================================================================
// SEGURIDAD 6: Headers de seguridad
// ============================================================================
describe('Security: Security Headers', () => {
	it('should have proper content type', async () => {
		const res = await request(publicApp).get('/');
		expect(res.headers['content-type']).toContain('text/html');
	});
});

// ============================================================================
// SEGURIDAD 7: Session Security
// ============================================================================
describe('Security: Session Management', () => {
	it('should not expose session data in response', async () => {
		const authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
		const res = await request(authApp).get('/admin');
		
		expect(res.text).not.toContain('password_hash');
		expect(res.text).not.toContain('SESSION_SECRET');
	});
});
