/**
 * Notification Repository
 * Abstracción de acceso a datos para notificaciones.
 */

const BaseRepository = require('./BaseRepository');

class NotificationRepository extends BaseRepository {
    /**
     * Crea una nueva notificación
     * @param {Object} data - Datos de la notificación
     * @returns {Promise<Object>}
     */
    async create({ user_id, type, title, message, ticket_id = null }) {
        const sql = `
			INSERT INTO notifications (user_id, type, title, message, ticket_id)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING *
		`;
        return this.queryOne(sql, [user_id, type, title, message, ticket_id]);
    }

    /**
     * Obtiene notificaciones no leídas de un usuario
     * @param {number} userId - ID del usuario
     * @param {number} limit - Límite de resultados
     * @returns {Promise<Array>}
     */
    async findUnread(userId, limit = 10) {
        const sql = `
			SELECT n.*, t.reference as ticket_reference
			FROM notifications n
			LEFT JOIN tickets t ON n.ticket_id = t.id
			WHERE n.user_id = $1 AND n.is_read = false
			ORDER BY n.created_at DESC
			LIMIT $2
		`;
        return this.queryAll(sql, [userId, limit]);
    }

    /**
     * Obtiene todas las notificaciones de un usuario
     * @param {number} userId - ID del usuario
     * @param {number} limit - Límite de resultados
     * @param {number} offset - Offset para paginación
     * @returns {Promise<Array>}
     */
    async findAll(userId, limit = 20, offset = 0) {
        const sql = `
			SELECT n.*, t.reference as ticket_reference
			FROM notifications n
			LEFT JOIN tickets t ON n.ticket_id = t.id
			WHERE n.user_id = $1
			ORDER BY n.created_at DESC
			LIMIT $2 OFFSET $3
		`;
        return this.queryAll(sql, [userId, limit, offset]);
    }

    /**
     * Cuenta notificaciones no leídas
     * @param {number} userId - ID del usuario
     * @returns {Promise<number>}
     */
    async countUnread(userId) {
        const row = await this.queryOne(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        return parseInt(row?.count || 0);
    }

    /**
     * Marca una notificación como leída
     * @param {number} notificationId - ID de la notificación
     * @param {number} userId - ID del usuario (para verificación)
     */
    async markAsRead(notificationId, userId) {
        await this.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
    }

    /**
     * Marca todas las notificaciones de un usuario como leídas
     * @param {number} userId - ID del usuario
     */
    async markAllAsRead(userId) {
        await this.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
            [userId]
        );
    }

    /**
     * Elimina notificaciones antiguas (más de 30 días)
     */
    async cleanOld() {
        await this.query(
            "DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'"
        );
    }

    /**
     * Obtiene IDs de usuarios con un rol específico
     * @param {Array<string>} roles - Roles a buscar
     * @returns {Promise<Array<{id: number}>>}
     */
    async findUsersByRoles(roles) {
        return this.queryAll(
            'SELECT id FROM users WHERE role = ANY($1)',
            [roles]
        );
    }
}

module.exports = NotificationRepository;
