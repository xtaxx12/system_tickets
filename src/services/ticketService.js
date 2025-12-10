/**
 * Servicio de lógica de negocio para Tickets
 */
const ticketModel = require('../models/tickets');
const commentModel = require('../models/comments');
const notificationModel = require('../models/notifications');
const emailService = require('./emailService');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

/**
 * Crear un nuevo ticket
 */
async function createTicket(data, email = null) {
	const ticket = await ticketModel.createTicket(data);

	// Notificar a admins y supervisores
	try {
		await notificationModel.notifyNewTicket(ticket);

		if (data.priority === 'Alta' || data.priority === 'Crítica – Bloquea mi trabajo') {
			await notificationModel.notifyHighPriorityUnassigned(ticket);
		}
	} catch (err) {
		console.error('Error creando notificaciones:', err.message);
	}

	// Enviar email si se proporcionó
	if (email) {
		await emailService.sendTicketCreatedEmail(ticket, email);
	}

	return ticket;
}

/**
 * Obtener ticket por referencia
 */
async function getTicketByReference(reference) {
	const ticket = await ticketModel.findByReference(reference);
	if (!ticket) {
		throw new NotFoundError('Ticket');
	}
	return ticket;
}

/**
 * Obtener ticket con comentarios
 */
async function getTicketWithComments(reference, includeInternal = false) {
	const ticket = await getTicketByReference(reference);
	const comments = await commentModel.getCommentsByTicketId(ticket.id, includeInternal);
	return { ticket, comments };
}

/**
 * Actualizar ticket por token de edición
 */
async function updateTicketByToken(token, updates) {
	const ticket = await ticketModel.findByEditToken(token);
	if (!ticket) {
		throw new NotFoundError('Ticket');
	}

	const updated = await ticketModel.updateTicketByToken(token, updates);
	return updated;
}

/**
 * Cambiar estado de ticket
 */
async function updateTicketStatus(ticketId, reference, newStatus, assignedTo = null) {
	const updated = await ticketModel.updateStatusById(ticketId, newStatus);

	// Notificar cambio de estado
	try {
		await notificationModel.notifyStatusChange(ticketId, reference, newStatus, assignedTo);
	} catch (err) {
		console.error('Error notificando cambio de estado:', err.message);
	}

	return updated;
}

/**
 * Asignar ticket a técnico
 */
async function assignTicket(ticketId, reference, technicianId) {
	const updated = await ticketModel.assignTicket(ticketId, technicianId);

	// Notificar al técnico
	if (technicianId) {
		try {
			await notificationModel.notifyTicketAssigned(ticketId, technicianId, reference);
		} catch (err) {
			console.error('Error notificando asignación:', err.message);
		}
	}

	return updated;
}

/**
 * Listar tickets con filtros y paginación
 */
async function listTickets(filters = {}, page = 1, perPage = 15) {
	const offset = (page - 1) * perPage;
	const tickets = await ticketModel.listTickets(filters, perPage, offset);
	const total = await ticketModel.countTickets(filters);
	const totalPages = Math.ceil(total / perPage);

	return {
		tickets,
		pagination: {
			currentPage: page,
			totalPages,
			totalTickets: total,
			perPage,
			hasNext: page < totalPages,
			hasPrev: page > 1,
		},
	};
}

/**
 * Obtener estadísticas de tickets
 */
async function getStats(filters = {}) {
	return ticketModel.getTicketStats(filters);
}

/**
 * Agregar comentario a ticket
 */
async function addComment(ticketId, reference, commentData, assignedTo = null, commenterId = null) {
	const comment = await commentModel.createComment({
		ticket_id: ticketId,
		...commentData,
	});

	// Notificar si no es interno y hay técnico asignado
	if (!commentData.is_internal && assignedTo && assignedTo !== commenterId) {
		try {
			await notificationModel.notifyNewComment(ticketId, reference, assignedTo, commenterId);
		} catch (err) {
			console.error('Error notificando comentario:', err.message);
		}
	}

	return comment;
}

/**
 * Obtener todos los técnicos disponibles
 */
async function getAllTechnicians() {
	return ticketModel.getAllTechnicians();
}

module.exports = {
	createTicket,
	getTicketByReference,
	getTicketWithComments,
	updateTicketByToken,
	updateTicketStatus,
	assignTicket,
	listTickets,
	getStats,
	addComment,
	getAllTechnicians,
};
