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
			reporter: ['text', 'json', 'html', 'lcov'],
			include: ['src/**/*.js'],
			exclude: ['src/views/**', 'src/server.js'],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 70,
				lines: 70,
			},
		},
		include: ['tests/**/*.test.js'],
		setupFiles: ['tests/setup.js'],
	},
});
