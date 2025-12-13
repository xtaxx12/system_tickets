/**
 * User Repository
 * Abstracción de acceso a datos para usuarios.
 */

const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
    /**
     * Busca un usuario por ID
     * @param {number} id - ID del usuario
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        return this.queryOne('SELECT * FROM users WHERE id = $1', [id]);
    }

    /**
     * Busca un usuario por nombre de usuario
     * @param {string} username - Nombre de usuario
     * @returns {Promise<Object|null>}
     */
    async findByUsername(username) {
        return this.queryOne('SELECT * FROM users WHERE username = $1', [username]);
    }

    /**
     * Crea un nuevo usuario
     * @param {Object} data - Datos del usuario
     * @returns {Promise<Object>}
     */
    async create({ username, password_hash, role, role_id }) {
        const sql = `
			INSERT INTO users (username, password_hash, role, role_id)
			VALUES ($1, $2, $3, $4)
			RETURNING id, username, role, role_id, created_at
		`;
        return this.queryOne(sql, [username, password_hash, role, role_id]);
    }

    /**
     * Actualiza un usuario
     * @param {number} id - ID del usuario
     * @param {Object} updates - Campos a actualizar
     * @returns {Promise<Object|null>}
     */
    async update(id, updates) {
        const fields = [];
        const params = [];
        let idx = 1;

        for (const [key, value] of Object.entries(updates)) {
            // Excluir campos sensibles que no deberían actualizarse directamente
            if (['id', 'created_at'].includes(key)) continue;
            fields.push(`${key} = $${idx++}`);
            params.push(value);
        }

        if (fields.length === 0) return this.findById(id);

        params.push(id);
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, username, role, role_id, created_at`;
        return this.queryOne(sql, params);
    }

    /**
     * Elimina un usuario por ID
     * @param {number} id - ID del usuario
     * @returns {Promise<Object|null>}
     */
    async delete(id) {
        return this.queryOne(
            'DELETE FROM users WHERE id = $1 RETURNING id, username, role',
            [id]
        );
    }

    /**
     * Lista todos los usuarios
     * @param {number} limit - Límite de resultados
     * @param {number} offset - Offset para paginación
     * @returns {Promise<Array>}
     */
    async findAll(limit = 100, offset = 0) {
        const sql = `
			SELECT u.id, u.username, u.role, u.role_id, u.created_at, r.display_name as role_display_name
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			ORDER BY u.created_at DESC
			LIMIT $1 OFFSET $2
		`;
        return this.queryAll(sql, [limit, offset]);
    }

    /**
     * Obtiene todos los técnicos (admin, supervisor, tecnico)
     * @returns {Promise<Array>}
     */
    async findAllTechnicians() {
        const sql = `
			SELECT id, username, role
			FROM users
			WHERE role IN ('admin', 'supervisor', 'tecnico')
			ORDER BY
				CASE role
					WHEN 'admin' THEN 1
					WHEN 'supervisor' THEN 2
					WHEN 'tecnico' THEN 3
				END,
				username ASC
		`;
        return this.queryAll(sql);
    }

    /**
     * Cuenta usuarios por rol
     * @returns {Promise<Array>}
     */
    async countByRole() {
        const sql = `
			SELECT role, COUNT(*) as count
			FROM users
			GROUP BY role
			ORDER BY role
		`;
        return this.queryAll(sql);
    }

    /**
     * Verifica si existe un usuario con un nombre de usuario
     * @param {string} username - Nombre de usuario
     * @returns {Promise<boolean>}
     */
    async exists(username) {
        const row = await this.queryOne(
            'SELECT EXISTS(SELECT 1 FROM users WHERE username = $1) as exists',
            [username]
        );
        return row?.exists || false;
    }
}

module.exports = UserRepository;
