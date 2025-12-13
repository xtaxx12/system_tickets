/**
 * Servicio de lógica de negocio para Roles y Permisos
 * Implementa el patrón Repository con inyección de dependencias.
 */
const { getPool } = require('../db');
const { getRepositoryContainer } = require('../repositories');
const { NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

// Lazy loading del container
let _container = null;
function getContainer() {
	if (!_container) {
		_container = getRepositoryContainer(getPool());
	}
	return _container;
}

/**
 * Servicio de Roles con inyección de dependencias
 */
class RoleService {
	/**
	 * @param {Object} deps - Dependencias inyectadas
	 * @param {import('../repositories/PermissionRepository')} deps.permissionRepository
	 */
	constructor(deps = {}) {
		this.permissionRepo = deps.permissionRepository || getContainer().permissions;
	}

	/**
	 * Obtener todos los roles con conteo de usuarios
	 * @returns {Promise<Array>}
	 */
	async getAllRolesWithUserCount() {
		const roles = await this.permissionRepo.getAllRoles();
		const userCounts = await this.permissionRepo.countUsersByRole();

		return roles.map(role => {
			const countInfo = userCounts.find(uc => uc.id === role.id);
			return {
				...role,
				user_count: countInfo ? parseInt(countInfo.user_count) : 0,
			};
		});
	}

	/**
	 * Obtener rol por ID con permisos
	 * @param {number} roleId
	 * @returns {Promise<Object>}
	 */
	async getRoleById(roleId) {
		const role = await this.permissionRepo.getRoleById(roleId);
		if (!role) {
			throw new NotFoundError('Rol');
		}
		return role;
	}

	/**
	 * Obtener todos los permisos organizados por categoría
	 * @returns {Promise<Object>}
	 */
	async getAllPermissions() {
		return this.permissionRepo.getAllPermissions();
	}

	/**
	 * Crear nuevo rol
	 * @param {Object} data
	 * @returns {Promise<number>}
	 */
	async createRole(data) {
		return this.permissionRepo.createRole(data);
	}

	/**
	 * Actualizar rol existente
	 * @param {number} roleId
	 * @param {Object} data
	 * @returns {Promise<boolean>}
	 */
	async updateRole(roleId, data) {
		const role = await this.permissionRepo.getRoleById(roleId);
		if (!role) {
			throw new NotFoundError('Rol');
		}

		await this.permissionRepo.updateRole(roleId, data);
		return true;
	}

	/**
	 * Eliminar rol
	 * @param {number} roleId
	 * @returns {Promise<boolean>}
	 */
	async deleteRole(roleId) {
		const role = await this.permissionRepo.getRoleById(roleId);
		if (!role) {
			throw new NotFoundError('Rol');
		}

		if (role.is_system) {
			throw new ForbiddenError('No se puede eliminar un rol del sistema');
		}

		await this.permissionRepo.deleteRole(roleId);
		return true;
	}

	/**
	 * Obtener permisos de un usuario
	 * @param {number} userId
	 * @returns {Promise<Array<string>>}
	 */
	async getUserPermissions(userId) {
		return this.permissionRepo.getUserPermissions(userId);
	}

	/**
	 * Verificar si un usuario tiene un permiso específico
	 * @param {number} userId
	 * @param {string} permissionName
	 * @returns {Promise<boolean>}
	 */
	async userHasPermission(userId, permissionName) {
		return this.permissionRepo.userHasPermission(userId, permissionName);
	}

	/**
	 * Verificar si un usuario tiene alguno de los permisos especificados
	 * @param {number} userId
	 * @param {Array<string>} permissionNames
	 * @returns {Promise<boolean>}
	 */
	async userHasAnyPermission(userId, permissionNames) {
		return this.permissionRepo.userHasAnyPermission(userId, permissionNames);
	}
}

// Instancia singleton para compatibilidad con código existente
const defaultInstance = new RoleService();

module.exports = {
	// Clase para testing y DI
	RoleService,

	// Métodos del singleton para compatibilidad
	getAllRolesWithUserCount: () => defaultInstance.getAllRolesWithUserCount(),
	getRoleById: (roleId) => defaultInstance.getRoleById(roleId),
	getAllPermissions: () => defaultInstance.getAllPermissions(),
	createRole: (data) => defaultInstance.createRole(data),
	updateRole: (roleId, data) => defaultInstance.updateRole(roleId, data),
	deleteRole: (roleId) => defaultInstance.deleteRole(roleId),
	getUserPermissions: (userId) => defaultInstance.getUserPermissions(userId),
	userHasPermission: (userId, permissionName) =>
		defaultInstance.userHasPermission(userId, permissionName),
	userHasAnyPermission: (userId, permissionNames) =>
		defaultInstance.userHasAnyPermission(userId, permissionNames),
};
