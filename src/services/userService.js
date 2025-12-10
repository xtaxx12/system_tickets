/**
 * Servicio de lógica de negocio para Usuarios
 */
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 10;

/**
 * Autenticar usuario
 */
async function authenticate(username, password) {
	const { rows } = await getPool().query(
		'SELECT * FROM users WHERE username = $1',
		[username]
	);

	const user = rows[0];
	if (!user) {
		return null;
	}

	const isValid = bcrypt.compareSync(password, user.password_hash);
	if (!isValid) {
		return null;
	}

	return {
		id: user.id,
		username: user.username,
		role: user.role,
		role_id: user.role_id,
	};
}

/**
 * Obtener usuario por ID
 */
async function getUserById(userId) {
	const { rows } = await getPool().query(
		'SELECT id, username, role, role_id, created_at FROM users WHERE id = $1',
		[userId]
	);

	if (!rows[0]) {
		throw new NotFoundError('Usuario');
	}

	return rows[0];
}

/**
 * Listar todos los usuarios con información de rol
 */
async function listUsers() {
	const { rows } = await getPool().query(`
		SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display
		FROM users u
		LEFT JOIN roles r ON u.role_id = r.id
		ORDER BY u.created_at DESC
	`);
	return rows;
}

/**
 * Crear nuevo usuario
 */
async function createUser({ username, password, role_id }) {
	// Verificar que el username no exista
	const { rows: existing } = await getPool().query(
		'SELECT id FROM users WHERE username = $1',
		[username]
	);

	if (existing.length > 0) {
		throw new ValidationError('El nombre de usuario ya existe', { username: 'Ya está en uso' });
	}

	// Obtener nombre del rol
	const { rows: roleRows } = await getPool().query(
		'SELECT name FROM roles WHERE id = $1',
		[role_id]
	);

	if (!roleRows[0]) {
		throw new ValidationError('Rol inválido', { role_id: 'Rol no encontrado' });
	}

	const roleName = roleRows[0].name;
	const hash = bcrypt.hashSync(password, SALT_ROUNDS);

	const { rows } = await getPool().query(
		'INSERT INTO users (username, password_hash, role, role_id) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
		[username, hash, roleName, role_id]
	);

	return rows[0];
}

/**
 * Actualizar nombre de usuario
 */
async function updateUsername(userId, newUsername) {
	// Verificar que no esté en uso
	const { rows: existing } = await getPool().query(
		'SELECT id FROM users WHERE username = $1 AND id != $2',
		[newUsername, userId]
	);

	if (existing.length > 0) {
		throw new ValidationError('El nombre de usuario ya está en uso', { username: 'Ya está en uso' });
	}

	const { rows } = await getPool().query(
		'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, role',
		[newUsername, userId]
	);

	return rows[0];
}

/**
 * Cambiar contraseña
 */
async function changePassword(userId, currentPassword, newPassword) {
	const { rows } = await getPool().query(
		'SELECT password_hash FROM users WHERE id = $1',
		[userId]
	);

	if (!rows[0]) {
		throw new NotFoundError('Usuario');
	}

	const isValid = bcrypt.compareSync(currentPassword, rows[0].password_hash);
	if (!isValid) {
		throw new ValidationError('Contraseña actual incorrecta', { current_password: 'Incorrecta' });
	}

	const newHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
	await getPool().query(
		'UPDATE users SET password_hash = $1 WHERE id = $2',
		[newHash, userId]
	);

	return true;
}

/**
 * Cambiar rol de usuario
 */
async function changeUserRole(userId, newRoleId, currentUserId) {
	if (userId === currentUserId) {
		throw new ForbiddenError('No puedes cambiar tu propio rol');
	}

	// Verificar que el rol existe
	const { rows: roleRows } = await getPool().query(
		'SELECT id, name FROM roles WHERE id = $1',
		[newRoleId]
	);

	if (!roleRows[0]) {
		throw new ValidationError('Rol inválido', { role_id: 'Rol no encontrado' });
	}

	const roleName = roleRows[0].name;

	await getPool().query(
		'UPDATE users SET role = $1, role_id = $2 WHERE id = $3',
		[roleName, newRoleId, userId]
	);

	return true;
}

/**
 * Eliminar usuario
 */
async function deleteUser(userId, currentUserId) {
	if (userId === currentUserId) {
		throw new ForbiddenError('No puedes eliminar tu propia cuenta');
	}

	const { rowCount } = await getPool().query(
		'DELETE FROM users WHERE id = $1',
		[userId]
	);

	if (rowCount === 0) {
		throw new NotFoundError('Usuario');
	}

	return true;
}

module.exports = {
	authenticate,
	getUserById,
	listUsers,
	createUser,
	updateUsername,
	changePassword,
	changeUserRole,
	deleteUser,
};
