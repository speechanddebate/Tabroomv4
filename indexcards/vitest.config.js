import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		// CI runners are 2 vCPU running 2 jobs at once, and MariaDB shares the job
		maxWorkers: process.env.CI ? 1 : undefined,
		// The API always runs in UTC (see the dev script and Dockerfile)
		env: { TZ: 'UTC' },
		setupFiles: './tests/setup.js',
		globalSetup: './tests/globalTestSetup.js',
		coverage: {
			include: ['api/**/*.{js,ts,tsx}'],
			exclude: ['**/data/models/**'],
			cleanOnRerun: false,
		},
	},
});
