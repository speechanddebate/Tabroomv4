import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: [vitePreprocess()],
	kit: {
		adapter: adapter(),
		alias: {
			$lib: 'src/lib',
			$indexcards: 'src/indexcards',
		},
		experimental: {
			explicitEnvironmentVariables: true,
			instrumentation: {
				server: true,
			},
		},
		// exposed as `version` from $app/env. Falls back to kit's default (build timestamp) outside CI
		version: {
			name: process.env.GIT_COMMIT || undefined,
		},
	},

	compilerOptions: {
		experimental: {
			async: true,
		},
	},
};

export default config;
