/**
 * Comment Repository
 * Abstracción de acceso a datos para comentarios.
 */

const BaseRepository = require('./BaseRepository');

class CommentRepository extends BaseRepository {
    /**
     * Crea un nuevo comentario
     * @param {Object} data - Datos del comentario
     * @returns {Promise<Object>}
     */
    async create(data) {
        const sql = `
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
        return this.queryOne(sql, values);
    }

    /**
     * Busca un comentario por ID
     * @param {number} id - ID del comentario
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        return this.queryOne('SELECT * FROM comments WHERE id = $1', [id]);
    }

    /**
     * Obtiene comentarios de un ticket
     * @param {number} ticketId - ID del ticket
     * @param {boolean} includeInternal - Incluir comentarios internos
     * @returns {Promise<Array>}
     */
    async findByTicketId(ticketId, includeInternal = false) {
        let sql = 'SELECT * FROM comments WHERE ticket_id = $1';
        if (!includeInternal) {
            sql += ' AND is_internal = false';
        }
        sql += ' ORDER BY created_at ASC';
        return this.queryAll(sql, [ticketId]);
    }

    /**
     * Cuenta comentarios públicos de un ticket
     * @param {number} ticketId - ID del ticket
     * @returns {Promise<number>}
     */
    async countByTicketId(ticketId) {
        const row = await this.queryOne(
            'SELECT COUNT(*) as count FROM comments WHERE ticket_id = $1 AND is_internal = false',
            [ticketId]
        );
        return parseInt(row?.count || 0);
    }

    /**
     * Elimina un comentario por ID
     * @param {number} id - ID del comentario
     * @returns {Promise<Object|null>}
     */
    async delete(id) {
        return this.queryOne('DELETE FROM comments WHERE id = $1 RETURNING *', [id]);
    }
}

module.exports = CommentRepository;
