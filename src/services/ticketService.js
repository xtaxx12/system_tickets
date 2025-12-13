/**
 * Servicio de lógica de negocio para Tickets
 * Implementa el patrón Repository con inyección de dependencias.
 */
const { getPool } = require('../db');
const { getRepositoryContainer } = require('../repositories');
const emailService = require('./emailService');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

// Lazy loading del container
let _container = null;
function getContainer() {
	if (!_container) {
		_container = getRepositoryContainer(getPool());
	}
	return _container;
}

/**
 * Servicio de Tickets con inyección de dependencias
 */
class TicketService {
	/**
	 * @param {Object} deps - Dependencias inyectadas
	 * @param {import('../repositories/TicketRepository')} deps.ticketRepository
	 * @param {import('../repositories/CommentRepository')} deps.commentRepository
	 * @param {import('../repositories/NotificationRepository')} deps.notificationRepository
	 */
	constructor(deps = {}) {
		this.ticketRepo = deps.ticketRepository || getContainer().tickets;
		this.commentRepo = deps.commentRepository || getContainer().comments;
		this.notificationRepo = deps.notificationRepository || getContainer().notifications;
		this.userRepo = deps.userRepository || getContainer().users;
	}

	/**
	 * Crear un nuevo ticket
	 * @param {Object} data - Datos del ticket
	 * @param {string|null} email - Email para notificación
	 * @returns {Promise<Object>}
	 */
	async createTicket(data, email = null) {
		const ticket = await this.ticketRepo.create(data);

		// Notificar a admins y supervisores
		try {
			await this._notifyNewTicket(ticket);

			if (data.priority === 'Alta' || data.priority === 'Crítica – Bloquea mi trabajo') {
				await this._notifyHighPriorityUnassigned(ticket);
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
	 * Notifica a admins y supervisores sobre un nuevo ticket
	 * @private
	 */
	async _notifyNewTicket(ticket) {
		const users = await this.notificationRepo.findUsersByRoles(['admin', 'supervisor']);

		const notifications = users.map(user =>
			this.notificationRepo.create({
				user_id: user.id,
				type: 'new_ticket',
				title: '🎫 Nuevo ticket creado',
				message: `Ticket ${ticket.reference} - ${ticket.subject}`,
				ticket_id: ticket.id,
			})
		);

		await Promise.all(notifications);
	}

	/**
	 * Notifica sobre tickets de alta prioridad sin asignar
	 * @private
	 */
	async _notifyHighPriorityUnassigned(ticket) {
		if (ticket.priority === 'Alta' && !ticket.assigned_to) {
			const users = await this.notificationRepo.findUsersByRoles(['admin', 'supervisor']);

			const notifications = users.map(user =>
				this.notificationRepo.create({
					user_id: user.id,
					type: 'high_priority',
					title: '⚠️ Ticket de alta prioridad',
					message: `Ticket ${ticket.reference} sin asignar - ${ticket.subject}`,
					ticket_id: ticket.id,
				})
			);

			await Promise.all(notifications);
		}
	}

	/**
	 * Obtener ticket por referencia
	 * @param {string} reference
	 * @returns {Promise<Object>}
	 */
	async getTicketByReference(reference) {
		const ticket = await this.ticketRepo.findByReference(reference);
		if (!ticket) {
			throw new NotFoundError('Ticket');
		}
		return ticket;
	}

	/**
	 * Obtener ticket con comentarios
	 * @param {string} reference
	 * @param {boolean} includeInternal
	 * @returns {Promise<{ticket: Object, comments: Array}>}
	 */
	async getTicketWithComments(reference, includeInternal = false) {
		const ticket = await this.getTicketByReference(reference);
		const comments = await this.commentRepo.findByTicketId(ticket.id, includeInternal);
		return { ticket, comments };
	}

	/**
	 * Actualizar ticket por token de edición
	 * @param {string} token
	 * @param {Object} updates
	 * @returns {Promise<Object>}
	 */
	async updateTicketByToken(token, updates) {
		const ticket = await this.ticketRepo.findByEditToken(token);
		if (!ticket) {
			throw new NotFoundError('Ticket');
		}

		return this.ticketRepo.updateByToken(token, updates);
	}

	/**
	 * Cambiar estado de ticket
	 * @param {number} ticketId
	 * @param {string} reference
	 * @param {string} newStatus
	 * @param {number|null} assignedTo
	 * @returns {Promise<Object>}
	 */
	async updateTicketStatus(ticketId, reference, newStatus, assignedTo = null) {
		const updated = await this.ticketRepo.updateStatus(ticketId, newStatus);

		// Notificar cambio de estado
		try {
			await this._notifyStatusChange(ticketId, reference, newStatus, assignedTo);
		} catch (err) {
			console.error('Error notificando cambio de estado:', err.message);
		}

		return updated;
	}

	/**
	 * Notifica sobre cambio de estado
	 * @private
	 */
	async _notifyStatusChange(ticketId, ticketReference, newStatus, assignedTo) {
		if (assignedTo && (newStatus === 'Resuelto' || newStatus === 'Cerrado')) {
			await this.notificationRepo.create({
				user_id: assignedTo,
				type: 'status_change',
				title: '🔄 Estado actualizado',
				message: `El ticket ${ticketReference} ahora está: ${newStatus}`,
				ticket_id: ticketId,
			});
		}
	}

	/**
	 * Asignar ticket a técnico
	 * @param {number} ticketId
	 * @param {string} reference
	 * @param {number|null} technicianId
	 * @returns {Promise<Object>}
	 */
	async assignTicket(ticketId, reference, technicianId) {
		const updated = await this.ticketRepo.assign(ticketId, technicianId);

		// Notificar al técnico
		if (technicianId) {
			try {
				await this.notificationRepo.create({
					user_id: technicianId,
					type: 'ticket_assigned',
					title: '📋 Ticket asignado',
					message: `Se te ha asignado el ticket ${reference}`,
					ticket_id: ticketId,
				});
			} catch (err) {
				console.error('Error notificando asignación:', err.message);
			}
		}

		return updated;
	}

	/**
	 * Listar tickets con filtros y paginación
	 * @param {Object} filters
	 * @param {number} page
	 * @param {number} perPage
	 * @returns {Promise<{tickets: Array, pagination: Object}>}
	 */
	async listTickets(filters = {}, page = 1, perPage = 15) {
		const offset = (page - 1) * perPage;
		const tickets = await this.ticketRepo.findAll(filters, perPage, offset);
		const total = await this.ticketRepo.count(filters);
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
	 * @param {Object} filters
	 * @returns {Promise<Object>}
	 */
	async getStats(filters = {}) {
		return this.ticketRepo.getStats(filters);
	}

	/**
	 * Agregar comentario a ticket
	 * @param {number} ticketId
	 * @param {string} reference
	 * @param {Object} commentData
	 * @param {number|null} assignedTo
	 * @param {number|null} commenterId
	 * @returns {Promise<Object>}
	 */
	async addComment(ticketId, reference, commentData, assignedTo = null, commenterId = null) {
		const comment = await this.commentRepo.create({
			ticket_id: ticketId,
			...commentData,
		});

		// Notificar si no es interno y hay técnico asignado
		if (!commentData.is_internal && assignedTo && assignedTo !== commenterId) {
			try {
				await this.notificationRepo.create({
					user_id: assignedTo,
					type: 'new_comment',
					title: '💬 Nuevo comentario',
					message: `Nuevo comentario en el ticket ${reference}`,
					ticket_id: ticketId,
				});
			} catch (err) {
				console.error('Error notificando comentario:', err.message);
			}
		}

		return comment;
	}

	/**
	 * Obtener todos los técnicos disponibles
	 * @returns {Promise<Array>}
	 */
	async getAllTechnicians() {
		return this.userRepo.findAllTechnicians();
	}
}

// Instancia singleton para compatibilidad con código existente
const defaultInstance = new TicketService();

module.exports = {
	// Clase para testing y DI
	TicketService,

	// Métodos del singleton para compatibilidad
	createTicket: (data, email) => defaultInstance.createTicket(data, email),
	getTicketByReference: (reference) => defaultInstance.getTicketByReference(reference),
	getTicketWithComments: (reference, includeInternal) =>
		defaultInstance.getTicketWithComments(reference, includeInternal),
	updateTicketByToken: (token, updates) => defaultInstance.updateTicketByToken(token, updates),
	updateTicketStatus: (ticketId, reference, newStatus, assignedTo) =>
		defaultInstance.updateTicketStatus(ticketId, reference, newStatus, assignedTo),
	assignTicket: (ticketId, reference, technicianId) =>
		defaultInstance.assignTicket(ticketId, reference, technicianId),
	listTickets: (filters, page, perPage) => defaultInstance.listTickets(filters, page, perPage),
	getStats: (filters) => defaultInstance.getStats(filters),
	addComment: (ticketId, reference, commentData, assignedTo, commenterId) =>
		defaultInstance.addComment(ticketId, reference, commentData, assignedTo, commenterId),
	getAllTechnicians: () => defaultInstance.getAllTechnicians(),
};
