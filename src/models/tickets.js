const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../db');

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

async function createTicket(data) {
	const pool = getPool();
	const reference = generateReference();
	const editToken = uuidv4();
	const q = `
		INSERT INTO tickets (
			reference, requester_name, department, support_type, priority, subject, description,
			image_path, has_anydesk, anydesk_code, status, edit_token
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING *
	`;
	const values = [
		reference,
		data.requester_name,
		data.department,
		data.support_type,
		data.priority,
		data.subject,
		data.description,
		data.image_path || null,
		!!data.has_anydesk,
		data.anydesk_code || null,
		'Pendiente',
		editToken,
	];
	const { rows } = await pool.query(q, values);
	return rows[0];
}

async function updateTicketByToken(editToken, updates) {
	const pool = getPool();
	const fields = [];
	const params = [];
	let idx = 1;
	for (const [key, value] of Object.entries(updates)) {
		fields.push(`${key} = $${idx++}`);
		params.push(value);
	}
	if (fields.length === 0) return findByEditToken(editToken);
	params.push(editToken);
	const sql = `UPDATE tickets SET ${fields.join(', ')}, updated_at = NOW() WHERE edit_token = $${idx} RETURNING *`;
	const { rows } = await pool.query(sql, params);
	return rows[0] || null;
}

async function updateStatusById(id, status) {
	if (!STATUSES.includes(status)) throw new Error('Estado inválido');
	const pool = getPool();
	const { rows } = await pool.query(
		'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
		[status, id]
	);
	return rows[0] || null;
}

async function findById(id) {
	const { rows } = await getPool().query('SELECT * FROM tickets WHERE id = $1', [id]);
	return rows[0] || null;
}

async function findByReference(reference) {
	const { rows } = await getPool().query('SELECT * FROM tickets WHERE reference = $1', [reference]);
	return rows[0] || null;
}

async function findByEditToken(editToken) {
	const { rows } = await getPool().query('SELECT * FROM tickets WHERE edit_token = $1', [editToken]);
	return rows[0] || null;
}

async function listTickets(filters = {}, limit = 100, offset = 0) {
	const where = [];
	const params = [];
	let idx = 1;
	if (filters.status) {
		where.push(`status = $${idx++}`);
		params.push(filters.status);
	}
	if (filters.priority) {
		where.push(`priority = $${idx++}`);
		params.push(filters.priority);
	}
	if (filters.support_type) {
		where.push(`support_type = $${idx++}`);
		params.push(filters.support_type);
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
	params.push(limit, offset);
	const sql = `SELECT * FROM tickets ${whereSql} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
	const { rows } = await getPool().query(sql, params);
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
