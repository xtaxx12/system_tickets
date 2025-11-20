const { getPool } = require('../db');

// ============================================================================
// Funciones de Permisos
// ============================================================================

/**
 * Obtener todos los permisos organizados por categoría
 */
async function getAllPermissions() {
	const { rows } = await getPool().query(`
		SELECT id, name, display_name, description, category
		FROM permissions
		ORDER BY category, display_name
	`);

	// Organizar por categoría
	const categories = {};
	rows.forEach(perm => {
		if (!categories[perm.category]) {
			categories[perm.category] = [];
		}
		categories[perm.category].push(perm);
	});

	return categories;
}

/**
 * Obtener permisos de un usuario por su ID
 */
async function getUserPermissions(userId) {
	const { rows } = await getPool().query(`
		SELECT DISTINCT p.name
		FROM permissions p
		INNER JOIN role_permissions rp ON p.id = rp.permission_id
		INNER JOIN users u ON u.role_id = rp.role_id
		WHERE u.id = $1
	`, [userId]);

	return rows.map(r => r.name);
}

/**
 * Verificar si un usuario tiene un permiso específico
 */
async function userHasPermission(userId, permissionName) {
	const { rows } = await getPool().query(`
		SELECT EXISTS (
			SELECT 1
			FROM permissions p
			INNER JOIN role_permissions rp ON p.id = rp.permission_id
			INNER JOIN users u ON u.role_id = rp.role_id
			WHERE u.id = $1 AND p.name = $2
		) as has_permission
	`, [userId, permissionName]);

	return rows[0].has_permission;
}

/**
 * Verificar si un usuario tiene alguno de los permisos especificados
 */
async function userHasAnyPermission(userId, permissionNames) {
	const { rows } = await getPool().query(`
		SELECT EXISTS (
			SELECT 1
			FROM permissions p
			INNER JOIN role_permissions rp ON p.id = rp.permission_id
			INNER JOIN users u ON u.role_id = rp.role_id
			WHERE u.id = $1 AND p.name = ANY($2)
		) as has_permission
	`, [userId, permissionNames]);

	return rows[0].has_permission;
}

// ============================================================================
// Funciones de Roles
// ============================================================================

/**
 * Obtener todos los roles
 */
async function getAllRoles() {
	const { rows } = await getPool().query(`
		SELECT id, name, display_name, description, is_system, created_at
		FROM roles
		ORDER BY is_system DESC, name
	`);
	return rows;
}

/**
 * Obtener un rol por ID con sus permisos
 */
async function getRoleById(roleId) {
	const { rows } = await getPool().query(`
		SELECT id, name, display_name, description, is_system, created_at
		FROM roles
		WHERE id = $1
	`, [roleId]);

	if (rows.length === 0) return null;

	const role = rows[0];

	// Obtener permisos del rol
	const { rows: permRows } = await getPool().query(`
		SELECT p.id, p.name, p.display_name, p.description, p.category
		FROM permissions p
		INNER JOIN role_permissions rp ON p.id = rp.permission_id
		WHERE rp.role_id = $1
		ORDER BY p.category, p.display_name
	`, [roleId]);

	role.permissions = permRows;

	return role;
}

/**
 * Crear un nuevo rol personalizado
 */
async function createRole({ name, display_name, description, permissions = [] }) {
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');

		// Crear el rol
		const { rows } = await client.query(`
			INSERT INTO roles (name, display_name, description, is_system)
			VALUES ($1, $2, $3, false)
			RETURNING id
		`, [name, display_name, description]);

		const roleId = rows[0].id;

		// Asignar permisos
		for (const permissionId of permissions) {
			await client.query(`
				INSERT INTO role_permissions (role_id, permission_id)
				VALUES ($1, $2)
			`, [roleId, permissionId]);
		}

		await client.query('COMMIT');
		return roleId;
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}
}

/**
 * Actualizar un rol existente
 */
async function updateRole(roleId, { display_name, description, permissions = [] }) {
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');

		// Verificar que no sea un rol del sistema
		const { rows: roleCheck } = await client.query(
			'SELECT is_system FROM roles WHERE id = $1',
			[roleId]
		);

		if (roleCheck.length === 0) {
			throw new Error('Rol no encontrado');
		}

		// Actualizar información del rol
		await client.query(`
			UPDATE roles
			SET display_name = $1, description = $2
			WHERE id = $3
		`, [display_name, description, roleId]);

		// Eliminar permisos existentes
		await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

		// Asignar nuevos permisos
		for (const permissionId of permissions) {
			await client.query(`
				INSERT INTO role_permissions (role_id, permission_id)
				VALUES ($1, $2)
			`, [roleId, permissionId]);
		}

		await client.query('COMMIT');
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}
}

/**
 * Eliminar un rol personalizado
 */
async function deleteRole(roleId) {
	// Verificar que no sea un rol del sistema
	const { rows } = await getPool().query(
		'SELECT is_system FROM roles WHERE id = $1',
		[roleId]
	);

	if (rows.length === 0) {
		throw new Error('Rol no encontrado');
	}

	if (rows[0].is_system) {
		throw new Error('No se puede eliminar un rol del sistema');
	}

	// Verificar que no haya usuarios con este rol
	const { rows: userCheck } = await getPool().query(
		'SELECT COUNT(*) as count FROM users WHERE role_id = $1',
		[roleId]
	);

	if (parseInt(userCheck[0].count) > 0) {
		throw new Error('No se puede eliminar un rol que tiene usuarios asignados');
	}

	await getPool().query('DELETE FROM roles WHERE id = $1', [roleId]);
}

/**
 * Contar usuarios por rol
 */
async function countUsersByRole() {
	const { rows } = await getPool().query(`
		SELECT r.id, r.name, r.display_name, COUNT(u.id) as user_count
		FROM roles r
		LEFT JOIN users u ON u.role_id = r.id
		GROUP BY r.id, r.name, r.display_name
		ORDER BY r.is_system DESC, r.name
	`);
	return rows;
}

module.exports = {
	getAllPermissions,
	getUserPermissions,
	userHasPermission,
	userHasAnyPermission,
	getAllRoles,
	getRoleById,
	createRole,
	updateRole,
	deleteRole,
	countUsersByRole
};
