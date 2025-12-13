/**
 * Permission Repository
 * Abstracción de acceso a datos para permisos y roles.
 */

const BaseRepository = require('./BaseRepository');

class PermissionRepository extends BaseRepository {
    // ============================================================================
    // Funciones de Permisos
    // ============================================================================

    /**
     * Obtiene todos los permisos organizados por categoría
     * @returns {Promise<Object>}
     */
    async getAllPermissions() {
        const rows = await this.queryAll(`
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
     * Obtiene permisos de un usuario por su ID
     * @param {number} userId - ID del usuario
     * @returns {Promise<Array<string>>}
     */
    async getUserPermissions(userId) {
        const rows = await this.queryAll(`
			SELECT DISTINCT p.name
			FROM permissions p
			INNER JOIN role_permissions rp ON p.id = rp.permission_id
			INNER JOIN users u ON u.role_id = rp.role_id
			WHERE u.id = $1
		`, [userId]);

        return rows.map(r => r.name);
    }

    /**
     * Verifica si un usuario tiene un permiso específico
     * @param {number} userId - ID del usuario
     * @param {string} permissionName - Nombre del permiso
     * @returns {Promise<boolean>}
     */
    async userHasPermission(userId, permissionName) {
        const row = await this.queryOne(`
			SELECT EXISTS (
				SELECT 1
				FROM permissions p
				INNER JOIN role_permissions rp ON p.id = rp.permission_id
				INNER JOIN users u ON u.role_id = rp.role_id
				WHERE u.id = $1 AND p.name = $2
			) as has_permission
		`, [userId, permissionName]);

        return row?.has_permission || false;
    }

    /**
     * Verifica si un usuario tiene alguno de los permisos especificados
     * @param {number} userId - ID del usuario
     * @param {Array<string>} permissionNames - Nombres de los permisos
     * @returns {Promise<boolean>}
     */
    async userHasAnyPermission(userId, permissionNames) {
        const row = await this.queryOne(`
			SELECT EXISTS (
				SELECT 1
				FROM permissions p
				INNER JOIN role_permissions rp ON p.id = rp.permission_id
				INNER JOIN users u ON u.role_id = rp.role_id
				WHERE u.id = $1 AND p.name = ANY($2)
			) as has_permission
		`, [userId, permissionNames]);

        return row?.has_permission || false;
    }

    // ============================================================================
    // Funciones de Roles
    // ============================================================================

    /**
     * Obtiene todos los roles
     * @returns {Promise<Array>}
     */
    async getAllRoles() {
        return this.queryAll(`
			SELECT id, name, display_name, description, is_system, created_at
			FROM roles
			ORDER BY is_system DESC, name
		`);
    }

    /**
     * Obtiene un rol por ID con sus permisos
     * @param {number} roleId - ID del rol
     * @returns {Promise<Object|null>}
     */
    async getRoleById(roleId) {
        const role = await this.queryOne(`
			SELECT id, name, display_name, description, is_system, created_at
			FROM roles
			WHERE id = $1
		`, [roleId]);

        if (!role) return null;

        // Obtener permisos del rol
        role.permissions = await this.queryAll(`
			SELECT p.id, p.name, p.display_name, p.description, p.category
			FROM permissions p
			INNER JOIN role_permissions rp ON p.id = rp.permission_id
			WHERE rp.role_id = $1
			ORDER BY p.category, p.display_name
		`, [roleId]);

        return role;
    }

    /**
     * Obtiene un rol por nombre
     * @param {string} name - Nombre del rol
     * @returns {Promise<Object|null>}
     */
    async getRoleByName(name) {
        return this.queryOne('SELECT id FROM roles WHERE name = $1', [name]);
    }

    /**
     * Crea un nuevo rol personalizado
     * @param {Object} data - Datos del rol
     * @returns {Promise<number>} ID del rol creado
     */
    async createRole({ name, display_name, description, permissions = [] }) {
        return this.withTransaction(async (client) => {
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

            return roleId;
        });
    }

    /**
     * Actualiza un rol existente
     * @param {number} roleId - ID del rol
     * @param {Object} data - Datos a actualizar
     */
    async updateRole(roleId, { display_name, description, permissions = [] }) {
        return this.withTransaction(async (client) => {
            // Verificar que no sea un rol del sistema o que no exista
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
        });
    }

    /**
     * Elimina un rol personalizado
     * @param {number} roleId - ID del rol
     */
    async deleteRole(roleId) {
        // Verificar que no sea un rol del sistema
        const role = await this.queryOne(
            'SELECT is_system FROM roles WHERE id = $1',
            [roleId]
        );

        if (!role) {
            throw new Error('Rol no encontrado');
        }

        if (role.is_system) {
            throw new Error('No se puede eliminar un rol del sistema');
        }

        // Verificar que no haya usuarios con este rol
        const userCheck = await this.queryOne(
            'SELECT COUNT(*) as count FROM users WHERE role_id = $1',
            [roleId]
        );

        if (parseInt(userCheck?.count || 0) > 0) {
            throw new Error('No se puede eliminar un rol que tiene usuarios asignados');
        }

        await this.query('DELETE FROM roles WHERE id = $1', [roleId]);
    }

    /**
     * Contar usuarios por rol
     * @returns {Promise<Array>}
     */
    async countUsersByRole() {
        return this.queryAll(`
			SELECT r.id, r.name, r.display_name, COUNT(u.id) as user_count
			FROM roles r
			LEFT JOIN users u ON u.role_id = r.id
			GROUP BY r.id, r.name, r.display_name
			ORDER BY r.is_system DESC, r.name
		`);
    }
}

module.exports = PermissionRepository;
