const express = require('express');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const {
	SUPPORT_TYPES,
	PRIORITIES,
	createTicket,
	findByReference,
	updateTicketByToken,
	listTickets,
} = require('../models/tickets');

const router = express.Router();

// Configuración de Multer para subida de imágenes
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, path.join(__dirname, '..', '..', 'uploads'));
	},
	filename: (req, file, cb) => {
		const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const ext = path.extname(file.originalname || '');
		cb(null, unique + ext);
	},
});
const upload = multer({ storage });

function getTransport() {
	if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: String(process.env.SMTP_SECURE || 'false') === 'true',
		auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
	});
}

router.get('/', (req, res) => {
	res.render('public/new', {
		title: 'Nuevo Ticket',
		SUPPORT_TYPES,
		PRIORITIES,
		errors: {},
		data: {},
	});
});

router.post('/tickets', upload.single('image'), async (req, res) => {
	try {
		const {
			requester_name,
			department,
			support_type,
			priority,
			subject,
			description,
			has_anydesk,
			anydesk_code,
			email,
		} = req.body;

		const errors = {};
		if (!requester_name) errors.requester_name = 'Requerido';
		if (!department) errors.department = 'Requerido';
		if (!support_type) errors.support_type = 'Requerido';
		if (!priority) errors.priority = 'Requerido';
		if (!subject) errors.subject = 'Requerido';
		if (!description) errors.description = 'Requerido';
		if (String(has_anydesk) === 'yes' && !anydesk_code) errors.anydesk_code = 'Requerido';

		if (Object.keys(errors).length) {
			return res.status(400).render('public/new', {
				title: 'Nuevo Ticket',
				SUPPORT_TYPES,
				PRIORITIES,
				errors,
				data: req.body,
			});
		}

		const image_path = req.file ? '/uploads/' + req.file.filename : null;
		const ticket = await createTicket({
			requester_name,
			department,
			support_type,
			priority,
			subject,
			description,
			image_path,
			has_anydesk: String(has_anydesk) === 'yes',
			anydesk_code,
		});

		// Envío opcional de correo
		if (email) {
			const transporter = getTransport();
			if (transporter) {
				const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
				const editUrl = `${baseUrl}/tickets/${ticket.reference}/editar?token=${ticket.edit_token}`;
				await transporter.sendMail({
					from: process.env.SMTP_FROM || 'soporte@example.com',
					to: email,
					subject: `Ticket creado: ${ticket.reference}`,
					html: `
						<p>Hola ${ticket.requester_name},</p>
						<p>Tu ticket fue creado con referencia <b>${ticket.reference}</b> (estado: ${ticket.status}).</p>
						<p>Puedes editar los detalles (sin cambiar estado) usando este enlace:</p>
						<p><a href="${editUrl}">${editUrl}</a></p>
					`,
				});
			}
		}

		res.redirect(`/tickets/${ticket.reference}`);
	} catch (err) {
		console.error(err);
		res.status(500).send('Error al crear el ticket');
	}
});

router.get('/tickets', async (req, res) => {
	const { status, priority, support_type } = req.query;
	const tickets = await listTickets({ status, priority, support_type });
	res.render('public/list', {
		title: 'Listado de Tickets',
		tickets,
		filters: { status, priority, support_type },
	});
});

router.get('/tickets/:reference', async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	res.render('public/detail', { title: `Ticket ${ticket.reference}`, ticket });
});

router.get('/tickets/:reference/editar', async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const token = req.query.token;
	if (!token || token !== ticket.edit_token) return res.status(403).send('Token inválido');
	res.render('public/edit', { title: `Editar ${ticket.reference}`, ticket, SUPPORT_TYPES, PRIORITIES, errors: {} });
});

router.post('/tickets/:reference/editar', upload.single('image'), async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const token = req.query.token;
	if (!token || token !== ticket.edit_token) return res.status(403).send('Token inválido');

	const updates = {};
	const fields = ['requester_name', 'department', 'support_type', 'priority', 'subject', 'description', 'anydesk_code'];
	for (const f of fields) {
		if (f in req.body && req.body[f]) updates[f] = req.body[f];
	}
	if ('has_anydesk' in req.body) updates.has_anydesk = String(req.body.has_anydesk) === 'yes';
	if (req.file) updates.image_path = '/uploads/' + req.file.filename;

	const updated = await updateTicketByToken(ticket.edit_token, updates);
	if (!updated) return res.status(500).send('No se pudo actualizar');
	res.redirect(`/tickets/${ticket.reference}`);
});

module.exports = router;
