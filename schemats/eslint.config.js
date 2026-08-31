import svelteConfig from './svelte.config.js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default defineConfig([
	svelte.configs.recommended,

	{
		ignores: [
			'**/*.stories.svelte',
			'static/mockServiceWorker.js',
			'build/',
			'.svelte-kit/'
		],
	},

	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},

	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		rules: {
			semi: 'warn',
			'svelte/no-at-html-tags'            : 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/sort-attributes': 'warn',
		},
		languageOptions: {
			parser: svelte.parser,
			parserOptions: {
				svelteConfig,
				parser: tseslint.parser,
			},
		},
	},
]);
