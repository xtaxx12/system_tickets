const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function getPool() {
	if (!pool) {
		pool = new Pool({
			host: process.env.PGHOST || 'localhost',
			port: Number(process.env.PGPORT || 5432),
			user: process.env.PGUSER || 'postgres',
			password: process.env.PGPASSWORD || 'admin123',
			database: process.env.PGDATABASE || 'tickets',
			ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
		});
	}
	return pool;
}

async function ensureDatabaseInitialized() {
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');
		await client.query(`
			CREATE TABLE IF NOT EXISTS users (
				id SERIAL PRIMARY KEY,
				username TEXT UNIQUE NOT NULL,
				password_hash TEXT NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('admin','supervisor','tecnico','user')),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);

		// Migración: agregar created_at a users si no existe
		await client.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name='users' AND column_name='created_at'
				) THEN
					ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
				END IF;
			END $$;
		`);

		// Migración: actualizar constraint de roles si existe la tabla
		await client.query(`
			DO $$
			BEGIN
				ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
				ALTER TABLE users ADD CONSTRAINT users_role_check
					CHECK (role IN ('admin','supervisor','tecnico','user'));
			EXCEPTION
				WHEN OTHERS THEN NULL;
			END $$;
		`);
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
		// Migración: agregar assigned_to si no existe
		await client.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name='tickets' AND column_name='assigned_to'
				) THEN
					ALTER TABLE tickets ADD COLUMN assigned_to INTEGER REFERENCES users(id);
				END IF;
			END $$;
		`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_support_type ON tickets(support_type)`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)`);

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
		await client.query(`CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id)`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at)`);

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
		await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)`);
		await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)`);

		// ============================================================================
		// Sistema de Roles y Permisos Personalizables
		// ============================================================================

		// Tabla de roles personalizables
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

		// Migración: agregar role_id a users
		await client.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name='users' AND column_name='role_id'
				) THEN
					ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id);
				END IF;
			END $$;
		`);

		// Insertar permisos predefinidos
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

		// Crear roles del sistema
		const systemRoles = [
			{
				name: 'admin',
				display_name: '👑 Administrador',
				description: 'Acceso total al sistema',
				permissions: ['view_tickets', 'view_all_tickets', 'view_ticket_details', 'create_tickets', 'edit_tickets', 'delete_tickets', 'change_ticket_status', 'assign_tickets', 'add_comments', 'add_internal_comments', 'view_statistics', 'manage_users', 'manage_roles', 'view_notifications']
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
					 VALUES ($1, $2, $3, true)
					 RETURNING id`,
					[role.name, role.display_name, role.description]
				);
				roleId = rows[0].id;
				console.log(`Rol del sistema creado: ${role.name}`);
			} else {
				roleId = existingRole[0].id;
			}

			// Asignar permisos al rol
			for (const permName of role.permissions) {
				const { rows: permRows } = await client.query('SELECT id FROM permissions WHERE name = $1', [permName]);
				if (permRows.length > 0) {
					await client.query(
						`INSERT INTO role_permissions (role_id, permission_id)
						 VALUES ($1, $2)
						 ON CONFLICT DO NOTHING`,
						[roleId, permRows[0].id]
					);
				}
			}
		}

		// Migrar usuarios existentes al nuevo sistema de roles
		const { rows: usersToMigrate } = await client.query(`
			SELECT id, role FROM users WHERE role_id IS NULL
		`);

		for (const user of usersToMigrate) {
			const { rows: roleRows } = await client.query('SELECT id FROM roles WHERE name = $1', [user.role]);
			if (roleRows.length > 0) {
				await client.query('UPDATE users SET role_id = $1 WHERE id = $2', [roleRows[0].id, user.id]);
			}
		}

		// Crear usuario admin principal
		const adminUser = process.env.ADMIN_USER || 'admin';
		const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
		const existing = await client.query('SELECT id FROM users WHERE username = $1', [adminUser]);
		if (existing.rowCount === 0) {
			const { rows: adminRoleRows } = await client.query('SELECT id FROM roles WHERE name = $1', ['admin']);
			const hash = bcrypt.hashSync(adminPassword, 10);
			await client.query(
				'INSERT INTO users (username, password_hash, role, role_id) VALUES ($1,$2,$3,$4)',
				[adminUser, hash, 'admin', adminRoleRows[0].id]
			);
			console.log('Usuario admin creado:', adminUser);
		}

		// Crear usuarios adicionales con diferentes roles si no existen
		const defaultUsers = [
			{ username: 'supervisor1', password: 'supervisor123', role: 'supervisor' },
			{ username: 'tecnico1', password: 'tecnico123', role: 'tecnico' },
			{ username: 'tecnico2', password: 'tecnico123', role: 'tecnico' }
		];

		for (const user of defaultUsers) {
			const existingUser = await client.query('SELECT id FROM users WHERE username = $1', [user.username]);
			if (existingUser.rowCount === 0) {
				const { rows: userRoleRows } = await client.query('SELECT id FROM roles WHERE name = $1', [user.role]);
				const hash = bcrypt.hashSync(user.password, 10);
				await client.query(
					'INSERT INTO users (username, password_hash, role, role_id) VALUES ($1,$2,$3,$4)',
					[user.username, hash, user.role, userRoleRows[0].id]
				);
				console.log(`Usuario ${user.role} creado:`, user.username);
			}
		}

		await client.query('COMMIT');
	} catch (e) {
		await client.query('ROLLBACK');
		console.error('Error inicializando DB:', e);
		throw e;
	} finally {
		client.release();
	}
}

module.exports = { getPool, ensureDatabaseInitialized };
