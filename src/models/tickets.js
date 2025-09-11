const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const SUPPORT_TYPES = [
	'Hardware',
	'Software',
	'Red e Internet',
	'Acceso y Permisos',
	'Correo Electrónico',
	'Otro',
];

const PRIORITIES = [
	'Baja – No es urgente',
	'Media – Puede esperar unas horas',
	'Alta – Necesito ayuda pronto',
	'Crítica – Bloquea mi trabajo',
];

const STATUSES = ['Pendiente', 'En Proceso', 'Resuelto', 'Cerrado'];

function generateReference() {
	const base = uuidv4().split('-')[0].toUpperCase();
	const now = new Date();
	const y = String(now.getFullYear()).slice(-2);
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `T-${y}${m}${d}-${base}`;
}

function createTicket(data) {
	const db = getDb();
	const reference = generateReference();
	const editToken = uuidv4();
	const stmt = db.prepare(`
		INSERT INTO tickets (
			reference, requester_name, department, support_type, priority, subject, description,
			image_path, has_anydesk, anydesk_code, status, edit_token
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
	`);
	const info = stmt.run(
		reference,
		data.requester_name,
		data.department,
		data.support_type,
		data.priority,
		data.subject,
		data.description,
		data.image_path || null,
		data.has_anydesk ? 1 : 0,
		data.anydesk_code || null,
		'Pendiente',
		editToken
	);
	return findById(info.lastInsertRowid);
}

function updateTicketByToken(editToken, updates) {
	const db = getDb();
	const fields = [];
	const params = [];
	for (const [key, value] of Object.entries(updates)) {
		fields.push(`${key} = ?`);
		params.push(value);
	}
	if (fields.length === 0) return findByEditToken(editToken);
	params.push(editToken);
	const sql = `UPDATE tickets SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE edit_token = ?`;
	const info = db.prepare(sql).run(...params);
	if (info.changes === 0) return null;
	return findByEditToken(editToken);
}

function updateStatusById(id, status) {
	const db = getDb();
	if (!STATUSES.includes(status)) {
		throw new Error('Estado inválido');
	}
	const info = db
		.prepare('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
		.run(status, id);
	return info.changes > 0 ? findById(id) : null;
}

function findById(id) {
	return getDb().prepare('SELECT * FROM tickets WHERE id = ?').get(id);
}

function findByReference(reference) {
	return getDb().prepare('SELECT * FROM tickets WHERE reference = ?').get(reference);
}

function findByEditToken(editToken) {
	return getDb().prepare('SELECT * FROM tickets WHERE edit_token = ?').get(editToken);
}

function listTickets(filters = {}, limit = 100, offset = 0) {
	const where = [];
	const params = [];
	if (filters.status) {
		where.push('status = ?');
		params.push(filters.status);
	}
	if (filters.priority) {
		where.push('priority = ?');
		params.push(filters.priority);
	}
	if (filters.support_type) {
		where.push('support_type = ?');
		params.push(filters.support_type);
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const sql = `SELECT * FROM tickets ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
	params.push(limit, offset);
	const rows = getDb().prepare(sql).all(...params);
	return rows;
}

module.exports = {
	SUPPORT_TYPES,
	PRIORITIES,
	STATUSES,
	createTicket,
	updateTicketByToken,
	updateStatusById,
	findById,
	findByReference,
	findByEditToken,
	listTickets,
};
