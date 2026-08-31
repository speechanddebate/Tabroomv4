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
			},
		],
	},
});
