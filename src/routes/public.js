const express = require('express');
const { SUPPORT_TYPES, PRIORITIES } = require('../repositories/TicketRepository');
const ticketService = require('../services/ticketService');
const emailService = require('../services/emailService');
const { upload, handleUploadError } = require('../middleware/upload');
const { ticketCreationLimiter, commentLimiter } = require('../middleware/security');
const { asyncHandler, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { validate, createTicketSchema, updateTicketSchema, createCommentSchema } = require('../validators');

const router = express.Router();

// ============================================================================
// Página principal - Crear ticket
// ============================================================================
router.get('/', (req, res) => {
	res.render('public/new', {
		title: 'Nuevo Ticket',
		SUPPORT_TYPES,
		PRIORITIES,
		errors: {},
		data: {},
	});
});

// ============================================================================
// Crear ticket
// ============================================================================
router.post('/tickets',
	ticketCreationLimiter,
	upload.single('image'),
	handleUploadError,
	asyncHandler(async (req, res) => {
		const validation = validate(createTicketSchema, req.body);

		if (!validation.success) {
			return res.status(400).render('public/new', {
				title: 'Nuevo Ticket',
				SUPPORT_TYPES,
				PRIORITIES,
				errors: validation.errors,
				data: req.body,
			});
		}

		const data = validation.data;
		data.image_path = req.file ? '/uploads/' + req.file.filename : null;

		const ticket = await ticketService.createTicket(data, data.email);

		res.redirect(`/tickets/${ticket.reference}`);
	})
);

// ============================================================================
// Listar tickets
// ============================================================================
router.get('/tickets', asyncHandler(async (req, res) => {
	const { status, priority, support_type, page = 1 } = req.query;
	const currentPage = parseInt(page) || 1;

	const filters = { status, priority, support_type };
	const { tickets, pagination } = await ticketService.listTickets(filters, currentPage, 10);
	const stats = await ticketService.getStats({ priority, support_type });

	res.render('public/list', {
		title: 'Listado de Tickets',
		tickets,
		filters,
		stats,
		pagination,
	});
}));

// ============================================================================
// Ver ticket
// ============================================================================
router.get('/tickets/:reference', asyncHandler(async (req, res) => {
	const { ticket, comments } = await ticketService.getTicketWithComments(req.params.reference, false);

	res.render('public/detail', {
		title: `Ticket ${ticket.reference}`,
		ticket,
		comments,
	});
}));

// ============================================================================
// Editar ticket (con token)
// ============================================================================
router.get('/tickets/:reference/editar', asyncHandler(async (req, res) => {
	const ticket = await ticketService.getTicketByReference(req.params.reference);
	const token = req.query.token;

	if (!token || token !== ticket.edit_token) {
		throw new ForbiddenError('Token de edición inválido');
	}

	res.render('public/edit', {
		title: `Editar ${ticket.reference}`,
		ticket,
		SUPPORT_TYPES,
		PRIORITIES,
		errors: {},
	});
}));

router.post('/tickets/:reference/editar',
	upload.single('image'),
	handleUploadError,
	asyncHandler(async (req, res) => {
		const ticket = await ticketService.getTicketByReference(req.params.reference);
		const token = req.query.token;

		if (!token || token !== ticket.edit_token) {
			throw new ForbiddenError('Token de edición inválido');
		}

		const validation = validate(updateTicketSchema, req.body);
		if (!validation.success) {
			return res.status(400).render('public/edit', {
				title: `Editar ${ticket.reference}`,
				ticket,
				SUPPORT_TYPES,
				PRIORITIES,
				errors: validation.errors,
			});
		}

		const updates = validation.data;
		if (req.file) {
			updates.image_path = '/uploads/' + req.file.filename;
		}

		await ticketService.updateTicketByToken(ticket.edit_token, updates);
		res.redirect(`/tickets/${ticket.reference}`);
	})
);

// ============================================================================
// Agregar comentario público
// ============================================================================
router.post('/tickets/:reference/comments',
	commentLimiter,
	asyncHandler(async (req, res) => {
		const ticket = await ticketService.getTicketByReference(req.params.reference);

		const validation = validate(createCommentSchema, {
			...req.body,
			is_internal: false,
		});

		if (!validation.success) {
			return res.status(400).send('Datos inválidos: ' + Object.values(validation.errors).join(', '));
		}

		const { content, author_name, author_email } = validation.data;

		await ticketService.addComment(
			ticket.id,
			ticket.reference,
			{
				author_name,
				author_email,
				content,
				is_internal: false,
			},
			ticket.assigned_to
		);

		// Enviar confirmación por email
		if (author_email) {
			await emailService.sendCommentConfirmationEmail(ticket, author_name, author_email);
		}

		res.redirect(`/tickets/${ticket.reference}`);
	})
);

module.exports = router;
