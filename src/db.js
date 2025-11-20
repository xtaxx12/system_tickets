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
				role TEXT NOT NULL CHECK (role IN ('admin','user'))
			);
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

		const adminUser = process.env.ADMIN_USER || 'admin';
		const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
		const existing = await client.query('SELECT id FROM users WHERE username = $1', [adminUser]);
		if (existing.rowCount === 0) {
			const hash = bcrypt.hashSync(adminPassword, 10);
			await client.query(
				'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
				[adminUser, hash, 'admin']
			);
			console.log('Usuario admin creado:', adminUser);
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
