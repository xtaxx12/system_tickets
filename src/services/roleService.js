/**
 * Servicio de lógica de negocio para Roles y Permisos
 */
const permissionModel = require('../models/permissions');
const { NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * Obtener todos los roles con conteo de usuarios
 */
async function getAllRolesWithUserCount() {
	const roles = await permissionModel.getAllRoles();
	const userCounts = await permissionModel.countUsersByRole();

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
 */
async function getRoleById(roleId) {
	const role = await permissionModel.getRoleById(roleId);
	if (!role) {
		throw new NotFoundError('Rol');
	}
	return role;
}

/**
 * Obtener todos los permisos organizados por categoría
 */
async function getAllPermissions() {
	return permissionModel.getAllPermissions();
}

/**
 * Crear nuevo rol
 */
async function createRole(data) {
	return permissionModel.createRole(data);
}

/**
 * Actualizar rol existente
 */
async function updateRole(roleId, data) {
	const role = await permissionModel.getRoleById(roleId);
	if (!role) {
		throw new NotFoundError('Rol');
	}

	await permissionModel.updateRole(roleId, data);
	return true;
}

/**
 * Eliminar rol
 */
async function deleteRole(roleId) {
	const role = await permissionModel.getRoleById(roleId);
	if (!role) {
		throw new NotFoundError('Rol');
	}

	if (role.is_system) {
		throw new ForbiddenError('No se puede eliminar un rol del sistema');
	}

	await permissionModel.deleteRole(roleId);
	return true;
}

/**
 * Obtener permisos de un usuario
 */
async function getUserPermissions(userId) {
	return permissionModel.getUserPermissions(userId);
}

module.exports = {
	getAllRolesWithUserCount,
	getRoleById,
	getAllPermissions,
	createRole,
	updateRole,
	deleteRole,
	getUserPermissions,
};
