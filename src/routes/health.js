/**
 * Endpoints de health check para monitoreo
 */
const express = require('express');
const { getPool } = require('../db');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Health check básico
 * Retorna 200 si el servidor está corriendo
 */
router.get('/health', (req, res) => {
	res.status(200).json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

/**
 * Health check completo
 * Verifica conexión a base de datos
 */
router.get('/health/ready', async (req, res) => {
	const checks = {
		server: { status: 'ok' },
		database: { status: 'unknown' },
	};

	let overallStatus = 'ok';

	// Verificar base de datos
	try {
		const startTime = Date.now();
		await getPool().query('SELECT 1');
		const duration = Date.now() - startTime;

		checks.database = {
			status: 'ok',
			responseTime: `${duration}ms`,
		};
	} catch (err) {
		checks.database = {
			status: 'error',
			error: err.message,
		};
		overallStatus = 'degraded';
		logger.error('Health check: Database connection failed', { error: err.message });
	}

	const statusCode = overallStatus === 'ok' ? 200 : 503;

	res.status(statusCode).json({
		status: overallStatus,
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		version: process.env.npm_package_version || '2.0.0',
		environment: process.env.NODE_ENV || 'development',
		checks,
	});
});

/**
 * Endpoint de métricas básicas
 */
router.get('/health/metrics', (req, res) => {
	const memUsage = process.memoryUsage();

	res.status(200).json({
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		memory: {
			heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
			heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
			rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
		},
		pid: process.pid,
		nodeVersion: process.version,
	});
});

module.exports = router;
