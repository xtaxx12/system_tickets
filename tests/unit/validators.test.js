/**
 * Tests unitarios para validadores
 * Usa globals de vitest (configurado en vitest.config.js)
 */
const {
	validate,
	createTicketSchema,
	updateTicketSchema,
	createUserSchema,
	updatePasswordSchema,
	createCommentSchema,
	createRoleSchema,
	loginSchema,
} = require('../../src/validators/index.js');

describe('Validators', () => {
	// =========================================================================
	// createTicketSchema
	// =========================================================================
	describe('createTicketSchema', () => {
		const validTicket = {
			requester_name: 'Juan Pérez',
			department: 'IT',
			support_type: 'Hardware',
			priority: 'Media – Puede esperar unas horas',
			subject: 'Problema con impresora',
			description: 'La impresora no enciende desde ayer por la mañana',
			has_anydesk: false,
		};

		it('should validate a correct ticket', () => {
			const result = validate(createTicketSchema, validTicket);
			expect(result.success).toBe(true);
			expect(result.data.requester_name).toBe('Juan Pérez');
		});

		it('should reject ticket without requester_name', () => {
			const { requester_name, ...invalid } = validTicket;
			const result = validate(createTicketSchema, invalid);
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('requester_name');
		});

		it('should reject ticket with short requester_name', () => {
			const result = validate(createTicketSchema, { ...validTicket, requester_name: 'A' });
			expect(result.success).toBe(false);
			expect(result.errors.requester_name).toContain('2');
		});

		it('should reject ticket without department', () => {
			const { department, ...invalid } = validTicket;
			const result = validate(createTicketSchema, invalid);
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('department');
		});

		it('should reject invalid support_type', () => {
			const result = validate(createTicketSchema, { ...validTicket, support_type: 'InvalidType' });
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('support_type');
		});

		it('should reject invalid priority', () => {
			const result = validate(createTicketSchema, { ...validTicket, priority: 'Urgentísima' });
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('priority');
		});

		it('should reject ticket with short subject', () => {
			const result = validate(createTicketSchema, { ...validTicket, subject: 'Hi' });
			expect(result.success).toBe(false);
			expect(result.errors.subject).toContain('5');
		});

		it('should reject ticket with short description', () => {
			const result = validate(createTicketSchema, { ...validTicket, description: 'Short' });
			expect(result.success).toBe(false);
			expect(result.errors.description).toContain('10');
		});

		it('should require anydesk_code when has_anydesk is true', () => {
			const result = validate(createTicketSchema, {
				...validTicket,
				has_anydesk: 'yes',
				anydesk_code: '',
			});
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('anydesk_code');
		});

		it('should accept anydesk_code when has_anydesk is true', () => {
			const result = validate(createTicketSchema, {
				...validTicket,
				has_anydesk: 'yes',
				anydesk_code: '123456789',
			});
			expect(result.success).toBe(true);
		});

		it('should validate optional email', () => {
			const result = validate(createTicketSchema, {
				...validTicket,
				email: 'test@example.com',
			});
			expect(result.success).toBe(true);
		});

		it('should reject invalid email', () => {
			const result = validate(createTicketSchema, {
				...validTicket,
				email: 'invalid-email',
			});
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('email');
		});

		it('should accept empty email', () => {
			const result = validate(createTicketSchema, {
				...validTicket,
				email: '',
			});
			expect(result.success).toBe(true);
		});

		it('should trim whitespace from fields', () => {
			const result = validate(createTicketSchema, {
				...validTicket,
				requester_name: '  Juan Pérez  ',
				subject: '  Problema con impresora  ',
			});
			expect(result.success).toBe(true);
			expect(result.data.requester_name).toBe('Juan Pérez');
			expect(result.data.subject).toBe('Problema con impresora');
		});
	});

	// =========================================================================
	// updateTicketSchema
	// =========================================================================
	describe('updateTicketSchema', () => {
		it('should allow partial updates', () => {
			const result = validate(updateTicketSchema, { subject: 'Nuevo asunto del ticket' });
			expect(result.success).toBe(true);
		});

		it('should validate fields when provided', () => {
			const result = validate(updateTicketSchema, { subject: 'Hi' });
			expect(result.success).toBe(false);
		});

		it('should accept empty object', () => {
			const result = validate(updateTicketSchema, {});
			expect(result.success).toBe(true);
		});
	});

	// =========================================================================
	// createUserSchema
	// =========================================================================
	describe('createUserSchema', () => {
		const validUser = {
			username: 'newuser',
			password: 'password123',
			role_id: 1,
		};

		it('should validate a correct user', () => {
			const result = validate(createUserSchema, validUser);
			expect(result.success).toBe(true);
		});

		it('should reject short username', () => {
			const result = validate(createUserSchema, { ...validUser, username: 'ab' });
			expect(result.success).toBe(false);
			expect(result.errors.username).toContain('3');
		});

		it('should reject username with special characters', () => {
			const result = validate(createUserSchema, { ...validUser, username: 'user@name' });
			expect(result.success).toBe(false);
		});

		it('should accept username with underscore', () => {
			const result = validate(createUserSchema, { ...validUser, username: 'user_name' });
			expect(result.success).toBe(true);
		});

		it('should reject short password', () => {
			const result = validate(createUserSchema, { ...validUser, password: '12345' });
			expect(result.success).toBe(false);
			expect(result.errors.password).toContain('6');
		});

		it('should reject missing role_id', () => {
			const { role_id, ...invalid } = validUser;
			const result = validate(createUserSchema, invalid);
			expect(result.success).toBe(false);
		});

		it('should coerce role_id to number', () => {
			const result = validate(createUserSchema, { ...validUser, role_id: '1' });
			expect(result.success).toBe(true);
			expect(result.data.role_id).toBe(1);
		});
	});

	// =========================================================================
	// updatePasswordSchema
	// =========================================================================
	describe('updatePasswordSchema', () => {
		it('should validate matching passwords', () => {
			const result = validate(updatePasswordSchema, {
				current_password: 'oldpass123',
				new_password: 'newpass123',
				confirm_password: 'newpass123',
			});
			expect(result.success).toBe(true);
		});

		it('should reject non-matching passwords', () => {
			const result = validate(updatePasswordSchema, {
				current_password: 'oldpass123',
				new_password: 'newpass123',
				confirm_password: 'different123',
			});
			expect(result.success).toBe(false);
			expect(result.errors).toHaveProperty('confirm_password');
		});

		it('should reject short new password', () => {
			const result = validate(updatePasswordSchema, {
				current_password: 'oldpass123',
				new_password: '12345',
				confirm_password: '12345',
			});
			expect(result.success).toBe(false);
		});

		it('should require current_password', () => {
			const result = validate(updatePasswordSchema, {
				new_password: 'newpass123',
				confirm_password: 'newpass123',
			});
			expect(result.success).toBe(false);
		});
	});

	// =========================================================================
	// createCommentSchema
	// =========================================================================
	describe('createCommentSchema', () => {
		it('should validate a correct comment', () => {
			const result = validate(createCommentSchema, {
				content: 'Este es un comentario válido',
				author_name: 'Juan',
			});
			expect(result.success).toBe(true);
		});

		it('should reject empty content', () => {
			const result = validate(createCommentSchema, {
				content: '',
				author_name: 'Juan',
			});
			expect(result.success).toBe(false);
		});

		it('should reject content exceeding max length', () => {
			const result = validate(createCommentSchema, {
				content: 'a'.repeat(5001),
				author_name: 'Juan',
			});
			expect(result.success).toBe(false);
		});

		it('should handle is_internal as string', () => {
			const result = validate(createCommentSchema, {
				content: 'Comentario interno',
				is_internal: 'true',
			});
			expect(result.success).toBe(true);
			expect(result.data.is_internal).toBe(true);
		});

		it('should default is_internal to false', () => {
			const result = validate(createCommentSchema, {
				content: 'Comentario público',
			});
			expect(result.success).toBe(true);
			expect(result.data.is_internal).toBe(false);
		});
	});

	// =========================================================================
	// createRoleSchema
	// =========================================================================
	describe('createRoleSchema', () => {
		it('should validate a correct role', () => {
			const result = validate(createRoleSchema, {
				name: 'custom_role',
				display_name: 'Rol Personalizado',
				description: 'Un rol de prueba',
				permissions: [1, 2, 3],
			});
			expect(result.success).toBe(true);
		});

		it('should reject name with uppercase', () => {
			const result = validate(createRoleSchema, {
				name: 'CustomRole',
				display_name: 'Rol',
			});
			expect(result.success).toBe(false);
		});

		it('should reject name with spaces', () => {
			const result = validate(createRoleSchema, {
				name: 'custom role',
				display_name: 'Rol',
			});
			expect(result.success).toBe(false);
		});

		it('should accept name with underscores', () => {
			const result = validate(createRoleSchema, {
				name: 'custom_role_name',
				display_name: 'Rol',
			});
			expect(result.success).toBe(true);
		});

		it('should default permissions to empty array', () => {
			const result = validate(createRoleSchema, {
				name: 'test_role',
				display_name: 'Test',
			});
			expect(result.success).toBe(true);
			expect(result.data.permissions).toEqual([]);
		});
	});

	// =========================================================================
	// loginSchema
	// =========================================================================
	describe('loginSchema', () => {
		it('should validate correct credentials', () => {
			const result = validate(loginSchema, {
				username: 'admin',
				password: 'password123',
			});
			expect(result.success).toBe(true);
		});

		it('should reject empty username', () => {
			const result = validate(loginSchema, {
				username: '',
				password: 'password123',
			});
			expect(result.success).toBe(false);
		});

		it('should reject empty password', () => {
			const result = validate(loginSchema, {
				username: 'admin',
				password: '',
			});
			expect(result.success).toBe(false);
		});

		it('should trim username', () => {
			const result = validate(loginSchema, {
				username: '  admin  ',
				password: 'password123',
			});
			expect(result.success).toBe(true);
			expect(result.data.username).toBe('admin');
		});
	});
});
