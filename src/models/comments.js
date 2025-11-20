const { getPool } = require('../db');

async function createComment(data) {
	const pool = getPool();
	const q = `
		INSERT INTO comments (
			ticket_id, user_id, author_name, author_email, content, is_internal
		) VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING *
	`;
	const values = [
		data.ticket_id,
		data.user_id || null,
		data.author_name,
		data.author_email || null,
		data.content,
		!!data.is_internal,
	];
	const { rows } = await pool.query(q, values);
	return rows[0];
}

async function getCommentsByTicketId(ticketId, includeInternal = false) {
	const pool = getPool();
	let sql = 'SELECT * FROM comments WHERE ticket_id = $1';
	if (!includeInternal) {
		sql += ' AND is_internal = false';
	}
	sql += ' ORDER BY created_at ASC';
	const { rows } = await pool.query(sql, [ticketId]);
	return rows;
}

async function getCommentById(id) {
	const pool = getPool();
	const { rows } = await pool.query('SELECT * FROM comments WHERE id = $1', [id]);
	return rows[0] || null;
}

async function deleteComment(id) {
	const pool = getPool();
	const { rows } = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING *', [id]);
	return rows[0] || null;
}

async function countCommentsByTicketId(ticketId) {
	const pool = getPool();
	const { rows } = await pool.query(
		'SELECT COUNT(*) as count FROM comments WHERE ticket_id = $1 AND is_internal = false',
		[ticketId]
	);
	return parseInt(rows[0].count, 10);
}

module.exports = {
	createComment,
	getCommentsByTicketId,
	getCommentById,
	deleteComment,
	countCommentsByTicketId,
};