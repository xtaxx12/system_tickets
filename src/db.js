const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

let dbInstance;

function getDb() {
	if (!dbInstance) {
		const dataDir = path.join(__dirname, '..', 'data');
		if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
		const dbPath = path.join(dataDir, 'tickets.db');
		dbInstance = new Database(dbPath);
	}
	return dbInstance;
}

function ensureDatabaseInitialized() {
	const db = getDb();
	// Crear tablas si no existen
	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('admin','user'))
		);

		CREATE TABLE IF NOT EXISTS tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			reference TEXT UNIQUE NOT NULL,
			requester_name TEXT NOT NULL,
			department TEXT NOT NULL,
			support_type TEXT NOT NULL,
			priority TEXT NOT NULL,
			subject TEXT NOT NULL,
			description TEXT NOT NULL,
			image_path TEXT,
			has_anydesk INTEGER NOT NULL DEFAULT 0,
			anydesk_code TEXT,
			status TEXT NOT NULL DEFAULT 'Pendiente',
			edit_token TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
		CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
		CREATE INDEX IF NOT EXISTS idx_tickets_support_type ON tickets(support_type);
	`);

	// Crear usuario admin por defecto si no existe
	const adminUser = process.env.ADMIN_USER || 'admin';
	const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
	const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser);
	if (!existing) {
		const passwordHash = bcrypt.hashSync(adminPassword, 10);
		db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)').run(adminUser, passwordHash, 'admin');
		console.log('Usuario admin creado:', adminUser);
	}
}

module.exports = { getDb, ensureDatabaseInitialized };
