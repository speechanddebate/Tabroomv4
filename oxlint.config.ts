import { defineConfig } from 'oxlint';

export default defineConfig({
	plugins: ["eslint","typescript","unicorn","oxc","import","vitest"],
	rules: {
		'vitest/require-to-throw-message': 'off',
		'vitest/warn-todo': 'off',
		'vitest/require-mock-type-parameters': 'off',
		'eslint/no-unused-vars': [
			'error',
			{
				args: 'all',
				argsIgnorePattern: '^(err|req|res|next|opts|_.*)$',
			},
		],
	},
});
