/**
 * Setup global para tests
 */

// Variables de entorno para tests
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-minimum-32-characters-long-for-testing';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'testadmin123';
process.env.PGHOST = process.env.PGHOST || 'localhost';
process.env.PGPORT = process.env.PGPORT || '5432';
process.env.PGUSER = process.env.PGUSER || 'postgres';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'admin123';
process.env.PGDATABASE = process.env.PGDATABASE || 'tickets_test';

// Silenciar logs durante tests
process.env.LOG_LEVEL = 'error';
