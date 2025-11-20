const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { getPool } = require('../db');
const { STATUSES, listTickets, findByReference, updateStatusById, countTickets, getTicketStats, getAllTechnicians, assignTicket } = require('../models/tickets');
const {
	createComment,
	getCommentsByTicketId,
} = require('../models/comments');
const {
	notifyTicketAssigned,
	notifyNewComment,
	notifyStatusChange,
	getUnreadNotifications,
	getUnreadCount,
	markAsRead,
	markAllAsRead,
} = require('../models/notifications');
const {
	userHasPermission,
	userHasAnyPermission,
	getUserPermissions
} = require('../models/permissions');

const router = express.Router();

function getTransport() {
	if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: String(process.env.SMTP_SECURE || 'false') === 'true',
		auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
	});
}

// Middleware para verificar autenticación básica
function requireAuth(req, res, next) {
	if (req.session && req.session.user) return next();
	return res.redirect('/admin/login');
}

// Middleware para roles con permisos administrativos (admin, supervisor, tecnico)
function requireAdmin(req, res, next) {
	if (req.session && req.session.user && ['admin', 'supervisor', 'tecnico'].includes(req.session.user.role)) {
		return next();
	}
	return res.redirect('/admin/login');
}

// Middleware solo para admin
function requireSuperAdmin(req, res, next) {
	if (req.session && req.session.user && req.session.user.role === 'admin') {
		return next();
	}
	return res.status(403).render('admin/error', {
		title: 'Acceso Denegado',
		message: 'No tienes permisos para acceder a esta sección',
		user: req.session.user
	});
}

// Middleware para admin y supervisor
function requireSupervisor(req, res, next) {
	if (req.session && req.session.user && ['admin', 'supervisor'].includes(req.session.user.role)) {
		return next();
	}
	return res.status(403).render('admin/error', {
		title: 'Acceso Denegado',
		message: 'Solo administradores y supervisores pueden acceder a esta sección',
		user: req.session.user
	});
}

// ============================================================================
// Middlewares basados en permisos granulares
// ============================================================================

/**
 * Middleware genérico para verificar un permiso específico
 */
function requirePermission(permissionName) {
	return async (req, res, next) => {
		if (!req.session || !req.session.user) {
			return res.redirect('/admin/login');
		}

		try {
			const hasPermission = await userHasPermission(req.session.user.id, permissionName);
			if (hasPermission) {
				return next();
			}

			return res.status(403).render('admin/error', {
				title: 'Acceso Denegado',
				message: 'No tienes permisos suficientes para realizar esta acción',
				user: req.session.user
			});
		} catch (err) {
			console.error('Error verificando permisos:', err);
			return res.status(500).send('Error al verificar permisos');
		}
	};
}

/**
 * Middleware para verificar si el usuario tiene alguno de los permisos especificados
 */
function requireAnyPermission(...permissionNames) {
	return async (req, res, next) => {
		if (!req.session || !req.session.user) {
			return res.redirect('/admin/login');
		}

		try {
			const hasPermission = await userHasAnyPermission(req.session.user.id, permissionNames);
			if (hasPermission) {
				return next();
			}

			return res.status(403).render('admin/error', {
				title: 'Acceso Denegado',
				message: 'No tienes permisos suficientes para realizar esta acción',
				user: req.session.user
			});
		} catch (err) {
			console.error('Error verificando permisos:', err);
			return res.status(500).send('Error al verificar permisos');
		}
	};
}

/**
 * Middleware para agregar permisos del usuario a la solicitud
 */
async function addUserPermissions(req, res, next) {
	if (req.session && req.session.user) {
		try {
			req.userPermissions = await getUserPermissions(req.session.user.id);
		} catch (err) {
			console.error('Error obteniendo permisos:', err);
			req.userPermissions = [];
		}
	} else {
		req.userPermissions = [];
	}
	next();
}

router.get('/login', (req, res) => {
	res.render('admin/login', { title: 'Acceso Admin', error: null });
});

router.post('/login', async (req, res) => {
	const { username, password } = req.body;
	if (!username || !password) return res.render('admin/login', { title: 'Acceso Admin', error: 'Credenciales inválidas' });
	const { rows } = await getPool().query('SELECT * FROM users WHERE username = $1', [username]);
	const user = rows[0];
	if (!user) return res.render('admin/login', { title: 'Acceso Admin', error: 'Usuario o contraseña incorrectos' });
	const ok = bcrypt.compareSync(password, user.password_hash);
	if (!ok) return res.render('admin/login', { title: 'Acceso Admin', error: 'Usuario o contraseña incorrectos' });
	req.session.user = { id: user.id, username: user.username, role: user.role };
	res.redirect('/admin');
});

router.post('/logout', (req, res) => {
	req.session.destroy(() => {
		res.redirect('/admin/login');
	});
});

router.get('/perfil', requireAdmin, async (req, res) => {
	const { rows } = await getPool().query('SELECT id, username, role FROM users WHERE id = $1', [req.session.user.id]);
	const user = rows[0];
	if (!user) return res.redirect('/admin/login');
	res.render('admin/perfil', {
		title: 'Mi Perfil',
		user,
		error: null,
		success: null
	});
});

router.post('/perfil', requireAdmin, async (req, res) => {
	const { username, current_password, new_password, confirm_password } = req.body;
	const errors = [];
	let success = null;

	try {
		const { rows } = await getPool().query('SELECT * FROM users WHERE id = $1', [req.session.user.id]);
		const user = rows[0];
		if (!user) return res.redirect('/admin/login');

		// Validar cambio de nombre de usuario
		if (username && username !== user.username) {
			if (username.length < 3) {
				errors.push('El nombre de usuario debe tener al menos 3 caracteres');
			} else {
				// Verificar que el nuevo nombre no esté en uso
				const { rows: existingUsers } = await getPool().query(
					'SELECT id FROM users WHERE username = $1 AND id != $2',
					[username, req.session.user.id]
				);
				if (existingUsers.length > 0) {
					errors.push('El nombre de usuario ya está en uso');
				} else {
					await getPool().query('UPDATE users SET username = $1 WHERE id = $2', [username, req.session.user.id]);
					req.session.user.username = username;
					success = 'Nombre de usuario actualizado correctamente';
				}
			}
		}

		// Validar cambio de contraseña
		if (new_password || current_password) {
			if (!current_password) {
				errors.push('Debe ingresar su contraseña actual');
			} else if (!bcrypt.compareSync(current_password, user.password_hash)) {
				errors.push('La contraseña actual es incorrecta');
			} else if (!new_password) {
				errors.push('Debe ingresar una nueva contraseña');
			} else if (new_password.length < 6) {
				errors.push('La nueva contraseña debe tener al menos 6 caracteres');
			} else if (new_password !== confirm_password) {
				errors.push('Las contraseñas no coinciden');
			} else {
				const newHash = bcrypt.hashSync(new_password, 10);
				await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.session.user.id]);
				success = success ? success + ' y contraseña actualizada' : 'Contraseña actualizada correctamente';
			}
		}

		// Obtener usuario actualizado
		const { rows: updatedRows } = await getPool().query('SELECT id, username, role FROM users WHERE id = $1', [req.session.user.id]);
		const updatedUser = updatedRows[0];

		res.render('admin/perfil', {
			title: 'Mi Perfil',
			user: updatedUser,
			error: errors.length > 0 ? errors.join('. ') : null,
			success
		});
	} catch (err) {
		console.error('Error actualizando perfil:', err);
		const { rows } = await getPool().query('SELECT id, username, role FROM users WHERE id = $1', [req.session.user.id]);
		res.render('admin/perfil', {
			title: 'Mi Perfil',
			user: rows[0],
			error: 'Error al actualizar el perfil',
			success: null
		});
	}
});

router.get('/', requireAdmin, async (req, res) => {
	const { status, priority, support_type, assigned_to, my_tickets, page = 1 } = req.query;
	const currentPage = parseInt(page) || 1;
	const perPage = 15;
	const offset = (currentPage - 1) * perPage;

	// Si my_tickets está activado, filtrar por el usuario actual
	const filters = { status, priority, support_type };
	if (my_tickets === 'true') {
		filters.assigned_to = req.session.user.id;
	} else if (assigned_to) {
		filters.assigned_to = assigned_to;
	}

	const tickets = await listTickets(filters, perPage, offset);
	const totalTickets = await countTickets(filters);
	const totalPages = Math.ceil(totalTickets / perPage);
	const technicians = await getAllTechnicians();

	// Obtener estadísticas totales (sin filtro de status)
	const statsFilters = { priority, support_type };
	const stats = await getTicketStats(statsFilters);

	// Obtener estadísticas personales del usuario
	const myStatsFilters = { assigned_to: req.session.user.id, priority, support_type };
	const myStats = await getTicketStats(myStatsFilters);
	const myTotalTickets = await countTickets({ assigned_to: req.session.user.id });

	// Obtener permisos del usuario
	const userPermissions = await getUserPermissions(req.session.user.id);

	res.render('admin/list', {
		title: 'Panel Admin',
		tickets,
		filters: { status, priority, support_type, assigned_to, my_tickets },
		STATUSES,
		user: req.session.user,
		userPermissions,
		stats,
		myStats,
		myTotalTickets,
		technicians,
		pagination: {
			currentPage,
			totalPages,
			totalTickets,
			perPage,
			hasNext: currentPage < totalPages,
			hasPrev: currentPage > 1,
		},
	});
});

router.get('/tickets/:reference', requireAdmin, async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const comments = await getCommentsByTicketId(ticket.id, true);
	const technicians = await getAllTechnicians();

	// Obtener permisos del usuario
	const userPermissions = await getUserPermissions(req.session.user.id);

	res.render('admin/detail', {
		title: `Admin - ${ticket.reference}`,
		ticket,
		comments,
		STATUSES,
		technicians,
		user: req.session.user,
		userPermissions
	});
});

router.post('/tickets/:reference/estado', requireAdmin, async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const { status } = req.body;
	try {
		await updateStatusById(ticket.id, status);

		// Notificar sobre cambio de estado
		try {
			await notifyStatusChange(ticket.id, ticket.reference, status, ticket.assigned_to);
		} catch (notifErr) {
			console.error('Error al crear notificación de estado:', notifErr);
		}

		res.redirect(`/admin/tickets/${ticket.reference}`);
	} catch (e) {
		res.status(400).send('Estado inválido');
	}
});

router.post('/tickets/:reference/asignar', requirePermission('assign_tickets'), async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const { technician_id } = req.body;
	try {
		const technicianIdValue = technician_id && technician_id !== '' ? parseInt(technician_id) : null;
		await assignTicket(ticket.id, technicianIdValue);

		// Notificar al técnico asignado
		if (technicianIdValue) {
			try {
				await notifyTicketAssigned(ticket.id, technicianIdValue, ticket.reference);
			} catch (notifErr) {
				console.error('Error al crear notificación de asignación:', notifErr);
			}
		}

		res.redirect(`/admin/tickets/${ticket.reference}`);
	} catch (e) {
		console.error('Error asignando ticket:', e);
		res.status(500).send('Error al asignar ticket');
	}
});

// Gestión de Usuarios (solo admin)
router.get('/usuarios', requireSuperAdmin, async (req, res) => {
	try {
		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: null,
			success: null
		});
	} catch (err) {
		console.error('Error obteniendo usuarios:', err);
		res.status(500).send('Error al cargar usuarios');
	}
});

router.post('/usuarios/crear', requireSuperAdmin, async (req, res) => {
	const { username, password, role_id } = req.body;
	const errors = [];

	try {
		if (!username || username.length < 3) errors.push('El nombre de usuario debe tener al menos 3 caracteres');
		if (!password || password.length < 6) errors.push('La contraseña debe tener al menos 6 caracteres');
		if (!role_id) errors.push('Debe seleccionar un rol');

		if (errors.length === 0) {
			const { rows: existing } = await getPool().query('SELECT id FROM users WHERE username = $1', [username]);
			if (existing.length > 0) {
				errors.push('El nombre de usuario ya existe');
			}
		}

		if (errors.length > 0) {
			const { rows } = await getPool().query(`
				SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
				FROM users u
				LEFT JOIN roles r ON u.role_id = r.id
				ORDER BY u.created_at DESC
			`);
			const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

			return res.render('admin/usuarios', {
				title: 'Gestión de Usuarios',
				users: rows,
				roles: roles,
				user: req.session.user,
				error: errors.join('. '),
				success: null
			});
		}

		// Obtener el nombre del rol para mantener compatibilidad
		const { rows: roleRows } = await getPool().query('SELECT name FROM roles WHERE id = $1', [role_id]);
		const roleName = roleRows[0].name;

		const hash = bcrypt.hashSync(password, 10);
		await getPool().query(
			'INSERT INTO users (username, password_hash, role, role_id) VALUES ($1, $2, $3, $4)',
			[username, hash, roleName, role_id]
		);

		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: null,
			success: `Usuario ${username} creado exitosamente`
		});
	} catch (err) {
		console.error('Error creando usuario:', err);
		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: 'Error al crear el usuario',
			success: null
		});
	}
});

router.post('/usuarios/:id/cambiar-rol', requireSuperAdmin, async (req, res) => {
	const userId = parseInt(req.params.id);
	const { role_id } = req.body;

	try {
		// No permitir cambiar el rol del propio usuario
		if (userId === req.session.user.id) {
			const { rows } = await getPool().query(`
				SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
				FROM users u
				LEFT JOIN roles r ON u.role_id = r.id
				ORDER BY u.created_at DESC
			`);
			const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

			return res.render('admin/usuarios', {
				title: 'Gestión de Usuarios',
				users: rows,
				roles: roles,
				user: req.session.user,
				error: 'No puedes cambiar tu propio rol',
				success: null
			});
		}

		// Validar que el rol existe
		const { rows: roleRows } = await getPool().query('SELECT id, name FROM roles WHERE id = $1', [role_id]);
		if (roleRows.length === 0) {
			throw new Error('Rol no válido');
		}

		const roleName = roleRows[0].name;

		// Actualizar el rol del usuario
		await getPool().query(
			'UPDATE users SET role = $1, role_id = $2 WHERE id = $3',
			[roleName, role_id, userId]
		);

		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: null,
			success: 'Rol actualizado exitosamente'
		});
	} catch (err) {
		console.error('Error cambiando rol:', err);
		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: 'Error al cambiar el rol del usuario',
			success: null
		});
	}
});

router.post('/usuarios/:id/eliminar', requireSuperAdmin, async (req, res) => {
	const userId = parseInt(req.params.id);

	try {
		// No permitir eliminar al propio usuario
		if (userId === req.session.user.id) {
			const { rows } = await getPool().query(`
				SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
				FROM users u
				LEFT JOIN roles r ON u.role_id = r.id
				ORDER BY u.created_at DESC
			`);
			const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

			return res.render('admin/usuarios', {
				title: 'Gestión de Usuarios',
				users: rows,
				roles: roles,
				user: req.session.user,
				error: 'No puedes eliminar tu propia cuenta',
				success: null
			});
		}

		await getPool().query('DELETE FROM users WHERE id = $1', [userId]);

		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: null,
			success: 'Usuario eliminado exitosamente'
		});
	} catch (err) {
		console.error('Error eliminando usuario:', err);
		const { rows } = await getPool().query(`
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
		`);
		const { rows: roles } = await getPool().query('SELECT id, name, display_name FROM roles ORDER BY is_system DESC, name');

		res.render('admin/usuarios', {
			title: 'Gestión de Usuarios',
			users: rows,
			roles: roles,
			user: req.session.user,
			error: 'Error al eliminar el usuario. Puede que tenga tickets asignados.',
			success: null
		});
	}
});

router.post('/tickets/:reference/comments', requireAdmin, async (req, res) => {
	try {
		const ticket = await findByReference(req.params.reference);
		if (!ticket) return res.status(404).send('Ticket no encontrado');

		const { content, is_internal } = req.body;
		if (!content) {
			return res.status(400).send('El contenido es requerido');
		}

		const isInternal = is_internal === 'true' || is_internal === true;

		await createComment({
			ticket_id: ticket.id,
			user_id: req.session.user.id,
			author_name: req.session.user.username,
			content,
			is_internal: isInternal,
		});

		// Notificar al técnico asignado sobre el nuevo comentario (si no es interno y no es él quien comenta)
		if (!isInternal && ticket.assigned_to) {
			try {
				await notifyNewComment(ticket.id, ticket.reference, ticket.assigned_to, req.session.user.id);
			} catch (notifErr) {
				console.error('Error al crear notificación de comentario:', notifErr);
			}
		}

		// Notificación por email si no es comentario interno
		if (!isInternal) {
			const transporter = getTransport();
			if (transporter) {
				// Buscar emails de comentarios previos del ticket
				const prevComments = await getCommentsByTicketId(ticket.id, false);
				const emails = [...new Set(prevComments.map(c => c.author_email).filter(e => e))];

				if (emails.length > 0) {
					const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
					const ticketUrl = `${baseUrl}/tickets/${ticket.reference}`;

					try {
						await transporter.sendMail({
							from: process.env.SMTP_FROM || 'soporte@example.com',
							to: emails.join(','),
							subject: `Respuesta en ticket ${ticket.reference}`,
							html: `
								<p>Hola,</p>
								<p>El equipo de soporte ha respondido en el ticket <b>${ticket.reference}</b>.</p>
								<p><b>Respuesta:</b></p>
								<p>${content}</p>
								<p><a href="${ticketUrl}">Ver ticket completo</a></p>
							`,
						});
					} catch (emailErr) {
						console.error('Error enviando email:', emailErr);
					}
				}
			}
		}

		res.redirect(`/admin/tickets/${ticket.reference}`);
	} catch (err) {
		console.error(err);
		res.status(500).send('Error al crear comentario');
	}
});

// ============================================================================
// Rutas de Notificaciones
// ============================================================================

// Obtener notificaciones no leídas (JSON)
router.get('/notifications', requireAdmin, async (req, res) => {
	try {
		const notifications = await getUnreadNotifications(req.session.user.id, 10);
		const count = await getUnreadCount(req.session.user.id);
		res.json({ notifications, count });
	} catch (err) {
		console.error('Error obteniendo notificaciones:', err);
		res.status(500).json({ error: 'Error al obtener notificaciones' });
	}
});

// Marcar una notificación como leída
router.post('/notifications/:id/read', requireAdmin, async (req, res) => {
	try {
		await markAsRead(parseInt(req.params.id), req.session.user.id);
		res.json({ success: true });
	} catch (err) {
		console.error('Error marcando notificación como leída:', err);
		res.status(500).json({ error: 'Error al marcar notificación' });
	}
});

// Marcar todas las notificaciones como leídas
router.post('/notifications/read-all', requireAdmin, async (req, res) => {
	try {
		await markAllAsRead(req.session.user.id);
		res.json({ success: true });
	} catch (err) {
		console.error('Error marcando todas las notificaciones:', err);
		res.status(500).json({ error: 'Error al marcar notificaciones' });
	}
});

// ============================================================================
// Rutas de Gestión de Roles y Permisos
// ============================================================================

const {
	getAllPermissions,
	getAllRoles,
	getRoleById,
	createRole,
	updateRole,
	deleteRole,
	countUsersByRole
} = require('../models/permissions');

// Listar roles y permisos (solo con permiso manage_roles)
router.get('/roles', requirePermission('manage_roles'), async (req, res) => {
	try {
		const roles = await getAllRoles();
		const userCounts = await countUsersByRole();

		// Combinar información de roles con contadores
		const rolesWithCounts = roles.map(role => {
			const countInfo = userCounts.find(uc => uc.id === role.id);
			return {
				...role,
				user_count: countInfo ? parseInt(countInfo.user_count) : 0
			};
		});

		res.render('admin/roles', {
			title: 'Gestión de Roles',
			roles: rolesWithCounts,
			user: req.session.user,
			error: req.query.error || null,
			success: req.query.success || null
		});
	} catch (err) {
		console.error('Error obteniendo roles:', err);
		res.status(500).send('Error al cargar roles');
	}
});

// Ver/editar rol específico
router.get('/roles/:id', requirePermission('manage_roles'), async (req, res) => {
	try {
		const roleId = parseInt(req.params.id);
		const role = await getRoleById(roleId);

		if (!role) {
			return res.status(404).send('Rol no encontrado');
		}

		const allPermissions = await getAllPermissions();

		res.render('admin/role-edit', {
			title: `Editar Rol: ${role.display_name}`,
			role,
			allPermissions,
			user: req.session.user,
			error: req.query.error || null,
			success: req.query.success || null
		});
	} catch (err) {
		console.error('Error obteniendo rol:', err);
		res.status(500).send('Error al cargar rol');
	}
});

// Crear nuevo rol
router.post('/roles/crear', requirePermission('manage_roles'), async (req, res) => {
	try {
		const { name, display_name, description, permissions } = req.body;
		const errors = [];

		if (!name || name.length < 3) errors.push('El nombre debe tener al menos 3 caracteres');
		if (!display_name) errors.push('El nombre visible es requerido');
		if (!/^[a-z_]+$/.test(name)) errors.push('El nombre solo puede contener letras minúsculas y guiones bajos');

		if (errors.length > 0) {
			const roles = await getAllRoles();
			const userCounts = await countUsersByRole();
			const rolesWithCounts = roles.map(role => {
				const countInfo = userCounts.find(uc => uc.id === role.id);
				return {
					...role,
					user_count: countInfo ? parseInt(countInfo.user_count) : 0
				};
			});

			return res.render('admin/roles', {
				title: 'Gestión de Roles',
				roles: rolesWithCounts,
				user: req.session.user,
				error: errors.join('. '),
				success: null
			});
		}

		const permissionArray = Array.isArray(permissions) ? permissions : (permissions ? [permissions] : []);
		await createRole({ name, display_name, description, permissions: permissionArray });

		res.redirect('/admin/roles?success=Rol creado exitosamente');
	} catch (err) {
		console.error('Error creando rol:', err);
		const roles = await getAllRoles();
		const userCounts = await countUsersByRole();
		const rolesWithCounts = roles.map(role => {
			const countInfo = userCounts.find(uc => uc.id === role.id);
			return {
				...role,
				user_count: countInfo ? parseInt(countInfo.user_count) : 0
			};
		});

		res.render('admin/roles', {
			title: 'Gestión de Roles',
			roles: rolesWithCounts,
			user: req.session.user,
			error: 'Error al crear el rol. El nombre puede ya estar en uso.',
			success: null
		});
	}
});

// Actualizar rol
router.post('/roles/:id/actualizar', requirePermission('manage_roles'), async (req, res) => {
	try {
		const roleId = parseInt(req.params.id);
		const { display_name, description, permissions } = req.body;

		const permissionArray = Array.isArray(permissions) ? permissions : (permissions ? [permissions] : []);
		await updateRole(roleId, { display_name, description, permissions: permissionArray });

		res.redirect(`/admin/roles/${roleId}?success=Rol actualizado exitosamente`);
	} catch (err) {
		console.error('Error actualizando rol:', err);
		const roleId = parseInt(req.params.id);
		const role = await getRoleById(roleId);
		const allPermissions = await getAllPermissions();

		res.render('admin/role-edit', {
			title: `Editar Rol: ${role.display_name}`,
			role,
			allPermissions,
			user: req.session.user,
			error: 'Error al actualizar el rol',
			success: null
		});
	}
});

// Eliminar rol
router.post('/roles/:id/eliminar', requirePermission('manage_roles'), async (req, res) => {
	try {
		const roleId = parseInt(req.params.id);
		await deleteRole(roleId);
		res.redirect('/admin/roles?success=Rol eliminado exitosamente');
	} catch (err) {
		console.error('Error eliminando rol:', err);
		res.redirect(`/admin/roles?error=${encodeURIComponent(err.message)}`);
	}
});

module.exports = router;

