/**
 * Esquemas de validación con Zod
 */
const { z } = require('zod');
const { SUPPORT_TYPES, PRIORITIES, STATUSES } = require('../models/tickets');

// ============================================================================
// Validadores de Tickets
// ============================================================================

const createTicketSchema = z.object({
	requester_name: z.string()
		.min(2, 'El nombre debe tener al menos 2 caracteres')
		.max(100, 'El nombre no puede exceder 100 caracteres')
		.trim(),
	department: z.string()
		.min(2, 'El departamento debe tener al menos 2 caracteres')
		.max(100, 'El departamento no puede exceder 100 caracteres')
		.trim(),
	support_type: z.enum(SUPPORT_TYPES, {
		errorMap: () => ({ message: 'Tipo de soporte inválido' })
	}),
	priority: z.enum(PRIORITIES, {
		errorMap: () => ({ message: 'Prioridad inválida' })
	}),
	subject: z.string()
		.min(5, 'El asunto debe tener al menos 5 caracteres')
		.max(200, 'El asunto no puede exceder 200 caracteres')
		.trim(),
	description: z.string()
		.min(10, 'La descripción debe tener al menos 10 caracteres')
		.max(5000, 'La descripción no puede exceder 5000 caracteres')
		.trim(),
	has_anydesk: z.preprocess(
		(val) => val === 'yes' || val === true,
		z.boolean()
	),
	anydesk_code: z.string().max(50).optional().nullable(),
	email: z.string().email('Email inválido').optional().or(z.literal('')),
}).refine(
	(data) => !data.has_anydesk || (data.anydesk_code && data.anydesk_code.length > 0),
	{ message: 'El código de AnyDesk es requerido', path: ['anydesk_code'] }
);

const updateTicketSchema = z.object({
	requester_name: z.string().min(2).max(100).trim().optional(),
	department: z.string().min(2).max(100).trim().optional(),
	support_type: z.enum(SUPPORT_TYPES).optional(),
	priority: z.enum(PRIORITIES).optional(),
	subject: z.string().min(5).max(200).trim().optional(),
	description: z.string().min(10).max(5000).trim().optional(),
	has_anydesk: z.preprocess((val) => val === 'yes' || val === true, z.boolean()).optional(),
	anydesk_code: z.string().max(50).optional().nullable(),
});

const updateStatusSchema = z.object({
	status: z.enum(STATUSES, {
		errorMap: () => ({ message: 'Estado inválido' })
	}),
});

// ============================================================================
// Validadores de Usuarios
// ============================================================================

const createUserSchema = z.object({
	username: z.string()
		.min(3, 'El usuario debe tener al menos 3 caracteres')
		.max(50, 'El usuario no puede exceder 50 caracteres')
		.regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guiones bajos')
		.trim(),
	password: z.string()
		.min(6, 'La contraseña debe tener al menos 6 caracteres')
		.max(100, 'La contraseña no puede exceder 100 caracteres'),
	role_id: z.coerce.number().positive('Debe seleccionar un rol'),
});

const updatePasswordSchema = z.object({
	current_password: z.string().min(1, 'Contraseña actual requerida'),
	new_password: z.string()
		.min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
		.max(100),
	confirm_password: z.string(),
}).refine(
	(data) => data.new_password === data.confirm_password,
	{ message: 'Las contraseñas no coinciden', path: ['confirm_password'] }
);

const updateUsernameSchema = z.object({
	username: z.string()
		.min(3, 'El usuario debe tener al menos 3 caracteres')
		.max(50)
		.regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guiones bajos')
		.trim(),
});

// ============================================================================
// Validadores de Comentarios
// ============================================================================

const createCommentSchema = z.object({
	content: z.string()
		.min(1, 'El contenido es requerido')
		.max(5000, 'El comentario no puede exceder 5000 caracteres')
		.trim(),
	author_name: z.string()
		.min(2, 'El nombre debe tener al menos 2 caracteres')
		.max(100)
		.trim()
		.optional(),
	author_email: z.string().email('Email inválido').optional().or(z.literal('')),
	is_internal: z.preprocess(
		(val) => val === 'true' || val === true,
		z.boolean()
	).optional().default(false),
});

// ============================================================================
// Validadores de Roles
// ============================================================================

const createRoleSchema = z.object({
	name: z.string()
		.min(3, 'El nombre debe tener al menos 3 caracteres')
		.max(50)
		.regex(/^[a-z_]+$/, 'Solo letras minúsculas y guiones bajos')
		.trim(),
	display_name: z.string()
		.min(2, 'El nombre visible es requerido')
		.max(100)
		.trim(),
	description: z.string().max(500).optional(),
	permissions: z.array(z.coerce.number()).optional().default([]),
});

const updateRoleSchema = z.object({
	display_name: z.string().min(2).max(100).trim(),
	description: z.string().max(500).optional(),
	permissions: z.array(z.coerce.number()).optional().default([]),
});

// ============================================================================
// Validadores de Login
// ============================================================================

const loginSchema = z.object({
	username: z.string().min(1, 'Usuario requerido').trim(),
	password: z.string().min(1, 'Contraseña requerida'),
});

// ============================================================================
// Función helper para validar
// ============================================================================

function validate(schema, data) {
	const result = schema.safeParse(data);
	if (!result.success) {
		const errors = {};
		// Zod v4 usa 'issues' en lugar de 'errors'
		const issues = result.error.issues || result.error.errors || [];
		issues.forEach((err) => {
			const path = err.path.join('.');
			errors[path] = err.message;
		});
		return { success: false, errors, data: null };
	}
	return { success: true, errors: null, data: result.data };
}

module.exports = {
	// Schemas
	createTicketSchema,
	updateTicketSchema,
	updateStatusSchema,
	createUserSchema,
	updatePasswordSchema,
	updateUsernameSchema,
	createCommentSchema,
	createRoleSchema,
	updateRoleSchema,
	loginSchema,
	// Helper
	validate,
};
