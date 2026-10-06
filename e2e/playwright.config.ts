import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	/* the default (half the cores) runs out of memory alongside the rest of the stack */
	workers: process.env.CI ? 1 : 3,
	/* the CI runner (2 vCPU, 4GB) is slow enough to trip the 30s/5s defaults */
	timeout: process.env.CI ? 90_000 : 30_000,
	expect: { timeout: process.env.CI ? 15_000 : 5_000 },
	/* never serve the report, it would block the container from exiting */
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: process.env.BASE_URL ?? 'https://e2e.tabroom.test',
		/* nginx serves a cert from a throwaway CA the browsers don't trust */
		ignoreHTTPSErrors: true,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},
	],
});
