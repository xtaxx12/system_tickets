const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('./config');

let pool;

function getPool() {
	if (!pool) {
		pool = new Pool({
			host: config.db.host,
			port: config.db.port,
			user: config.db.user,
			password: config.db.password,
			database: config.db.database,
			ssl: config.db.ssl,
			max: 20,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 2000,
		});

		pool.on('error', (err) => {
			console.error('Error inesperado en pool de PostgreSQL:', err);
		});
	}
	return pool;
}

async function ensureDatabaseInitialized() {
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');

		// Crear tablas base
		await createTables(client);

		// Crear índices
		await createIndexes(client);

		// Crear sistema de roles y permisos
		await createRolesAndPermissions(client);

		// Crear usuarios por defecto
		await createDefaultUsers(client);

		await client.query('COMMIT');
	} catch (e) {
		await client.query('ROLLBACK');
		console.error('Error inicializando DB:', e);
		throw e;
	} finally {
		client.release();
	}
}

async function createTables(client) {
	// Tabla de usuarios
	await client.query(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK (role IN ('admin','supervisor','tecnico','user')),
			role_id INTEGER,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);

	// Tabla de tickets
	await client.query(`
		CREATE TABLE IF NOT EXISTS tickets (
			id SERIAL PRIMARY KEY,
			reference TEXT UNIQUE NOT NULL,
			requester_name TEXT NOT NULL,
			department TEXT NOT NULL,
			support_type TEXT NOT NULL,
			priority TEXT NOT NULL,
			subject TEXT NOT NULL,
			description TEXT NOT NULL,
			image_path TEXT,
			has_anydesk BOOLEAN NOT NULL DEFAULT false,
			anydesk_code TEXT,
			status TEXT NOT NULL DEFAULT 'Pendiente',
			edit_token TEXT NOT NULL,
			assigned_to INTEGER REFERENCES users(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);

	// Tabla de comentarios
	await client.query(`
		CREATE TABLE IF NOT EXISTS comments (
			id SERIAL PRIMARY KEY,
			ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
			user_id INTEGER REFERENCES users(id),
			author_name TEXT NOT NULL,
			author_email TEXT,
			content TEXT NOT NULL,
			is_internal BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);

	// Tabla de notificaciones
	await client.query(`
		CREATE TABLE IF NOT EXISTS notifications (
			id SERIAL PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			type TEXT NOT NULL,
			title TEXT NOT NULL,
			message TEXT NOT NULL,
			ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
			is_read BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);

	// Tabla de roles
	await client.query(`
		CREATE TABLE IF NOT EXISTS roles (
			id SERIAL PRIMARY KEY,
			name TEXT UNIQUE NOT NULL,
			display_name TEXT NOT NULL,
			description TEXT,
			is_system BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);

	// Tabla de permisos
	await client.query(`
		CREATE TABLE IF NOT EXISTS permissions (
			id SERIAL PRIMARY KEY,
			name TEXT UNIQUE NOT NULL,
			display_name TEXT NOT NULL,
			description TEXT,
			category TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);

	// Tabla de relación roles-permisos
	await client.query(`
		CREATE TABLE IF NOT EXISTS role_permissions (
			role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
			permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
			PRIMARY KEY (role_id, permission_id)
		);
	`);

	// Agregar foreign key de role_id a users si no existe
	await client.query(`
		DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.table_constraints
				WHERE constraint_name = 'users_role_id_fkey'
			) THEN
				ALTER TABLE users ADD CONSTRAINT users_role_id_fkey
				FOREIGN KEY (role_id) REFERENCES roles(id);
			END IF;
		EXCEPTION WHEN OTHERS THEN NULL;
		END $$;
	`);
}

async function createIndexes(client) {
	const indexes = [
		'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
		'CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)',
		'CREATE INDEX IF NOT EXISTS idx_tickets_support_type ON tickets(support_type)',
		'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)',
		'CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC)',
		'CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id)',
		'CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at)',
		'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
		'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)',
		'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)',
	];

	for (const sql of indexes) {
		await client.query(sql);
	}
}

async function createRolesAndPermissions(client) {
	// Permisos predefinidos
	const permissions = [
		{ name: 'view_tickets', display_name: 'Ver tickets', description: 'Permite ver la lista de tickets', category: 'tickets' },
		{ name: 'view_all_tickets', display_name: 'Ver todos los tickets', description: 'Permite ver todos los tickets del sistema', category: 'tickets' },
		{ name: 'view_ticket_details', display_name: 'Ver detalles de tickets', description: 'Permite ver los detalles completos de un ticket', category: 'tickets' },
		{ name: 'create_tickets', display_name: 'Crear tickets', description: 'Permite crear nuevos tickets desde el panel admin', category: 'tickets' },
		{ name: 'edit_tickets', display_name: 'Editar tickets', description: 'Permite editar información de tickets', category: 'tickets' },
		{ name: 'delete_tickets', display_name: 'Eliminar tickets', description: 'Permite eliminar tickets', category: 'tickets' },
		{ name: 'change_ticket_status', display_name: 'Cambiar estado de tickets', description: 'Permite cambiar el estado de los tickets', category: 'tickets' },
		{ name: 'assign_tickets', display_name: 'Asignar tickets', description: 'Permite asignar tickets a técnicos', category: 'tickets' },
		{ name: 'add_comments', display_name: 'Agregar comentarios', description: 'Permite agregar comentarios públicos', category: 'comments' },
		{ name: 'add_internal_comments', display_name: 'Agregar comentarios internos', description: 'Permite agregar comentarios internos', category: 'comments' },
		{ name: 'view_statistics', display_name: 'Ver estadísticas', description: 'Permite ver estadísticas del sistema', category: 'statistics' },
		{ name: 'manage_users', display_name: 'Gestionar usuarios', description: 'Permite crear, editar y eliminar usuarios', category: 'administration' },
		{ name: 'manage_roles', display_name: 'Gestionar roles', description: 'Permite crear y editar roles y permisos', category: 'administration' },
		{ name: 'view_notifications', display_name: 'Ver notificaciones', description: 'Permite recibir y ver notificaciones', category: 'notifications' }
	];

	for (const perm of permissions) {
		await client.query(`
			INSERT INTO permissions (name, display_name, description, category)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (name) DO NOTHING
		`, [perm.name, perm.display_name, perm.description, perm.category]);
	}

	// Roles del sistema
	const systemRoles = [
		{
			name: 'admin',
			display_name: '👑 Administrador',
			description: 'Acceso total al sistema',
			permissions: permissions.map(p => p.name)
		},
		{
			name: 'supervisor',
			display_name: '👁️ Supervisor',
			description: 'Puede gestionar tickets y asignar técnicos',
			permissions: ['view_tickets', 'view_all_tickets', 'view_ticket_details', 'change_ticket_status', 'assign_tickets', 'add_comments', 'add_internal_comments', 'view_statistics', 'view_notifications']
		},
		{
			name: 'tecnico',
			display_name: '🔧 Técnico',
			description: 'Puede ver y trabajar en tickets asignados',
			permissions: ['view_tickets', 'view_all_tickets', 'view_ticket_details', 'change_ticket_status', 'add_comments', 'add_internal_comments', 'view_notifications']
		}
	];

	for (const role of systemRoles) {
		const { rows: existingRole } = await client.query('SELECT id FROM roles WHERE name = $1', [role.name]);

		let roleId;
		if (existingRole.length === 0) {
			const { rows } = await client.query(
				`INSERT INTO roles (name, display_name, description, is_system)
				 VALUES ($1, $2, $3, true) RETURNING id`,
				[role.name, role.display_name, role.description]
			);
			roleId = rows[0].id;
		} else {
			roleId = existingRole[0].id;
		}

		// Asignar permisos
		for (const permName of role.permissions) {
			const { rows: permRows } = await client.query('SELECT id FROM permissions WHERE name = $1', [permName]);
			if (permRows.length > 0) {
				await client.query(`
					INSERT INTO role_permissions (role_id, permission_id)
					VALUES ($1, $2) ON CONFLICT DO NOTHING
				`, [roleId, permRows[0].id]);
			}
		}
	}

	// Migrar usuarios existentes
	const { rows: usersToMigrate } = await client.query('SELECT id, role FROM users WHERE role_id IS NULL');
	for (const user of usersToMigrate) {
		const { rows: roleRows } = await client.query('SELECT id FROM roles WHERE name = $1', [user.role]);
		if (roleRows.length > 0) {
			await client.query('UPDATE users SET role_id = $1 WHERE id = $2', [roleRows[0].id, user.id]);
		}
	}
}

async function createDefaultUsers(client) {
	const { rows: adminRoleRows } = await client.query('SELECT id FROM roles WHERE name = $1', ['admin']);
	const adminRoleId = adminRoleRows[0]?.id;

	// Usuario admin principal
	const existing = await client.query('SELECT id FROM users WHERE username = $1', [config.admin.username]);
	if (existing.rowCount === 0 && adminRoleId) {
		const hash = bcrypt.hashSync(config.admin.password, 10);
		await client.query(
			'INSERT INTO users (username, password_hash, role, role_id) VALUES ($1,$2,$3,$4)',
			[config.admin.username, hash, 'admin', adminRoleId]
		);
		console.log('✅ Usuario admin creado:', config.admin.username);
	}
}

module.exports = { getPool, ensureDatabaseInitialized };
