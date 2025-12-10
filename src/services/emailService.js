/**
 * Servicio de envío de emails
 */
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

/**
 * Obtener o crear el transporter de email
 */
function getTransporter() {
	if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
		return null;
	}

	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.secure,
			auth: {
				user: config.smtp.user,
				pass: config.smtp.pass,
			},
		});
	}

	return transporter;
}

/**
 * Verificar conexión SMTP
 */
async function verifyConnection() {
	const transport = getTransporter();
	if (!transport) return false;

	try {
		await transport.verify();
		return true;
	} catch (err) {
		console.error('Error verificando SMTP:', err.message);
		return false;
	}
}

/**
 * Enviar email de ticket creado
 */
async function sendTicketCreatedEmail(ticket, email) {
	const transport = getTransporter();
	if (!transport || !email) return false;

	const editUrl = `${config.baseUrl}/tickets/${ticket.reference}/editar?token=${ticket.edit_token}`;

	try {
		await transport.sendMail({
			from: config.smtp.from,
			to: email,
			subject: `Ticket creado: ${ticket.reference}`,
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<h2 style="color: #333;">Ticket Creado</h2>
					<p>Hola <strong>${ticket.requester_name}</strong>,</p>
					<p>Tu ticket fue creado exitosamente.</p>
					<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
						<tr>
							<td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Referencia</strong></td>
							<td style="padding: 8px; border: 1px solid #ddd;">${ticket.reference}</td>
						</tr>
						<tr>
							<td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Asunto</strong></td>
							<td style="padding: 8px; border: 1px solid #ddd;">${ticket.subject}</td>
						</tr>
						<tr>
							<td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Estado</strong></td>
							<td style="padding: 8px; border: 1px solid #ddd;">${ticket.status}</td>
						</tr>
					</table>
					<p>Puedes editar los detalles usando este enlace:</p>
					<p><a href="${editUrl}" style="color: #007bff;">${editUrl}</a></p>
					<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
					<p style="color: #666; font-size: 12px;">Este es un mensaje automático, no responder.</p>
				</div>
			`,
		});
		return true;
	} catch (err) {
		console.error('Error enviando email de ticket creado:', err.message);
		return false;
	}
}

/**
 * Enviar email de nuevo comentario
 */
async function sendCommentNotificationEmail(ticket, comment, recipientEmails) {
	const transport = getTransporter();
	if (!transport || !recipientEmails.length) return false;

	const ticketUrl = `${config.baseUrl}/tickets/${ticket.reference}`;

	try {
		await transport.sendMail({
			from: config.smtp.from,
			to: recipientEmails.join(','),
			subject: `Respuesta en ticket ${ticket.reference}`,
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<h2 style="color: #333;">Nueva Respuesta</h2>
					<p>Se ha agregado una respuesta al ticket <strong>${ticket.reference}</strong>.</p>
					<div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
						<p style="margin: 0;">${comment.content}</p>
					</div>
					<p><a href="${ticketUrl}" style="color: #007bff;">Ver ticket completo</a></p>
					<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
					<p style="color: #666; font-size: 12px;">Este es un mensaje automático, no responder.</p>
				</div>
			`,
		});
		return true;
	} catch (err) {
		console.error('Error enviando email de comentario:', err.message);
		return false;
	}
}

/**
 * Enviar email de confirmación de comentario al autor
 */
async function sendCommentConfirmationEmail(ticket, authorName, authorEmail) {
	const transport = getTransporter();
	if (!transport || !authorEmail) return false;

	const ticketUrl = `${config.baseUrl}/tickets/${ticket.reference}`;

	try {
		await transport.sendMail({
			from: config.smtp.from,
			to: authorEmail,
			subject: `Comentario agregado en ticket ${ticket.reference}`,
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<h2 style="color: #333;">Comentario Registrado</h2>
					<p>Hola <strong>${authorName}</strong>,</p>
					<p>Tu comentario ha sido agregado al ticket <strong>${ticket.reference}</strong>.</p>
					<p><a href="${ticketUrl}" style="color: #007bff;">Ver ticket</a></p>
				</div>
			`,
		});
		return true;
	} catch (err) {
		console.error('Error enviando confirmación de comentario:', err.message);
		return false;
	}
}

module.exports = {
	getTransporter,
	verifyConnection,
	sendTicketCreatedEmail,
	sendCommentNotificationEmail,
	sendCommentConfirmationEmail,
};
