/**
 * Servicio de lógica de negocio para Usuarios
 * Implementa el patrón Repository con inyección de dependencias.
 */
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { getRepositoryContainer } = require('../repositories');
const { NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 10;

// Lazy loading del container
let _container = null;
function getContainer() {
	if (!_container) {
		_container = getRepositoryContainer(getPool());
	}
	return _container;
}

/**
 * Servicio de Usuarios con inyección de dependencias
 */
class UserService {
	/**
	 * @param {Object} deps - Dependencias inyectadas
	 * @param {import('../repositories/UserRepository')} deps.userRepository
	 * @param {import('../repositories/PermissionRepository')} deps.permissionRepository
	 */
	constructor(deps = {}) {
		this.userRepo = deps.userRepository || getContainer().users;
		this.permissionRepo = deps.permissionRepository || getContainer().permissions;
	}

	/**
	 * Autenticar usuario
	 * @param {string} username
	 * @param {string} password
	 * @returns {Promise<Object|null>}
	 */
	async authenticate(username, password) {
		const user = await this.userRepo.findByUsername(username);

		if (!user) {
			return null;
		}

		const isValid = bcrypt.compareSync(password, user.password_hash);
		if (!isValid) {
			return null;
		}

		return {
			id: user.id,
			username: user.username,
			role: user.role,
			role_id: user.role_id,
		};
	}

	/**
	 * Obtener usuario por ID
	 * @param {number} userId
	 * @returns {Promise<Object>}
	 */
	async getUserById(userId) {
		const user = await this.userRepo.findById(userId);

		if (!user) {
			throw new NotFoundError('Usuario');
		}

		// Excluir password_hash de la respuesta
		const { password_hash, ...safeUser } = user;
		return safeUser;
	}

	/**
	 * Listar todos los usuarios con información de rol
	 * @returns {Promise<Array>}
	 */
	async listUsers() {
		return this.userRepo.findAll();
	}

	/**
	 * Crear nuevo usuario
	 * @param {Object} data
	 * @returns {Promise<Object>}
	 */
	async createUser({ username, password, role_id }) {
		// Verificar que el username no exista
		const exists = await this.userRepo.exists(username);

		if (exists) {
			throw new ValidationError('El nombre de usuario ya existe', { username: 'Ya está en uso' });
		}

		// Obtener nombre del rol
		const role = await this.permissionRepo.getRoleById(role_id);

		if (!role) {
			throw new ValidationError('Rol inválido', { role_id: 'Rol no encontrado' });
		}

		const hash = bcrypt.hashSync(password, SALT_ROUNDS);

		return this.userRepo.create({
			username,
			password_hash: hash,
			role: role.name,
			role_id,
		});
	}

	/**
	 * Actualizar nombre de usuario
	 * @param {number} userId
	 * @param {string} newUsername
	 * @returns {Promise<Object>}
	 */
	async updateUsername(userId, newUsername) {
		// Verificar que no esté en uso por otro usuario
		const existingUser = await this.userRepo.findByUsername(newUsername);

		if (existingUser && existingUser.id !== userId) {
			throw new ValidationError('El nombre de usuario ya está en uso', { username: 'Ya está en uso' });
		}

		return this.userRepo.update(userId, { username: newUsername });
	}

	/**
	 * Cambiar contraseña
	 * @param {number} userId
	 * @param {string} currentPassword
	 * @param {string} newPassword
	 * @returns {Promise<boolean>}
	 */
	async changePassword(userId, currentPassword, newPassword) {
		const user = await this.userRepo.findById(userId);

		if (!user) {
			throw new NotFoundError('Usuario');
		}

		const isValid = bcrypt.compareSync(currentPassword, user.password_hash);
		if (!isValid) {
			throw new ValidationError('Contraseña actual incorrecta', { current_password: 'Incorrecta' });
		}

		const newHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
		await this.userRepo.update(userId, { password_hash: newHash });

		return true;
	}

	/**
	 * Cambiar rol de usuario
	 * @param {number} userId
	 * @param {number} newRoleId
	 * @param {number} currentUserId
	 * @returns {Promise<boolean>}
	 */
	async changeUserRole(userId, newRoleId, currentUserId) {
		if (userId === currentUserId) {
			throw new ForbiddenError('No puedes cambiar tu propio rol');
		}

		// Verificar que el rol existe
		const role = await this.permissionRepo.getRoleById(newRoleId);

		if (!role) {
			throw new ValidationError('Rol inválido', { role_id: 'Rol no encontrado' });
		}

		await this.userRepo.update(userId, {
			role: role.name,
			role_id: newRoleId,
		});

		return true;
	}

	/**
	 * Eliminar usuario
	 * @param {number} userId
	 * @param {number} currentUserId
	 * @returns {Promise<boolean>}
	 */
	async deleteUser(userId, currentUserId) {
		if (userId === currentUserId) {
			throw new ForbiddenError('No puedes eliminar tu propia cuenta');
		}

		const result = await this.userRepo.delete(userId);

		if (!result) {
			throw new NotFoundError('Usuario');
		}

		return true;
	}
}

// Instancia singleton para compatibilidad con código existente
const defaultInstance = new UserService();

module.exports = {
	// Clase para testing y DI
	UserService,

	// Métodos del singleton para compatibilidad
	authenticate: (username, password) => defaultInstance.authenticate(username, password),
	getUserById: (userId) => defaultInstance.getUserById(userId),
	listUsers: () => defaultInstance.listUsers(),
	createUser: (data) => defaultInstance.createUser(data),
	updateUsername: (userId, newUsername) => defaultInstance.updateUsername(userId, newUsername),
	changePassword: (userId, currentPassword, newPassword) =>
		defaultInstance.changePassword(userId, currentPassword, newPassword),
	changeUserRole: (userId, newRoleId, currentUserId) =>
		defaultInstance.changeUserRole(userId, newRoleId, currentUserId),
	deleteUser: (userId, currentUserId) => defaultInstance.deleteUser(userId, currentUserId),
};
