/**
 * Tests extendidos para servicios - Aumentar cobertura
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ensureDatabaseInitialized, getPool } from '../../src/db.js';

let pool;
let adminUser;
let adminRoleId;

beforeAll(async () => {
	await ensureDatabaseInitialized();
	pool = getPool();

	const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
	adminUser = rows[0];

	const { rows: roleRows } = await pool.query("SELECT id FROM roles WHERE name = 'admin'");
	adminRoleId = roleRows[0].id;
});

afterAll(async () => {
	// Cleanup test users
	await pool.query("DELETE FROM users WHERE username LIKE 'test_%'");
});

// ============================================================================
// userService Extended Tests
// ============================================================================
describe('userService Extended', () => {
	let userService;

	beforeAll(async () => {
		userService = await import('../../src/services/userService.js');
	});

	describe('createUser', () => {
		afterEach(async () => {
			await pool.query("DELETE FROM users WHERE username LIKE 'test_create_%'");
		});

		it('should create user with valid data', async () => {
			const user = await userService.createUser({
				username: 'test_create_user',
				password: 'password123',
				role_id: adminRoleId,
			});

			expect(user).toHaveProperty('id');
			expect(user.username).toBe('test_create_user');
		});

		it('should reject duplicate username', async () => {
			await userService.createUser({
				username: 'test_create_dup',
				password: 'password123',
				role_id: adminRoleId,
			});

			await expect(
				userService.createUser({
					username: 'test_create_dup',
					password: 'password456',
					role_id: adminRoleId,
				})
			).rejects.toThrow('ya existe');
		});

		it('should reject invalid role_id', async () => {
			await expect(
				userService.createUser({
					username: 'test_create_invalid',
					password: 'password123',
					role_id: 99999,
				})
			).rejects.toThrow('Rol');
		});
	});

	describe('updateUsername', () => {
		let testUser;

		beforeEach(async () => {
			const hash = '$2a$10$test'; // Dummy hash
			const { rows } = await pool.query(
				"INSERT INTO users (username, password_hash, role, role_id) VALUES ($1, $2, 'tecnico', $3) RETURNING *",
				[`test_update_${Date.now()}`, hash, adminRoleId]
			);
			testUser = rows[0];
		});

		afterEach(async () => {
			if (testUser) {
				await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);
			}
		});

		it('should update username', async () => {
			const newUsername = `test_updated_${Date.now()}`;
			const result = await userService.updateUsername(testUser.id, newUsername);

			expect(result.username).toBe(newUsername);
		});

		it('should reject duplicate username on update', async () => {
			await expect(
				userService.updateUsername(testUser.id, adminUser.username)
			).rejects.toThrow('ya está en uso');
		});
	});

	describe('changePassword', () => {
		let testUser;
		const originalPassword = 'original123';

		beforeEach(async () => {
			const bcrypt = await import('bcryptjs');
			const hash = bcrypt.default.hashSync(originalPassword, 10);
			const { rows } = await pool.query(
				"INSERT INTO users (username, password_hash, role, role_id) VALUES ($1, $2, 'tecnico', $3) RETURNING *",
				[`test_pwd_${Date.now()}`, hash, adminRoleId]
			);
			testUser = rows[0];
		});

		afterEach(async () => {
			if (testUser) {
				await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);
			}
		});

		it('should change password with correct current password', async () => {
			const result = await userService.changePassword(
				testUser.id,
				originalPassword,
				'newpassword123'
			);

			expect(result).toBe(true);

			// Verify new password works
			const user = await userService.authenticate(testUser.username, 'newpassword123');
			expect(user).not.toBeNull();
		});

		it('should reject incorrect current password', async () => {
			await expect(
				userService.changePassword(testUser.id, 'wrongpassword', 'newpassword123')
			).rejects.toThrow('incorrecta');
		});

		it('should throw NotFoundError for non-existent user', async () => {
			await expect(
				userService.changePassword(99999, 'any', 'any')
			).rejects.toThrow('no encontrado');
		});
	});

	describe('changeUserRole', () => {
		let testUser;

		beforeEach(async () => {
			const hash = '$2a$10$test';
			const { rows } = await pool.query(
				"INSERT INTO users (username, password_hash, role, role_id) VALUES ($1, $2, 'tecnico', $3) RETURNING *",
				[`test_role_${Date.now()}`, hash, adminRoleId]
			);
			testUser = rows[0];
		});

		afterEach(async () => {
			if (testUser) {
				await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);
			}
		});

		it('should change user role', async () => {
			const { rows: roles } = await pool.query("SELECT id FROM roles WHERE name = 'supervisor'");
			const supervisorRoleId = roles[0]?.id || adminRoleId;

			const result = await userService.changeUserRole(testUser.id, supervisorRoleId, adminUser.id);
			expect(result).toBe(true);
		});

		it('should reject changing own role', async () => {
			await expect(
				userService.changeUserRole(adminUser.id, adminRoleId, adminUser.id)
			).rejects.toThrow('propio rol');
		});

		it('should reject invalid role', async () => {
			await expect(
				userService.changeUserRole(testUser.id, 99999, adminUser.id)
			).rejects.toThrow('Rol');
		});
	});

	describe('deleteUser', () => {
		let testUser;

		beforeEach(async () => {
			const hash = '$2a$10$test';
			const { rows } = await pool.query(
				"INSERT INTO users (username, password_hash, role, role_id) VALUES ($1, $2, 'tecnico', $3) RETURNING *",
				[`test_del_${Date.now()}`, hash, adminRoleId]
			);
			testUser = rows[0];
		});

		it('should delete user', async () => {
			const result = await userService.deleteUser(testUser.id, adminUser.id);
			expect(result).toBe(true);

			// Verify user is deleted
			await expect(userService.getUserById(testUser.id)).rejects.toThrow('no encontrado');
			testUser = null; // Prevent afterEach cleanup error
		});

		it('should reject deleting own account', async () => {
			await expect(
				userService.deleteUser(adminUser.id, adminUser.id)
			).rejects.toThrow('propia cuenta');
		});

		it('should throw NotFoundError for non-existent user', async () => {
			await expect(
				userService.deleteUser(99999, adminUser.id)
			).rejects.toThrow('no encontrado');
		});
	});
});

// ============================================================================
// ticketService Extended Tests
// ============================================================================
describe('ticketService Extended', () => {
	let ticketService;

	beforeAll(async () => {
		ticketService = await import('../../src/services/ticketService.js');
	});

	afterAll(async () => {
		await pool.query("DELETE FROM tickets WHERE reference LIKE 'T-EXT%'");
	});

	describe('updateTicketByToken', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-EXT-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description here', 'Pendiente', `token-${Date.now()}`]
			);
			testTicket = rows[0];
		});

		it('should update ticket by token', async () => {
			const updated = await ticketService.updateTicketByToken(testTicket.edit_token, {
				subject: 'Updated Subject Here',
			});

			expect(updated.subject).toBe('Updated Subject Here');
		});

		it('should throw NotFoundError for invalid token', async () => {
			await expect(
				ticketService.updateTicketByToken('invalid-token', { subject: 'Test' })
			).rejects.toThrow('no encontrado');
		});
	});

	describe('assignTicket', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-EXT-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', `token-${Date.now()}`]
			);
			testTicket = rows[0];
		});

		it('should assign ticket to user', async () => {
			await ticketService.assignTicket(testTicket.id, testTicket.reference, adminUser.id);

			const { rows } = await pool.query('SELECT assigned_to FROM tickets WHERE id = $1', [testTicket.id]);
			expect(rows[0].assigned_to).toBe(adminUser.id);
		});

		it('should unassign ticket', async () => {
			// First assign
			await ticketService.assignTicket(testTicket.id, testTicket.reference, adminUser.id);

			// Then unassign
			await ticketService.assignTicket(testTicket.id, testTicket.reference, null);

			const { rows } = await pool.query('SELECT assigned_to FROM tickets WHERE id = $1', [testTicket.id]);
			expect(rows[0].assigned_to).toBeNull();
		});
	});

	describe('getTicketWithComments', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-EXT-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', `token-${Date.now()}`]
			);
			testTicket = rows[0];

			// Add a comment
			await pool.query(
				`INSERT INTO comments (ticket_id, author_name, content, is_internal) VALUES ($1, $2, $3, $4)`,
				[testTicket.id, 'Tester', 'Test comment', false]
			);
		});

		it('should get ticket with comments', async () => {
			const result = await ticketService.getTicketWithComments(testTicket.reference, false);

			expect(result.ticket.reference).toBe(testTicket.reference);
			expect(Array.isArray(result.comments)).toBe(true);
		});
	});

	describe('addComment', () => {
		let testTicket;

		beforeEach(async () => {
			const { rows } = await pool.query(
				`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 RETURNING *`,
				[`T-EXT-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', `token-${Date.now()}`]
			);
			testTicket = rows[0];
		});

		it('should add comment to ticket', async () => {
			const comment = await ticketService.addComment(
				testTicket.id,
				testTicket.reference,
				{ author_name: 'Tester', content: 'New comment', is_internal: false }
			);

			expect(comment).toHaveProperty('id');
			expect(comment.content).toBe('New comment');
		});
	});

	describe('getAllTechnicians', () => {
		it('should return list of technicians', async () => {
			const technicians = await ticketService.getAllTechnicians();
			expect(Array.isArray(technicians)).toBe(true);
		});
	});
});

// ============================================================================
// roleService Extended Tests
// ============================================================================
describe('roleService Extended', () => {
	let roleService;

	beforeAll(async () => {
		roleService = await import('../../src/services/roleService.js');
	});

	afterAll(async () => {
		await pool.query("DELETE FROM roles WHERE name LIKE 'test_%'");
	});

	describe('createRole', () => {
		it('should create role with permissions', async () => {
			const { rows: perms } = await pool.query('SELECT id FROM permissions LIMIT 2');
			const permIds = perms.map(p => p.id);

			const roleId = await roleService.createRole({
				name: `test_role_${Date.now()}`,
				display_name: 'Test Role',
				description: 'A test role',
				permissions: permIds,
			});

			// createRole returns the role ID (number)
			expect(typeof roleId).toBe('number');
			expect(roleId).toBeGreaterThan(0);
		});
	});

	describe('updateRole', () => {
		let testRole;

		beforeEach(async () => {
			const { rows } = await pool.query(
				"INSERT INTO roles (name, display_name, is_system) VALUES ($1, $2, false) RETURNING *",
				[`test_upd_${Date.now()}`, 'Test Update']
			);
			testRole = rows[0];
		});

		afterEach(async () => {
			if (testRole) {
				await pool.query('DELETE FROM roles WHERE id = $1', [testRole.id]);
			}
		});

		it('should update role', async () => {
			const result = await roleService.updateRole(testRole.id, {
				display_name: 'Updated Name',
				description: 'Updated description',
				permissions: [],
			});

			expect(result).toBe(true);
		});

		it('should throw NotFoundError for non-existent role', async () => {
			await expect(
				roleService.updateRole(99999, { display_name: 'Test', permissions: [] })
			).rejects.toThrow('no encontrado');
		});
	});

	describe('deleteRole', () => {
		it('should delete non-system role', async () => {
			const { rows } = await pool.query(
				"INSERT INTO roles (name, display_name, is_system) VALUES ($1, $2, false) RETURNING *",
				[`test_del_${Date.now()}`, 'Test Delete']
			);
			const role = rows[0];

			await roleService.deleteRole(role.id);

			await expect(roleService.getRoleById(role.id)).rejects.toThrow('no encontrado');
		});

		it('should reject deleting system role', async () => {
			const { rows } = await pool.query("SELECT id FROM roles WHERE name = 'admin'");
			const adminRoleId = rows[0].id;

			await expect(roleService.deleteRole(adminRoleId)).rejects.toThrow('sistema');
		});

		it('should throw NotFoundError for non-existent role', async () => {
			await expect(roleService.deleteRole(99999)).rejects.toThrow('no encontrado');
		});
	});
});

// ============================================================================
// Comments Model Tests
// ============================================================================
describe('Comments Model', () => {
	let commentsModel;
	let testTicket;

	beforeAll(async () => {
		commentsModel = await import('../../src/models/comments.js');

		const { rows } = await pool.query(
			`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING *`,
			[`T-CMT-${Date.now()}`, 'Test', 'IT', 'Hardware', 'Media – Puede esperar unas horas', 'Test', 'Description', 'Pendiente', `token-${Date.now()}`]
		);
		testTicket = rows[0];
	});

	afterAll(async () => {
		await pool.query('DELETE FROM comments WHERE ticket_id = $1', [testTicket.id]);
		await pool.query('DELETE FROM tickets WHERE id = $1', [testTicket.id]);
	});

	it('should create comment', async () => {
		const comment = await commentsModel.createComment({
			ticket_id: testTicket.id,
			author_name: 'Test Author',
			content: 'Test comment content',
			is_internal: false,
		});

		expect(comment).toHaveProperty('id');
		expect(comment.content).toBe('Test comment content');
	});

	it('should create internal comment', async () => {
		const comment = await commentsModel.createComment({
			ticket_id: testTicket.id,
			user_id: adminUser.id,
			author_name: 'Admin',
			content: 'Internal note',
			is_internal: true,
		});

		expect(comment.is_internal).toBe(true);
	});

	it('should get comments by ticket id', async () => {
		const comments = await commentsModel.getCommentsByTicketId(testTicket.id, true);

		expect(Array.isArray(comments)).toBe(true);
		expect(comments.length).toBeGreaterThan(0);
	});

	it('should get public comments only', async () => {
		const comments = await commentsModel.getCommentsByTicketId(testTicket.id, false);

		comments.forEach(c => {
			expect(c.is_internal).toBe(false);
		});
	});

	it('should count comments by ticket', async () => {
		const count = await commentsModel.countCommentsByTicketId(testTicket.id);
		expect(typeof count).toBe('number');
	});
});
