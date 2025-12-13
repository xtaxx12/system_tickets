/**
 * Helper para base de datos en tests
 */
import { getPool } from '../../src/db.js';

/**
 * Limpiar tablas de test
 */
export async function cleanDatabase() {
	const pool = getPool();
	try {
		await pool.query('DELETE FROM notifications');
		await pool.query('DELETE FROM comments');
		await pool.query('DELETE FROM tickets');
		// No eliminar users ni roles del sistema
	} catch (err) {
		console.error('Error limpiando BD:', err.message);
	}
}

/**
 * Crear ticket de prueba
 */
export async function createTestTicket(data = {}) {
	const pool = getPool();
	const defaults = {
		reference: `T-TEST-${Date.now()}`,
		requester_name: 'Test User',
		department: 'IT',
		support_type: 'Hardware',
		priority: 'Media – Puede esperar unas horas',
		subject: 'Test Ticket',
		description: 'Test description with enough characters',
		status: 'Pendiente',
		edit_token: `token-${Date.now()}`,
	};

	const ticket = { ...defaults, ...data };

	const { rows } = await pool.query(
		`INSERT INTO tickets (reference, requester_name, department, support_type, priority, subject, description, status, edit_token)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING *`,
		[
			ticket.reference,
			ticket.requester_name,
			ticket.department,
			ticket.support_type,
			ticket.priority,
			ticket.subject,
			ticket.description,
			ticket.status,
			ticket.edit_token,
		]
	);

	return rows[0];
}

/**
 * Obtener usuario admin de prueba
 */
export async function getTestAdmin() {
	const pool = getPool();
	const { rows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
	return rows[0];
}

/**
 * Verificar conexión a BD
 */
export async function checkDatabaseConnection() {
	try {
		const pool = getPool();
		await pool.query('SELECT 1');
		return true;
	} catch {
		return false;
	}
}
