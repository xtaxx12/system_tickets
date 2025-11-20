const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { getPool } = require('../db');
const { STATUSES, listTickets, findByReference, updateStatusById, countTickets, getTicketStats, getAllTechnicians, assignTicket } = require('../models/tickets');
const {
	createComment,
	getCommentsByTicketId,
} = require('../models/comments');

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

function requireAdmin(req, res, next) {
	if (req.session && req.session.user && req.session.user.role === 'admin') return next();
	return res.redirect('/admin/login');
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

router.get('/', requireAdmin, async (req, res) => {
	const { status, priority, support_type, assigned_to, page = 1 } = req.query;
	const currentPage = parseInt(page) || 1;
	const perPage = 15;
	const offset = (currentPage - 1) * perPage;

	const filters = { status, priority, support_type, assigned_to };
	const tickets = await listTickets(filters, perPage, offset);
	const totalTickets = await countTickets(filters);
	const totalPages = Math.ceil(totalTickets / perPage);
	const technicians = await getAllTechnicians();

	// Obtener estadísticas totales (sin filtro de status para mostrar todos los estados)
	const stats = await getTicketStats({ priority, support_type });

	res.render('admin/list', {
		title: 'Panel Admin',
		tickets,
		filters,
		STATUSES,
		user: req.session.user,
		stats,
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
	res.render('admin/detail', {
		title: `Admin - ${ticket.reference}`,
		ticket,
		comments,
		STATUSES,
		technicians,
		user: req.session.user
	});
});

router.post('/tickets/:reference/estado', requireAdmin, async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const { status } = req.body;
	try {
		await updateStatusById(ticket.id, status);
		res.redirect(`/admin/tickets/${ticket.reference}`);
	} catch (e) {
		res.status(400).send('Estado inválido');
	}
});

router.post('/tickets/:reference/asignar', requireAdmin, async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const { technician_id } = req.body;
	try {
		const technicianIdValue = technician_id && technician_id !== '' ? parseInt(technician_id) : null;
		await assignTicket(ticket.id, technicianIdValue);
		res.redirect(`/admin/tickets/${ticket.reference}`);
	} catch (e) {
		console.error('Error asignando ticket:', e);
		res.status(500).send('Error al asignar ticket');
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

module.exports = router;

