/**
 * Repository Index
 * Exporta todos los repositorios y un contenedor de inyección de dependencias.
 */

const BaseRepository = require('./BaseRepository');
const TicketRepository = require('./TicketRepository');
const CommentRepository = require('./CommentRepository');
const NotificationRepository = require('./NotificationRepository');
const UserRepository = require('./UserRepository');
const PermissionRepository = require('./PermissionRepository');

/**
 * Contenedor de Inyección de Dependencias para Repositorios
 * Facilita la creación y gestión de instancias de repositorios con el pool inyectado.
 */
class RepositoryContainer {
    /**
     * @param {import('pg').Pool} pool - Pool de conexiones PostgreSQL
     */
    constructor(pool) {
        if (!pool) {
            throw new Error('Pool de base de datos es requerido');
        }
        this._pool = pool;
        this._instances = {};
    }

    /**
     * Obtiene o crea una instancia del repositorio de tickets
     * @returns {TicketRepository}
     */
    get tickets() {
        if (!this._instances.tickets) {
            this._instances.tickets = new TicketRepository(this._pool);
        }
        return this._instances.tickets;
    }

    /**
     * Obtiene o crea una instancia del repositorio de comentarios
     * @returns {CommentRepository}
     */
    get comments() {
        if (!this._instances.comments) {
            this._instances.comments = new CommentRepository(this._pool);
        }
        return this._instances.comments;
    }

    /**
     * Obtiene o crea una instancia del repositorio de notificaciones
     * @returns {NotificationRepository}
     */
    get notifications() {
        if (!this._instances.notifications) {
            this._instances.notifications = new NotificationRepository(this._pool);
        }
        return this._instances.notifications;
    }

    /**
     * Obtiene o crea una instancia del repositorio de usuarios
     * @returns {UserRepository}
     */
    get users() {
        if (!this._instances.users) {
            this._instances.users = new UserRepository(this._pool);
        }
        return this._instances.users;
    }

    /**
     * Obtiene o crea una instancia del repositorio de permisos
     * @returns {PermissionRepository}
     */
    get permissions() {
        if (!this._instances.permissions) {
            this._instances.permissions = new PermissionRepository(this._pool);
        }
        return this._instances.permissions;
    }
}

// Instancia singleton del contenedor (inicializada bajo demanda)
let containerInstance = null;

/**
 * Obtiene el contenedor de repositorios singleton
 * @param {import('pg').Pool} [pool] - Pool de conexiones (solo necesario en primera llamada)
 * @returns {RepositoryContainer}
 */
function getRepositoryContainer(pool) {
    if (!containerInstance) {
        if (!pool) {
            throw new Error('Pool es requerido para inicializar el contenedor de repositorios');
        }
        containerInstance = new RepositoryContainer(pool);
    }
    return containerInstance;
}

/**
 * Crea un nuevo contenedor de repositorios (útil para testing)
 * @param {import('pg').Pool} pool - Pool de conexiones
 * @returns {RepositoryContainer}
 */
function createRepositoryContainer(pool) {
    return new RepositoryContainer(pool);
}

/**
 * Resetea el contenedor singleton (útil para testing)
 */
function resetRepositoryContainer() {
    containerInstance = null;
}

module.exports = {
    // Clases de repositorios para instanciación directa
    BaseRepository,
    TicketRepository,
    CommentRepository,
    NotificationRepository,
    UserRepository,
    PermissionRepository,

    // Container y utilidades
    RepositoryContainer,
    getRepositoryContainer,
    createRepositoryContainer,
    resetRepositoryContainer,
};
