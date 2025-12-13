/**
 * Base Repository Class
 * Proporciona una capa de abstracción para operaciones de base de datos.
 * Implementa el patrón Repository para desacoplar la lógica de negocio del acceso a datos.
 *
 * Beneficios:
 * - Inyección de dependencias: el pool se pasa al constructor
 * - Testing aislado: fácil de mockear
 * - Cambio de BD transparente
 */

class BaseRepository {
	/**
	 * @param {import('pg').Pool} pool - Pool de conexiones PostgreSQL inyectado
	 */
	constructor(pool) {
		if (!pool) {
			throw new Error('Pool de base de datos es requerido');
		}
		this.pool = pool;
	}

	/**
	 * Ejecuta una consulta SQL
	 * @param {string} sql - Consulta SQL
	 * @param {Array} params - Parámetros de la consulta
	 * @returns {Promise<import('pg').QueryResult>}
	 */
	async query(sql, params = []) {
		return this.pool.query(sql, params);
	}

	/**
	 * Ejecuta una consulta y retorna la primera fila o null
	 * @param {string} sql - Consulta SQL
	 * @param {Array} params - Parámetros de la consulta
	 * @returns {Promise<Object|null>}
	 */
	async queryOne(sql, params = []) {
		const { rows } = await this.pool.query(sql, params);
		return rows[0] || null;
	}

	/**
	 * Ejecuta una consulta y retorna todas las filas
	 * @param {string} sql - Consulta SQL
	 * @param {Array} params - Parámetros de la consulta
	 * @returns {Promise<Array>}
	 */
	async queryAll(sql, params = []) {
		const { rows } = await this.pool.query(sql, params);
		return rows;
	}

	/**
	 * Obtiene un cliente de conexión para transacciones
	 * @returns {Promise<import('pg').PoolClient>}
	 */
	async getClient() {
		return this.pool.connect();
	}

	/**
	 * Ejecuta una función dentro de una transacción
	 * @param {Function} callback - Función que recibe el cliente de transacción
	 * @returns {Promise<*>}
	 */
	async withTransaction(callback) {
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			const result = await callback(client);
			await client.query('COMMIT');
			return result;
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}
}

module.exports = BaseRepository;
