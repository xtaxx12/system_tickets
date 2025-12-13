/**
 * Tests de integración para servicios
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ensureDatabaseInitialized, getPool } from '../../src/db.js';

let pool;

beforeAll(async () => {
	await ensureDatabaseInitialized();
	pool = getPool();
});

afterAll(async () => {
	// Limpiar datos de test
	await pool.query("DELETE FROM comments WHERE ticket_id IN (SELECT id FROM tickets WHERE reference LIKE 'T-TEST%')");
	await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-TEST%'");
});

// ============================================================================
// Tests de ticketService
// ============================================================================
describe('ticketService', () => {
	let ticketService;

	beforeAll(async () => {
		ticketService = await import('../../src/services/ticketService.js');
	});

	describe('createTicket', () => {
		it('should create ticket with valid data', async () => {
			const data = {
				requester_name: 'Service Test User',
				department: 'IT',
				support_type: 'Hardware',
				priority: 'Media – Puede esperar unas horas',
				subject: 'Service Test Ticket',
				description: 'Test description with enough characters',
			};

			const ticket = await ticketService.createTicket(data);

			expect(ticket).toHaveProperty('id');
			expect(ticket).toHaveProperty('reference');
			expect(ticket.reference).toMatch(/^T-\d{6}-[A-Z0-9]+$/);
			expect(ticket.requester_name).toBe(data.requester_name);
			expect(ticket.status).toBe('Pendiente');

			// Limpiar
			await pool.query('DELETE FROM tickets WHERE id = $1', [ticket.id]);
		});

		it('should generate unique references', async () => {
			const data = {
				requester_name: 'Test User',
				department: 'IT',
				support_type: 'Software',
				priority: 'Baja – No es urgente',
				subject: 'Test Ticket 1',
				description: 'Description with enough characters here',
			};

			const ticket1 = await ticketService.createTicket(data);
			const ticket2 = await ticketService.createTicket({ ...data, subject: 'Test Ticket 2' });

			expect(ticket1.reference).not.toBe(ticket2.reference);

			// Limpiar
			await pool.query('DELETE FROM tickets WHERE id IN ($1, $2)', [ticket1.id, ticket2.id]);
		});
	});

	describe('getTicketByReference', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-TEST-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', 'token']
			);
			testTicket = rows[0];
		});

		afterEach(async () => {
			if (testTicket) {
				await pool.query('DELETE FROM tickets WHERE id = $1', [testTicket.id]);
			}
		});

		it('should find ticket by reference', async () => {
			const found = await ticketService.getTicketByReference(testTicket.reference);
			expect(found.id).toBe(testTicket.id);
		});

		it('should throw NotFoundError for non-existent reference', async () => {
			await expect(ticketService.getTicketByReference('T-NONEXISTENT')).rejects.toThrow('no encontrado');
		});
	});

	describe('listTickets', () => {
		it('should return paginated results', async () => {
			const result = await ticketService.listTickets({}, 1, 10);

			expect(result).toHaveProperty('tickets');
			expect(result).toHaveProperty('pagination');
			expect(result.pagination).toHaveProperty('currentPage');
			expect(result.pagination).toHaveProperty('totalPages');
			expect(Array.isArray(result.tickets)).toBe(true);
		});

		it('should filter by status', async () => {
			const result = await ticketService.listTickets({ status: 'Pendiente' }, 1, 10);
			expect(result.tickets.every((t) => t.status === 'Pendiente')).toBe(true);
		});
	});

	describe('updateTicketStatus', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-TEST-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', 'token']
			);
			testTicket = rows[0];
		});

		afterEach(async () => {
			if (testTicket) {
				await pool.query('DELETE FROM tickets WHERE id = $1', [testTicket.id]);
			}
		});

		it('should update ticket status', async () => {
			await ticketService.updateTicketStatus(testTicket.id, testTicket.reference, 'En Proceso');

			const { rows } = await pool.query('SELECT status FROM tickets WHERE id = $1', [testTicket.id]);
			expect(rows[0].status).toBe('En Proceso');
		});
	});

	describe('getStats', () => {
		it('should return statistics', async () => {
			const stats = await ticketService.getStats();

			expect(stats).toHaveProperty('total');
			expect(stats).toHaveProperty('pendiente');
			expect(stats).toHaveProperty('enProceso');
			expect(stats).toHaveProperty('resuelto');
			expect(stats).toHaveProperty('cerrado');
		});
	});
});

// ============================================================================
// Tests de userService
// ============================================================================
describe('userService', () => {
	let userService;

	beforeAll(async () => {
		userService = await import('../../src/services/userService.js');
	});

	describe('authenticate', () => {
		it('should authenticate valid user', async () => {
			const user = await userService.authenticate(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASSWORD || 'testadmin123');

			expect(user).not.toBeNull();
			expect(user.username).toBe(process.env.ADMIN_USER || 'admin');
			expect(user.role).toBe('admin');
		});

		it('should return null for invalid username', async () => {
			const user = await userService.authenticate('nonexistent', 'password');
			expect(user).toBeNull();
		});

		it('should return null for invalid password', async () => {
			const user = await userService.authenticate(process.env.ADMIN_USER || 'admin', 'wrongpassword');
			expect(user).toBeNull();
		});
	});

	describe('getUserById', () => {
		it('should find user by id', async () => {
			const { rows } = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
			const adminId = rows[0].id;

			const user = await userService.getUserById(adminId);
			expect(user.id).toBe(adminId);
		});

		it('should throw NotFoundError for non-existent id', async () => {
			await expect(userService.getUserById(99999)).rejects.toThrow('no encontrado');
		});
	});

	describe('listUsers', () => {
		it('should return list of users', async () => {
			const users = await userService.listUsers();

			expect(Array.isArray(users)).toBe(true);
			expect(users.length).toBeGreaterThan(0);
			expect(users[0]).toHaveProperty('username');
			expect(users[0]).toHaveProperty('role');
		});
	});
});

// ============================================================================
// Tests de roleService
// ============================================================================
describe('roleService', () => {
	let roleService;

	beforeAll(async () => {
		roleService = await import('../../src/services/roleService.js');
	});

	describe('getAllRolesWithUserCount', () => {
		it('should return roles with user counts', async () => {
			const roles = await roleService.getAllRolesWithUserCount();

			expect(Array.isArray(roles)).toBe(true);
			expect(roles.length).toBeGreaterThan(0);
			expect(roles[0]).toHaveProperty('name');
			expect(roles[0]).toHaveProperty('display_name');
			expect(roles[0]).toHaveProperty('user_count');
		});
	});

	describe('getRoleById', () => {
		it('should find role with permissions', async () => {
			const { rows } = await pool.query("SELECT id FROM roles WHERE name = 'admin'");
			const adminRoleId = rows[0].id;

			const role = await roleService.getRoleById(adminRoleId);

			expect(role.name).toBe('admin');
			expect(role).toHaveProperty('permissions');
			expect(Array.isArray(role.permissions)).toBe(true);
		});

		it('should throw NotFoundError for non-existent role', async () => {
			await expect(roleService.getRoleById(99999)).rejects.toThrow('no encontrado');
		});
	});

	describe('getAllPermissions', () => {
		it('should return permissions by category', async () => {
			const permissions = await roleService.getAllPermissions();

			expect(typeof permissions).toBe('object');
			expect(permissions).toHaveProperty('tickets');
			expect(permissions).toHaveProperty('administration');
		});
	});

	describe('getUserPermissions', () => {
		it('should return user permissions', async () => {
			const { rows } = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
			const adminId = rows[0].id;

			const permissions = await roleService.getUserPermissions(adminId);

			expect(Array.isArray(permissions)).toBe(true);
			expect(permissions).toContain('manage_users');
			expect(permissions).toContain('manage_roles');
		});
	});
});
