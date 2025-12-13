import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		testTimeout: 30000,
		hookTimeout: 30000,
		// Ejecutar tests de integración secuencialmente para evitar conflictos de DB
		fileParallelism: false,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.js'],
			exclude: ['src/views/**', 'src/server.js'],
			thresholds: {
				statements: 60,
				branches: 50,
				functions: 60,
				lines: 60,
			},
		},
		include: ['tests/**/*.test.js'],
		setupFiles: ['tests/setup.js'],
	},
});
