/**
 * Middlewares de autenticación y autorización
 */
const roleService = require('../services/roleService');

/**
 * Verificar que el usuario esté autenticado
 */
function requireAuth(req, res, next) {
	if (req.session && req.session.user) {
		return next();
	}
	return res.redirect('/admin/login');
}

/**
 * Verificar roles administrativos (admin, supervisor, tecnico)
 */
function requireAdmin(req, res, next) {
	if (req.session?.user && ['admin', 'supervisor', 'tecnico'].includes(req.session.user.role)) {
		return next();
	}
	return res.redirect('/admin/login');
}

/**
 * Solo administradores
 */
function requireSuperAdmin(req, res, next) {
	if (req.session?.user?.role === 'admin') {
		return next();
	}
	return res.status(403).render('admin/error', {
		title: 'Acceso Denegado',
		message: 'No tienes permisos para acceder a esta sección',
		user: req.session?.user
	});
}

/**
 * Admin y supervisor
 */
function requireSupervisor(req, res, next) {
	if (req.session?.user && ['admin', 'supervisor'].includes(req.session.user.role)) {
		return next();
	}
	return res.status(403).render('admin/error', {
		title: 'Acceso Denegado',
		message: 'Solo administradores y supervisores pueden acceder',
		user: req.session?.user
	});
}

/**
 * Middleware para verificar un permiso específico
 */
function requirePermission(permissionName) {
	return async (req, res, next) => {
		if (!req.session?.user) {
			return res.redirect('/admin/login');
		}

		try {
			const hasPermission = await roleService.userHasPermission(req.session.user.id, permissionName);
			if (hasPermission) {
				return next();
			}

			return res.status(403).render('admin/error', {
				title: 'Acceso Denegado',
				message: 'No tienes permisos suficientes para realizar esta acción',
				user: req.session.user
			});
		} catch (err) {
			console.error('Error verificando permisos:', err);
			return res.status(500).send('Error al verificar permisos');
		}
	};
}

/**
 * Middleware para verificar múltiples permisos (cualquiera)
 */
function requireAnyPermission(...permissionNames) {
	return async (req, res, next) => {
		if (!req.session?.user) {
			return res.redirect('/admin/login');
		}

		try {
			const hasPermission = await roleService.userHasAnyPermission(req.session.user.id, permissionNames);
			if (hasPermission) {
				return next();
			}

			return res.status(403).render('admin/error', {
				title: 'Acceso Denegado',
				message: 'No tienes permisos suficientes para realizar esta acción',
				user: req.session.user
			});
		} catch (err) {
			console.error('Error verificando permisos:', err);
			return res.status(500).send('Error al verificar permisos');
		}
	};
}

/**
 * Agregar permisos del usuario a la request
 */
async function addUserPermissions(req, res, next) {
	if (req.session?.user) {
		try {
			req.userPermissions = await roleService.getUserPermissions(req.session.user.id);
		} catch (err) {
			console.error('Error obteniendo permisos:', err);
			req.userPermissions = [];
		}
	} else {
		req.userPermissions = [];
	}
	next();
}

module.exports = {
	requireAuth,
	requireAdmin,
	requireSuperAdmin,
	requireSupervisor,
	requirePermission,
	requireAnyPermission,
	addUserPermissions,
};
