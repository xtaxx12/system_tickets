const { getPool } = require('../db');

/**
 * Crear una notificación para un usuario
 */
async function createNotification({ user_id, type, title, message, ticket_id = null }) {
	const { rows } = await getPool().query(
		`INSERT INTO notifications (user_id, type, title, message, ticket_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING *`,
		[user_id, type, title, message, ticket_id]
	);
	return rows[0];
}

/**
 * Obtener notificaciones no leídas de un usuario (ordenadas por más reciente)
 */
async function getUnreadNotifications(user_id, limit = 10) {
	const { rows } = await getPool().query(
		`SELECT n.*, t.reference as ticket_reference
		 FROM notifications n
		 LEFT JOIN tickets t ON n.ticket_id = t.id
		 WHERE n.user_id = $1 AND n.is_read = false
		 ORDER BY n.created_at DESC
		 LIMIT $2`,
		[user_id, limit]
	);
	return rows;
}

/**
 * Obtener todas las notificaciones de un usuario (con paginación)
 */
async function getAllNotifications(user_id, limit = 20, offset = 0) {
	const { rows } = await getPool().query(
		`SELECT n.*, t.reference as ticket_reference
		 FROM notifications n
		 LEFT JOIN tickets t ON n.ticket_id = t.id
		 WHERE n.user_id = $1
		 ORDER BY n.created_at DESC
		 LIMIT $2 OFFSET $3`,
		[user_id, limit, offset]
	);
	return rows;
}

/**
 * Contar notificaciones no leídas de un usuario
 */
async function getUnreadCount(user_id) {
	const { rows } = await getPool().query(
		`SELECT COUNT(*) as count
		 FROM notifications
		 WHERE user_id = $1 AND is_read = false`,
		[user_id]
	);
	return parseInt(rows[0].count);
}

/**
 * Marcar una notificación como leída
 */
async function markAsRead(notification_id, user_id) {
	await getPool().query(
		`UPDATE notifications
		 SET is_read = true
		 WHERE id = $1 AND user_id = $2`,
		[notification_id, user_id]
	);
}

/**
 * Marcar todas las notificaciones de un usuario como leídas
 */
async function markAllAsRead(user_id) {
	await getPool().query(
		`UPDATE notifications
		 SET is_read = true
		 WHERE user_id = $1 AND is_read = false`,
		[user_id]
	);
}

/**
 * Eliminar notificaciones antiguas (más de 30 días)
 */
async function cleanOldNotifications() {
	await getPool().query(
		`DELETE FROM notifications
		 WHERE created_at < NOW() - INTERVAL '30 days'`
	);
}

// ============================================================================
// Funciones específicas para crear notificaciones según eventos
// ============================================================================

/**
 * Notificar a admins y supervisores sobre un nuevo ticket
 */
async function notifyNewTicket(ticket) {
	const { rows: users } = await getPool().query(
		`SELECT id FROM users WHERE role IN ('admin', 'supervisor')`
	);

	const notifications = users.map(user =>
		createNotification({
			user_id: user.id,
			type: 'new_ticket',
			title: '🎫 Nuevo ticket creado',
			message: `Ticket ${ticket.reference} - ${ticket.subject}`,
			ticket_id: ticket.id
		})
	);

	await Promise.all(notifications);
}

/**
 * Notificar al técnico cuando se le asigna un ticket
 */
async function notifyTicketAssigned(ticket_id, technician_id, ticket_reference) {
	await createNotification({
		user_id: technician_id,
		type: 'ticket_assigned',
		title: '📋 Ticket asignado',
		message: `Se te ha asignado el ticket ${ticket_reference}`,
		ticket_id
	});
}

/**
 * Notificar sobre un nuevo comentario en un ticket asignado
 */
async function notifyNewComment(ticket_id, ticket_reference, assigned_to, commenter_id) {
	// Solo notificar si el ticket está asignado y el comentario no es del técnico asignado
	if (assigned_to && assigned_to !== commenter_id) {
		await createNotification({
			user_id: assigned_to,
			type: 'new_comment',
			title: '💬 Nuevo comentario',
			message: `Nuevo comentario en el ticket ${ticket_reference}`,
			ticket_id
		});
	}
}

/**
 * Notificar sobre tickets de alta prioridad sin asignar
 */
async function notifyHighPriorityUnassigned(ticket) {
	if (ticket.priority === 'Alta' && !ticket.assigned_to) {
		const { rows: users } = await getPool().query(
			`SELECT id FROM users WHERE role IN ('admin', 'supervisor')`
		);

		const notifications = users.map(user =>
			createNotification({
				user_id: user.id,
				type: 'high_priority',
				title: '⚠️ Ticket de alta prioridad',
				message: `Ticket ${ticket.reference} sin asignar - ${ticket.subject}`,
				ticket_id: ticket.id
			})
		);

		await Promise.all(notifications);
	}
}

/**
 * Notificar sobre cambio de estado de ticket
 */
async function notifyStatusChange(ticket_id, ticket_reference, new_status, assigned_to) {
	if (assigned_to && (new_status === 'Resuelto' || new_status === 'Cerrado')) {
		await createNotification({
			user_id: assigned_to,
			type: 'status_change',
			title: '🔄 Estado actualizado',
			message: `El ticket ${ticket_reference} ahora está: ${new_status}`,
			ticket_id
		});
	}
}

module.exports = {
	createNotification,
	getUnreadNotifications,
	getAllNotifications,
	getUnreadCount,
	markAsRead,
	markAllAsRead,
	cleanOldNotifications,
	notifyNewTicket,
	notifyTicketAssigned,
	notifyNewComment,
	notifyHighPriorityUnassigned,
	notifyStatusChange
};
