const express = require('express');
const { STATUSES } = require('../models/tickets');
const ticketService = require('../services/ticketService');
const userService = require('../services/userService');
const roleService = require('../services/roleService');
const emailService = require('../services/emailService');
const { getCommentsByTicketId } = require('../models/comments');

// Middlewares
const { requireAuth, requireAdmin, requireSuperAdmin, requirePermission } = require('../middleware/auth');
const { loginLimiter, commentLimiter } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Validadores
const {
	validate,
	loginSchema,
	createUserSchema,
	updatePasswordSchema,
	updateUsernameSchema,
	createCommentSchema,
	createRoleSchema,
	updateRoleSchema,
	updateStatusSchema,
} = require('../validators');

const router = express.Router();

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

router.get('/login', (req, res) => {
	res.render('admin/login', { title: 'Acceso Admin', error: null });
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
	const validation = validate(loginSchema, req.body);
	if (!validation.success) {
		return res.render('admin/login', {
			title: 'Acceso Admin',
			error: 'Credenciales inválidas',
		});
	}

	const { username, password } = validation.data;
	const user = await userService.authenticate(username, password);

	if (!user) {
		return res.render('admin/login', {
			title: 'Acceso Admin',
			error: 'Usuario o contraseña incorrectos',
		});
	}

	req.session.user = user;
	res.redirect('/admin');
}));

router.post('/logout', (req, res) => {
	req.session.destroy(() => {
		res.redirect('/admin/login');
	});
});

// ============================================================================
// PERFIL DE USUARIO
// ============================================================================

router.get('/perfil', requireAdmin, asyncHandler(async (req, res) => {
	const user = await userService.getUserById(req.session.user.id);
	res.render('admin/perfil', {
		title: 'Mi Perfil',
		user,
		error: null,
		success: null,
	});
}));

router.post('/perfil', requireAdmin, asyncHandler(async (req, res) => {
	const { username, current_password, new_password, confirm_password } = req.body;
	const errors = [];
	let success = null;

	const user = await userService.getUserById(req.session.user.id);

	// Cambio de username
	if (username && username !== user.username) {
		const usernameValidation = validate(updateUsernameSchema, { username });
		if (!usernameValidation.success) {
			errors.push(Object.values(usernameValidation.errors).join(', '));
		} else {
			try {
				await userService.updateUsername(req.session.user.id, username);
				req.session.user.username = username;
				success = 'Nombre de usuario actualizado';
			} catch (err) {
				if (err instanceof ValidationError) {
					errors.push(err.message);
				} else {
					throw err;
				}
			}
		}
	}

	// Cambio de contraseña
	if (new_password || current_password) {
		const passwordValidation = validate(updatePasswordSchema, {
			current_password,
			new_password,
			confirm_password,
		});

		if (!passwordValidation.success) {
			errors.push(Object.values(passwordValidation.errors).join(', '));
		} else {
			try {
				await userService.changePassword(req.session.user.id, current_password, new_password);
				success = success ? success + ' y contraseña actualizada' : 'Contraseña actualizada';
			} catch (err) {
				if (err instanceof ValidationError) {
					errors.push(err.message);
				} else {
					throw err;
				}
			}
		}
	}

	const updatedUser = await userService.getUserById(req.session.user.id);
	res.render('admin/perfil', {
		title: 'Mi Perfil',
		user: updatedUser,
		error: errors.length > 0 ? errors.join('. ') : null,
		success,
	});
}));

// ============================================================================
// DASHBOARD / LISTA DE TICKETS
// ============================================================================

router.get('/', requireAdmin, asyncHandler(async (req, res) => {
	const { status, priority, support_type, assigned_to, my_tickets, page = 1 } = req.query;
	const currentPage = parseInt(page) || 1;

	const filters = { status, priority, support_type };
	if (my_tickets === 'true') {
		filters.assigned_to = req.session.user.id;
	} else if (assigned_to) {
		filters.assigned_to = assigned_to;
	}

	const { tickets, pagination } = await ticketService.listTickets(filters, currentPage, 15);
	const technicians = await ticketService.getAllTechnicians();

	// Estadísticas generales
	const stats = await ticketService.getStats({ priority, support_type });

	// Estadísticas personales
	const myStats = await ticketService.getStats({ assigned_to: req.session.user.id, priority, support_type });
	const { pagination: myPagination } = await ticketService.listTickets({ assigned_to: req.session.user.id }, 1, 1);

	// Permisos del usuario
	const userPermissions = await roleService.getUserPermissions(req.session.user.id);

	res.render('admin/list', {
		title: 'Panel Admin',
		tickets,
		filters: { status, priority, support_type, assigned_to, my_tickets },
		STATUSES,
		user: req.session.user,
		userPermissions,
		stats,
		myStats,
		myTotalTickets: myPagination.totalTickets,
		technicians,
		pagination,
	});
}));

// ============================================================================
// DETALLE DE TICKET
// ============================================================================

router.get('/tickets/:reference', requireAdmin, asyncHandler(async (req, res) => {
	const { ticket, comments } = await ticketService.getTicketWithComments(req.params.reference, true);
	const technicians = await ticketService.getAllTechnicians();
	const userPermissions = await roleService.getUserPermissions(req.session.user.id);

	res.render('admin/detail', {
		title: `Admin - ${ticket.reference}`,
		ticket,
		comments,
		STATUSES,
		technicians,
		user: req.session.user,
		userPermissions,
	});
}));

// ============================================================================
// ACCIONES DE TICKET
// ============================================================================

router.post('/tickets/:reference/estado', requireAdmin, asyncHandler(async (req, res) => {
	const ticket = await ticketService.getTicketByReference(req.params.reference);

	const validation = validate(updateStatusSchema, req.body);
	if (!validation.success) {
		return res.status(400).send('Estado inválido');
	}

	await ticketService.updateTicketStatus(ticket.id, ticket.reference, validation.data.status, ticket.assigned_to);
	res.redirect(`/admin/tickets/${ticket.reference}`);
}));

router.post('/tickets/:reference/asignar',
	requirePermission('assign_tickets'),
	asyncHandler(async (req, res) => {
		const ticket = await ticketService.getTicketByReference(req.params.reference);
		const { technician_id } = req.body;
		const technicianIdValue = technician_id && technician_id !== '' ? parseInt(technician_id) : null;

		await ticketService.assignTicket(ticket.id, ticket.reference, technicianIdValue);
		res.redirect(`/admin/tickets/${ticket.reference}`);
	})
);

router.post('/tickets/:reference/comments',
	requireAdmin,
	commentLimiter,
	asyncHandler(async (req, res) => {
		const ticket = await ticketService.getTicketByReference(req.params.reference);

		const validation = validate(createCommentSchema, req.body);
		if (!validation.success) {
			return res.status(400).send('Datos inválidos');
		}

		const { content, is_internal } = validation.data;

		await ticketService.addComment(
			ticket.id,
			ticket.reference,
			{
				user_id: req.session.user.id,
				author_name: req.session.user.username,
				content,
				is_internal,
			},
			ticket.assigned_to,
			req.session.user.id
		);

		// Notificar por email si no es interno
		if (!is_internal) {
			const prevComments = await getCommentsByTicketId(ticket.id, false);
			const emails = [...new Set(prevComments.map(c => c.author_email).filter(Boolean))];
			if (emails.length > 0) {
				await emailService.sendCommentNotificationEmail(ticket, { content }, emails);
			}
		}

		res.redirect(`/admin/tickets/${ticket.reference}`);
	})
);


// ============================================================================
// GESTIÓN DE USUARIOS
// ============================================================================

async function renderUsuarios(res, req, error = null, success = null) {
	const users = await userService.listUsers();
	const roles = await roleService.getAllRolesWithUserCount();
	res.render('admin/usuarios', {
		title: 'Gestión de Usuarios',
		users,
		roles,
		user: req.session.user,
		error,
		success,
	});
}

router.get('/usuarios', requireSuperAdmin, asyncHandler(async (req, res) => {
	await renderUsuarios(res, req);
}));

router.post('/usuarios/crear', requireSuperAdmin, asyncHandler(async (req, res) => {
	const validation = validate(createUserSchema, req.body);

	if (!validation.success) {
		return await renderUsuarios(res, req, Object.values(validation.errors).join('. '));
	}

	try {
		const { username } = await userService.createUser(validation.data);
		await renderUsuarios(res, req, null, `Usuario ${username} creado exitosamente`);
	} catch (err) {
		if (err instanceof ValidationError) {
			await renderUsuarios(res, req, err.message);
		} else {
			throw err;
		}
	}
}));

router.post('/usuarios/:id/cambiar-rol', requireSuperAdmin, asyncHandler(async (req, res) => {
	const userId = parseInt(req.params.id);
	const { role_id } = req.body;

	try {
		await userService.changeUserRole(userId, parseInt(role_id), req.session.user.id);
		await renderUsuarios(res, req, null, 'Rol actualizado exitosamente');
	} catch (err) {
		await renderUsuarios(res, req, err.message);
	}
}));

router.post('/usuarios/:id/eliminar', requireSuperAdmin, asyncHandler(async (req, res) => {
	const userId = parseInt(req.params.id);

	try {
		await userService.deleteUser(userId, req.session.user.id);
		await renderUsuarios(res, req, null, 'Usuario eliminado exitosamente');
	} catch (err) {
		await renderUsuarios(res, req, err.message);
	}
}));

// ============================================================================
// NOTIFICACIONES
// ============================================================================

const { getUnreadNotifications, getUnreadCount, markAsRead, markAllAsRead } = require('../models/notifications');

router.get('/notifications', requireAdmin, asyncHandler(async (req, res) => {
	const notifications = await getUnreadNotifications(req.session.user.id, 10);
	const count = await getUnreadCount(req.session.user.id);
	res.json({ notifications, count });
}));

router.post('/notifications/:id/read', requireAdmin, asyncHandler(async (req, res) => {
	await markAsRead(parseInt(req.params.id), req.session.user.id);
	res.json({ success: true });
}));

router.post('/notifications/read-all', requireAdmin, asyncHandler(async (req, res) => {
	await markAllAsRead(req.session.user.id);
	res.json({ success: true });
}));

// ============================================================================
// GESTIÓN DE ROLES Y PERMISOS
// ============================================================================

router.get('/roles', requirePermission('manage_roles'), asyncHandler(async (req, res) => {
	const roles = await roleService.getAllRolesWithUserCount();

	res.render('admin/roles', {
		title: 'Gestión de Roles',
		roles,
		user: req.session.user,
		error: req.query.error || null,
		success: req.query.success || null,
	});
}));

router.get('/roles/:id', requirePermission('manage_roles'), asyncHandler(async (req, res) => {
	const roleId = parseInt(req.params.id);
	const role = await roleService.getRoleById(roleId);
	const allPermissions = await roleService.getAllPermissions();

	res.render('admin/role-edit', {
		title: `Editar Rol: ${role.display_name}`,
		role,
		allPermissions,
		user: req.session.user,
		error: req.query.error || null,
		success: req.query.success || null,
	});
}));

router.post('/roles/crear', requirePermission('manage_roles'), asyncHandler(async (req, res) => {
	const validation = validate(createRoleSchema, {
		...req.body,
		permissions: Array.isArray(req.body.permissions) ? req.body.permissions : (req.body.permissions ? [req.body.permissions] : []),
	});

	if (!validation.success) {
		const roles = await roleService.getAllRolesWithUserCount();
		return res.render('admin/roles', {
			title: 'Gestión de Roles',
			roles,
			user: req.session.user,
			error: Object.values(validation.errors).join('. '),
			success: null,
		});
	}

	try {
		await roleService.createRole(validation.data);
		res.redirect('/admin/roles?success=Rol creado exitosamente');
	} catch (err) {
		res.redirect(`/admin/roles?error=${encodeURIComponent(err.message)}`);
	}
}));

router.post('/roles/:id/actualizar', requirePermission('manage_roles'), asyncHandler(async (req, res) => {
	const roleId = parseInt(req.params.id);

	const validation = validate(updateRoleSchema, {
		...req.body,
		permissions: Array.isArray(req.body.permissions) ? req.body.permissions : (req.body.permissions ? [req.body.permissions] : []),
	});

	if (!validation.success) {
		return res.redirect(`/admin/roles/${roleId}?error=${encodeURIComponent(Object.values(validation.errors).join('. '))}`);
	}

	try {
		await roleService.updateRole(roleId, validation.data);
		res.redirect(`/admin/roles/${roleId}?success=Rol actualizado exitosamente`);
	} catch (err) {
		res.redirect(`/admin/roles/${roleId}?error=${encodeURIComponent(err.message)}`);
	}
}));

router.post('/roles/:id/eliminar', requirePermission('manage_roles'), asyncHandler(async (req, res) => {
	const roleId = parseInt(req.params.id);

	try {
		await roleService.deleteRole(roleId);
		res.redirect('/admin/roles?success=Rol eliminado exitosamente');
	} catch (err) {
		res.redirect(`/admin/roles?error=${encodeURIComponent(err.message)}`);
	}
}));

module.exports = router;
