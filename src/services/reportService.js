/**
 * Servicio de generación de reportes PDF
 */
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/**
 * Genera un reporte PDF de un ticket resuelto
 * @param {Object} ticket - Datos del ticket
 * @param {Array} comments - Comentarios del ticket
 * @param {Object} options - Opciones adicionales
 * @returns {PDFDocument} - Stream del documento PDF
 */
function generateTicketReport(ticket, comments = [], options = {}) {
	const doc = new PDFDocument({
		size: 'A4',
		margin: 50,
		info: {
			Title: `Reporte Ticket ${ticket.reference}`,
			Author: 'Sistema de Tickets',
			Subject: `Reporte de soporte - ${ticket.subject}`,
		},
	});

	// Colores
	const colors = {
		primary: '#2563eb',
		secondary: '#64748b',
		success: '#16a34a',
		warning: '#d97706',
		danger: '#dc2626',
		light: '#f1f5f9',
		dark: '#1e293b',
	};

	// Logo de la empresa
	const logoPath = path.join(__dirname, '../../public/logo.png');
	if (fs.existsSync(logoPath)) {
		doc.image(logoPath, 50, 40, { width: 80 });
	}

	// Header con espacio para el logo
	doc.fontSize(24).fillColor(colors.primary).text('REPORTE DE TICKET', 150, 50, { align: 'center', width: 345 });
	doc.moveDown(0.5);
	doc.fontSize(14).fillColor(colors.secondary).text(`Referencia: ${ticket.reference}`, { align: 'center' });
	doc.moveDown(0.3);

	// Línea separadora
	doc.strokeColor(colors.primary).lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
	doc.moveDown(1);

	// Estado badge
	const statusColors = {
		Pendiente: colors.warning,
		'En Proceso': colors.primary,
		Resuelto: colors.success,
		Cerrado: colors.secondary,
	};
	const statusColor = statusColors[ticket.status] || colors.secondary;

	doc.fontSize(12).fillColor(statusColor).text(`Estado: ${ticket.status}`, { align: 'right' });
	doc.moveDown(1);

	// Información del solicitante
	doc.fontSize(14).fillColor(colors.dark).text('INFORMACIÓN DEL SOLICITANTE', { underline: true });
	doc.moveDown(0.5);

	doc.fontSize(11).fillColor(colors.dark);
	addField(doc, 'Nombre', ticket.requester_name);
	addField(doc, 'Departamento', ticket.department);
	if (ticket.email) addField(doc, 'Email', ticket.email);
	doc.moveDown(1);

	// Detalles del ticket
	doc.fontSize(14).fillColor(colors.dark).text('DETALLES DEL TICKET', { underline: true });
	doc.moveDown(0.5);

	doc.fontSize(11);
	addField(doc, 'Tipo de Soporte', ticket.support_type);
	addField(doc, 'Prioridad', ticket.priority);
	addField(doc, 'Asunto', ticket.subject);
	doc.moveDown(0.5);

	doc.fontSize(11).fillColor(colors.secondary).text('Descripción:');
	doc.fontSize(10).fillColor(colors.dark).text(ticket.description, {
		width: 495,
		align: 'justify',
	});
	doc.moveDown(1);

	// AnyDesk si aplica
	if (ticket.has_anydesk && ticket.anydesk_code) {
		addField(doc, 'Código AnyDesk', ticket.anydesk_code);
		doc.moveDown(0.5);
	}

	// Asignación
	if (ticket.assigned_username) {
		addField(doc, 'Técnico Asignado', ticket.assigned_username);
	}
	doc.moveDown(1);

	// Fechas
	doc.fontSize(14).fillColor(colors.dark).text('LÍNEA DE TIEMPO', { underline: true });
	doc.moveDown(0.5);

	doc.fontSize(11);
	addField(doc, 'Fecha de Creación', formatDate(ticket.created_at));
	addField(doc, 'Última Actualización', formatDate(ticket.updated_at));
	doc.moveDown(1);

	// Comentarios (solo públicos)
	const publicComments = comments.filter((c) => !c.is_internal);
	if (publicComments.length > 0) {
		// Nueva página si no hay espacio
		if (doc.y > 650) doc.addPage();

		doc.fontSize(14).fillColor(colors.dark).text('HISTORIAL DE COMENTARIOS', { underline: true });
		doc.moveDown(0.5);

		publicComments.forEach((comment, index) => {
			if (doc.y > 700) doc.addPage();

			doc.fontSize(10).fillColor(colors.primary).text(`${comment.author_name} - ${formatDate(comment.created_at)}`);
			doc.fontSize(10).fillColor(colors.dark).text(comment.content, {
				width: 495,
				align: 'justify',
			});
			doc.moveDown(0.5);

			if (index < publicComments.length - 1) {
				doc.strokeColor(colors.light).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
				doc.moveDown(0.5);
			}
		});
	}

	// Sección de firmas
	// Verificar si hay espacio suficiente, si no, agregar nueva página
	if (doc.y > 600) doc.addPage();
	
	doc.moveDown(2);
	doc.fontSize(14).fillColor(colors.dark).text('FIRMAS', { underline: true });
	doc.moveDown(1.5);

	const signatureY = doc.y;
	const lineWidth = 180;
	
	// Firma del solicitante (izquierda)
	doc.strokeColor(colors.dark).lineWidth(1).moveTo(50, signatureY + 40).lineTo(50 + lineWidth, signatureY + 40).stroke();
	doc.fontSize(10).fillColor(colors.dark).text('Firma del Solicitante', 50, signatureY + 45, { width: lineWidth, align: 'center' });
	doc.fontSize(9).fillColor(colors.secondary).text(ticket.requester_name || '', 50, signatureY + 60, { width: lineWidth, align: 'center' });

	// Firma del técnico (derecha)
	const techSignatureX = 545 - lineWidth;
	doc.strokeColor(colors.dark).lineWidth(1).moveTo(techSignatureX, signatureY + 40).lineTo(545, signatureY + 40).stroke();
	doc.fontSize(10).fillColor(colors.dark).text('Firma del Técnico', techSignatureX, signatureY + 45, { width: lineWidth, align: 'center' });
	doc.fontSize(9).fillColor(colors.secondary).text(ticket.assigned_username || 'Sin asignar', techSignatureX, signatureY + 60, { width: lineWidth, align: 'center' });

	// Footer
	doc.moveDown(6);
	doc.strokeColor(colors.secondary).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
	doc.moveDown(0.5);

	doc.fontSize(9).fillColor(colors.secondary).text(`Generado el ${formatDate(new Date())} | Sistema de Tickets de Soporte`, { align: 'center' });

	return doc;
}

/**
 * Agrega un campo con etiqueta y valor
 */
function addField(doc, label, value) {
	doc.fillColor('#64748b').text(`${label}: `, { continued: true });
	doc.fillColor('#1e293b').text(value || 'N/A');
}

/**
 * Formatea una fecha
 */
function formatDate(date) {
	if (!date) return 'N/A';
	const d = new Date(date);
	return d.toLocaleDateString('es-ES', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

module.exports = {
	generateTicketReport,
};
