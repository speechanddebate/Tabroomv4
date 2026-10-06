import { defineConfig } from 'oxlint';

export default defineConfig({
	plugins: ["eslint","typescript","unicorn","oxc","import","vitest"],
	jsPlugins: [
		'eslint-plugin-storybook',
	],
	overrides: [
		{
			// oxlint does not recognize element binds
			files: ['**/*.svelte'],
			rules: {
				'eslint/no-unassigned-vars': 'off',
			},
		},
		{
			// Use the logger instead (api/helpers/logger.js)
			files: ['indexcards/**'],
			rules: {
				'eslint/no-console': 'error',
			},
		},
		{
			// The logger imports config, so config has to log on its own
			files: ['indexcards/api/config.ts'],
			rules: {
				'eslint/no-console': 'off',
			},
		},
		{
			// zod's default import emits .d.ts refs (z.z.*) that only resolve
			// under nodenext, so consumers on bundler resolution infer `unknown`
			files: ['types/**'],
			rules: {
				'eslint/no-restricted-imports': ['error', {
					paths: [{
						name: 'zod',
						importNames: ['default'],
						message: "Use `import { z } from 'zod'` so emitted types resolve in every consumer.",
					}],
				}],
			},
		},
	],
	rules: {
		'vitest/require-to-throw-message': 'off',
		'vitest/warn-todo': 'off',
		'vitest/require-mock-type-parameters': 'off',
		"typescript/no-explicit-any": "error",
		'eslint/no-unused-vars': [
			'error',
			{
				args: 'all',
				argsIgnorePattern: '^(err|req|res|next|opts|_.*)$',
				varsIgnorePattern: '^_.*$'
			},
		],
	},
});
