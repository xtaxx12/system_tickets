/**
 * Ticket Repository
 * Abstracción de acceso a datos para tickets.
 * El pool se inyecta, facilitando testing y flexibilidad de BD.
 */

const { v4: uuidv4 } = require('uuid');
const BaseRepository = require('./BaseRepository');

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

class TicketRepository extends BaseRepository {
    /**
     * Genera una referencia única para un ticket
     * @returns {string}
     * @private
     */
    _generateReference() {
        const base = uuidv4().split('-')[0].toUpperCase();
        const now = new Date();
        const y = String(now.getFullYear()).slice(-2);
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `T-${y}${m}${d}-${base}`;
    }

    /**
     * Crea un nuevo ticket
     * @param {Object} data - Datos del ticket
     * @returns {Promise<Object>}
     */
    async create(data) {
        const reference = this._generateReference();
        const editToken = uuidv4();

        const sql = `
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

        return this.queryOne(sql, values);
    }

    /**
     * Busca un ticket por ID
     * @param {number} id - ID del ticket
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        return this.queryOne('SELECT * FROM tickets WHERE id = $1', [id]);
    }

    /**
     * Busca un ticket por referencia con información del técnico asignado
     * @param {string} reference - Referencia del ticket
     * @returns {Promise<Object|null>}
     */
    async findByReference(reference) {
        const sql = `
			SELECT t.*, u.username as assigned_username
			FROM tickets t
			LEFT JOIN users u ON t.assigned_to = u.id
			WHERE t.reference = $1
		`;
        return this.queryOne(sql, [reference]);
    }

    /**
     * Busca un ticket por token de edición
     * @param {string} editToken - Token de edición
     * @returns {Promise<Object|null>}
     */
    async findByEditToken(editToken) {
        return this.queryOne('SELECT * FROM tickets WHERE edit_token = $1', [editToken]);
    }

    /**
     * Actualiza un ticket por token de edición
     * @param {string} editToken - Token de edición
     * @param {Object} updates - Campos a actualizar
     * @returns {Promise<Object|null>}
     */
    async updateByToken(editToken, updates) {
        const fields = [];
        const params = [];
        let idx = 1;

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = $${idx++}`);
            params.push(value);
        }

        if (fields.length === 0) {
            return this.findByEditToken(editToken);
        }

        params.push(editToken);
        const sql = `UPDATE tickets SET ${fields.join(', ')}, updated_at = NOW() WHERE edit_token = $${idx} RETURNING *`;
        return this.queryOne(sql, params);
    }

    /**
     * Actualiza el estado de un ticket por ID
     * @param {number} id - ID del ticket
     * @param {string} status - Nuevo estado
     * @returns {Promise<Object|null>}
     */
    async updateStatus(id, status) {
        if (!STATUSES.includes(status)) {
            throw new Error('Estado inválido');
        }
        const sql = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
        return this.queryOne(sql, [status, id]);
    }

    /**
     * Lista tickets con filtros y paginación
     * @param {Object} filters - Filtros (status, priority, support_type, assigned_to)
     * @param {number} limit - Límite de resultados
     * @param {number} offset - Offset para paginación
     * @returns {Promise<Array>}
     */
    async findAll(filters = {}, limit = 100, offset = 0) {
        const where = [];
        const params = [];
        let idx = 1;

        if (filters.status) {
            where.push(`t.status = $${idx++}`);
            params.push(filters.status);
        }
        if (filters.priority) {
            where.push(`t.priority = $${idx++}`);
            params.push(filters.priority);
        }
        if (filters.support_type) {
            where.push(`t.support_type = $${idx++}`);
            params.push(filters.support_type);
        }
        if (filters.assigned_to) {
            if (filters.assigned_to === 'unassigned') {
                where.push(`t.assigned_to IS NULL`);
            } else {
                where.push(`t.assigned_to = $${idx++}`);
                params.push(parseInt(filters.assigned_to));
            }
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit, offset);

        const sql = `
			SELECT t.*, u.username as assigned_username
			FROM tickets t
			LEFT JOIN users u ON t.assigned_to = u.id
			${whereSql}
			ORDER BY t.created_at DESC
			LIMIT $${idx++} OFFSET $${idx}
		`;

        return this.queryAll(sql, params);
    }

    /**
     * Cuenta tickets según filtros
     * @param {Object} filters - Filtros
     * @returns {Promise<number>}
     */
    async count(filters = {}) {
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
        if (filters.assigned_to) {
            if (filters.assigned_to === 'unassigned') {
                where.push(`assigned_to IS NULL`);
            } else {
                where.push(`assigned_to = $${idx++}`);
                params.push(parseInt(filters.assigned_to));
            }
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const sql = `SELECT COUNT(*) as total FROM tickets ${whereSql}`;
        const row = await this.queryOne(sql, params);
        return parseInt(row?.total || 0);
    }

    /**
     * Obtiene estadísticas de tickets
     * @param {Object} filters - Filtros opcionales
     * @returns {Promise<Object>}
     */
    async getStats(filters = {}) {
        const where = [];
        const params = [];
        let idx = 1;

        if (filters.priority) {
            where.push(`priority = $${idx++}`);
            params.push(filters.priority);
        }
        if (filters.support_type) {
            where.push(`support_type = $${idx++}`);
            params.push(filters.support_type);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const sql = `
			SELECT 
				COUNT(*) as total,
				SUM(CASE WHEN status = 'Pendiente' THEN 1 ELSE 0 END) as pendiente,
				SUM(CASE WHEN status = 'En Proceso' THEN 1 ELSE 0 END) as en_proceso,
				SUM(CASE WHEN status = 'Resuelto' THEN 1 ELSE 0 END) as resuelto,
				SUM(CASE WHEN status = 'Cerrado' THEN 1 ELSE 0 END) as cerrado
			FROM tickets ${whereSql}
		`;

        const row = await this.queryOne(sql, params);
        return {
            total: parseInt(row?.total) || 0,
            pendiente: parseInt(row?.pendiente) || 0,
            enProceso: parseInt(row?.en_proceso) || 0,
            resuelto: parseInt(row?.resuelto) || 0,
            cerrado: parseInt(row?.cerrado) || 0,
        };
    }

    /**
     * Asigna un ticket a un técnico
     * @param {number} ticketId - ID del ticket
     * @param {number|null} technicianId - ID del técnico (null para desasignar)
     * @returns {Promise<Object|null>}
     */
    async assign(ticketId, technicianId) {
        const sql = `
			UPDATE tickets
			SET assigned_to = $1, updated_at = NOW()
			WHERE id = $2
			RETURNING *
		`;
        return this.queryOne(sql, [technicianId || null, ticketId]);
    }

    /**
     * Elimina un ticket por ID
     * @param {number} id - ID del ticket
     * @returns {Promise<Object|null>}
     */
    async delete(id) {
        return this.queryOne('DELETE FROM tickets WHERE id = $1 RETURNING *', [id]);
    }
}

// Exportar constantes junto con la clase
TicketRepository.SUPPORT_TYPES = SUPPORT_TYPES;
TicketRepository.PRIORITIES = PRIORITIES;
TicketRepository.STATUSES = STATUSES;

module.exports = TicketRepository;
