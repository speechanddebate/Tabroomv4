import { dirname } from "node:path";
import type { StorybookConfig } from '@storybook/sveltekit';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
    'stories': [
		'../src/**/*.mdx',
		'../src/**/*.stories.@(js|ts|svelte)',
	],

    'addons': [
		getAbsolutePath("@storybook/addon-svelte-csf"),
		getAbsolutePath("@storybook/addon-vitest"),
		getAbsolutePath("@storybook/addon-a11y"),
		getAbsolutePath("@storybook/addon-docs"),
	],

    staticDirs: ['../static'],
    'framework': getAbsolutePath("@storybook/sveltekit"),

    env: (existing) => ({
		...existing,
	}),

    async viteFinal(og) {
		return mergeConfig(og, {
			plugins: [
				// SvelteKit's `$app` alias wins over any `$app/env/public` alias we add, and
				// the virtual module it resolves to reads `globalThis.__sveltekit_dev.env`,
				// which only the SvelteKit runtime sets up. Swap in the mock first.
				{
					name: 'storybook-mock-sveltekit-env-public',
					enforce: 'pre',
					resolveId(id: string) {
						if (id === '__sveltekit/env/public/client') {
							return fileURLToPath(new URL('../src/storybook/mocks/env-public.ts', import.meta.url));
						}
					},
				},
			],
		});
	},

    features: {
        experimentalReview: true
    }
};
export default config;

// added by storybook, why?  whos to say
function getAbsolutePath(value: string): string {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
