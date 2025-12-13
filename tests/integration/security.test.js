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
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { ensureDatabaseInitialized, getPool } from '../../src/db.js';
import publicRouter from '../../src/routes/public.js';
import adminRouter from '../../src/routes/admin.js';
import { upload, handleUploadError, ALLOWED_MIME_TYPES } from '../../src/middleware/upload.js';

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
		{ method: 'get', path: '/admin/tickets/T-123456' },
		{ method: 'get', path: '/admin/usuarios' },
		{ method: 'get', path: '/admin/roles' },
		{ method: 'get', path: '/admin/perfil' },
		{ method: 'get', path: '/admin/notifications' },
		{ method: 'post', path: '/admin/tickets/T-123456/estado' },
		{ method: 'post', path: '/admin/tickets/T-123456/asignar' },
		{ method: 'post', path: '/admin/tickets/T-123456/comments' },
		{ method: 'post', path: '/admin/notifications/read-all' },
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

	it('POST /admin/login should be accessible without auth', async () => {
		const res = await request(unauthApp)
			.post('/admin/login')
			.type('form')
			.send({ username: 'test', password: 'test' });
		// Should return 200 (with error message) not redirect
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

		it('supervisor can access dashboard but not user management', async () => {
			const supervisorApp = createAuthenticatedApp({ 
				id: 99, 
				username: 'supervisor', 
				role: 'supervisor' 
			});

			// Can access dashboard
			const dashboardRes = await request(supervisorApp).get('/admin');
			expect(dashboardRes.status).toBe(200);

			// Cannot access user management
			const usersRes = await request(supervisorApp).get('/admin/usuarios');
			expect(usersRes.status).toBe(403);

			// Cannot access role management
			const rolesRes = await request(supervisorApp).get('/admin/roles');
			expect(rolesRes.status).toBe(403);
		});

		it('tecnico can access dashboard but not user/role management', async () => {
			const tecnicoApp = createAuthenticatedApp({ 
				id: 99, 
				username: 'tecnico', 
				role: 'tecnico' 
			});

			// Can access dashboard
			const dashboardRes = await request(tecnicoApp).get('/admin');
			expect(dashboardRes.status).toBe(200);

			// Cannot access user management
			const usersRes = await request(tecnicoApp).get('/admin/usuarios');
			expect(usersRes.status).toBe(403);

			// Cannot access role management
			const rolesRes = await request(tecnicoApp).get('/admin/roles');
			expect(rolesRes.status).toBe(403);
		});
	});

	describe('User Management Permissions', () => {
		it('only admin can create users', async () => {
			const supervisorApp = createAuthenticatedApp({ 
				id: 99, 
				username: 'supervisor', 
				role: 'supervisor' 
			});

			const res = await request(supervisorApp)
				.post('/admin/usuarios')
				.type('form')
				.send({ username: 'newuser', password: 'password123', role_id: 1 });

			expect(res.status).toBe(403);
		});

		it('only admin can delete users', async () => {
			const tecnicoApp = createAuthenticatedApp({ 
				id: 99, 
				username: 'tecnico', 
				role: 'tecnico' 
			});

			const res = await request(tecnicoApp)
				.post('/admin/usuarios/1/eliminar');

			expect(res.status).toBe(403);
		});
	});
});

// ============================================================================
// SEGURIDAD 3: Uploads solo aceptan imágenes
// ============================================================================
describe('Security: Uploads Only Accept Images', () => {
	let uploadApp;

	beforeAll(() => {
		uploadApp = express();
		uploadApp.use(express.json());
		
		// Test endpoint for uploads
		uploadApp.post('/test-upload', 
			upload.single('image'),
			handleUploadError,
			(req, res) => {
				if (req.file) {
					// Clean up test file
					fs.unlinkSync(req.file.path);
					res.json({ success: true, filename: req.file.filename });
				} else {
					res.status(400).json({ error: 'No file uploaded' });
				}
			}
		);

		// Error handler
		uploadApp.use((err, req, res, next) => {
			res.status(400).json({ error: err.message });
		});
	});

	it('should accept JPEG images', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('fake-jpeg-content'), {
				filename: 'test.jpg',
				contentType: 'image/jpeg',
			});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
	});

	it('should accept PNG images', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('fake-png-content'), {
				filename: 'test.png',
				contentType: 'image/png',
			});

		expect(res.status).toBe(200);
	});

	it('should accept GIF images', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('fake-gif-content'), {
				filename: 'test.gif',
				contentType: 'image/gif',
			});

		expect(res.status).toBe(200);
	});

	it('should accept WebP images', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('fake-webp-content'), {
				filename: 'test.webp',
				contentType: 'image/webp',
			});

		expect(res.status).toBe(200);
	});

	it('should reject executable files', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('malicious-exe-content'), {
				filename: 'malware.exe',
				contentType: 'application/x-msdownload',
			});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('no permitido');
	});

	it('should reject PHP files', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('<?php echo "hack"; ?>'), {
				filename: 'shell.php',
				contentType: 'application/x-php',
			});

		expect(res.status).toBe(400);
	});

	it('should reject JavaScript files', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('alert("xss")'), {
				filename: 'script.js',
				contentType: 'application/javascript',
			});

		expect(res.status).toBe(400);
	});

	it('should reject HTML files', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('<html><script>alert("xss")</script></html>'), {
				filename: 'page.html',
				contentType: 'text/html',
			});

		expect(res.status).toBe(400);
	});

	it('should reject files with double extensions', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('malicious content'), {
				filename: 'image.jpg.php',
				contentType: 'application/x-php',
			});

		expect(res.status).toBe(400);
	});

	it('should reject files disguised as images', async () => {
		const res = await request(uploadApp)
			.post('/test-upload')
			.attach('image', Buffer.from('<?php echo "hack"; ?>'), {
				filename: 'image.jpg',
				contentType: 'application/x-php', // Wrong MIME type
			});

		expect(res.status).toBe(400);
	});

	it('should verify ALLOWED_MIME_TYPES only contains image types', () => {
		const allowedTypes = Object.keys(ALLOWED_MIME_TYPES);
		
		allowedTypes.forEach(mimeType => {
			expect(mimeType).toMatch(/^image\//);
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

	describe('SQL Injection in Search/Filter', () => {
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

		it('should safely handle SQL injection in search query', async () => {
			const authApp = createAuthenticatedApp({ id: adminUser.id, username: 'admin', role: 'admin' });
			const maliciousSearch = "test' OR '1'='1";
			
			const res = await request(authApp).get(`/admin?search=${encodeURIComponent(maliciousSearch)}`);
			
			expect(res.status).toBe(200);
		});
	});

	describe('SQL Injection in Form Data', () => {
		it('should safely handle SQL injection in ticket creation', async () => {
			const maliciousData = {
				requester_name: "Robert'); DROP TABLE tickets; --",
				department: 'IT',
				support_type: 'Hardware',
				priority: 'Media – Puede esperar unas horas',
				subject: 'Test SQL Injection',
				description: 'Testing SQL injection in ticket creation form',
				has_anydesk: 'no',
			};

			const res = await request(publicApp)
				.post('/tickets')
				.type('form')
				.send(maliciousData);

			// Should create ticket (or reject for validation), not execute SQL
			expect([302, 400]).toContain(res.status);

			// Verify tickets table still exists
			const { rows } = await pool.query('SELECT COUNT(*) FROM tickets');
			expect(rows).toBeDefined();
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

			// Verify comments table still exists and has data
			const { rows } = await pool.query('SELECT COUNT(*) as count FROM comments WHERE ticket_id = $1', [testTicket.id]);
			expect(parseInt(rows[0].count)).toBeGreaterThan(0);
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
			expect(res.text).toMatch(/incorrecto|inválid/i);
		});

		it('should safely handle UNION-based SQL injection', async () => {
			const maliciousRef = "T-123' UNION SELECT * FROM users--";
			const res = await request(publicApp).get(`/tickets/${encodeURIComponent(maliciousRef)}`);
			
			expect(res.status).toBe(404);
			// Should not leak user data
			expect(res.text).not.toContain('password_hash');
		});
	});
});

// ============================================================================
// SEGURIDAD 5: No hay XSS en comentarios
// ============================================================================
describe('Security: No XSS in Comments', () => {
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
			[`T-SEC-${Date.now()}`, 'Test User', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'XSS Test', 'Testing XSS prevention', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	const xssPayloads = [
		{ name: 'script tag', payload: '<script>alert("XSS")</script>' },
		{ name: 'img onerror', payload: '<img src=x onerror=alert("XSS")>' },
		{ name: 'svg onload', payload: '<svg onload=alert("XSS")>' },
		{ name: 'event handler', payload: '<div onmouseover="alert(\'XSS\')">hover me</div>' },
		{ name: 'javascript protocol', payload: '<a href="javascript:alert(\'XSS\')">click</a>' },
		{ name: 'data protocol', payload: '<a href="data:text/html,<script>alert(\'XSS\')</script>">click</a>' },
		{ name: 'encoded script', payload: '&lt;script&gt;alert("XSS")&lt;/script&gt;' },
		{ name: 'style expression', payload: '<div style="background:url(javascript:alert(\'XSS\'))">test</div>' },
		{ name: 'iframe', payload: '<iframe src="javascript:alert(\'XSS\')"></iframe>' },
		{ name: 'body onload', payload: '<body onload=alert("XSS")>' },
	];

	xssPayloads.forEach(({ name, payload }) => {
		it(`should sanitize ${name} in public comments`, async () => {
			// Add comment with XSS payload
			await request(publicApp)
				.post(`/tickets/${testTicket.reference}/comments`)
				.type('form')
				.send({
					author_name: 'Tester',
					content: payload,
				});

			// View ticket page
			const res = await request(publicApp).get(`/tickets/${testTicket.reference}`);
			
			expect(res.status).toBe(200);
			// The raw XSS payload should not appear unescaped
			expect(res.text).not.toContain(payload);
			// Script tags should be escaped or removed
			expect(res.text).not.toMatch(/<script[^>]*>.*?<\/script>/gi);
		});
	});

	it('should sanitize XSS in admin comments', async () => {
		const xssPayload = '<script>document.cookie</script>';

		await request(authApp)
			.post(`/admin/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({
				content: xssPayload,
				is_internal: 'false',
			});

		const res = await request(authApp).get(`/admin/tickets/${testTicket.reference}`);
		
		expect(res.status).toBe(200);
		expect(res.text).not.toContain('<script>document.cookie</script>');
	});

	it('should sanitize XSS in ticket subject', async () => {
		const xssSubject = '<script>alert("XSS")</script>Test Subject';

		const createRes = await request(publicApp)
			.post('/tickets')
			.type('form')
			.send({
				requester_name: 'Test User',
				department: 'IT',
				support_type: 'Hardware',
				priority: 'Media – Puede esperar unas horas',
				subject: xssSubject,
				description: 'Testing XSS in subject field with enough characters',
				has_anydesk: 'no',
			});

		if (createRes.status === 302) {
			const reference = createRes.headers.location.split('/tickets/')[1];
			const viewRes = await request(publicApp).get(`/tickets/${reference}`);
			
			expect(viewRes.text).not.toContain('<script>alert("XSS")</script>');
		}
	});

	it('should sanitize XSS in requester name', async () => {
		const xssName = '<img src=x onerror=alert("XSS")>';

		const createRes = await request(publicApp)
			.post('/tickets')
			.type('form')
			.send({
				requester_name: xssName,
				department: 'IT',
				support_type: 'Hardware',
				priority: 'Media – Puede esperar unas horas',
				subject: 'XSS Test in Name',
				description: 'Testing XSS in requester name field',
				has_anydesk: 'no',
			});

		if (createRes.status === 302) {
			const reference = createRes.headers.location.split('/tickets/')[1];
			const viewRes = await request(publicApp).get(`/tickets/${reference}`);
			
			expect(viewRes.text).not.toContain('onerror=alert');
		}
	});

	it('should store comments safely in database', async () => {
		const xssPayload = '<script>alert("stored XSS")</script>';

		await request(publicApp)
			.post(`/tickets/${testTicket.reference}/comments`)
			.type('form')
			.send({
				author_name: 'Tester',
				content: xssPayload,
			});

		// Check what's actually stored in DB
		const { rows } = await pool.query(
			'SELECT content FROM comments WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1',
			[testTicket.id]
		);

		// Content should be stored (EJS will escape on render)
		expect(rows.length).toBe(1);
		// The content is stored as-is, but EJS escapes it on render
		// This is the correct behavior - store raw, escape on output
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

	it('should invalidate session on logout', async () => {
		const agent = request.agent(createUnauthenticatedApp());

		// Login
		await agent
			.post('/admin/login')
			.type('form')
			.send({
				username: process.env.ADMIN_USER || 'admin',
				password: process.env.ADMIN_PASSWORD || 'testadmin123',
			});

		// Logout
		await agent.get('/admin/logout');

		// Try to access protected route
		const res = await agent.get('/admin');
		expect(res.status).toBe(302);
		expect(res.headers.location).toBe('/admin/login');
	});
});
