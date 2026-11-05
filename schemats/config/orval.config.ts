/// <reference types="node" />
import path from 'node:path';
import { defineConfig } from 'orval';

export default defineConfig({
	indexcards: {
		input: {
			target: `../../indexcards/api/routes/openapi/openapi.json`,
			filters: {
				tags: ['Orval'],
			},
		},
		output: {
			client: 'svelte-query',
			baseUrl: {
				runtime: 'indexcardsApiBaseUrl()',
				imports: [{ name: 'indexcardsApiBaseUrl', importPath: '$indexcards/runtime' }],
			},
			mock: true,
			mode: 'split',
			target: path.resolve(process.cwd(), 'src/indexcards/index.ts'),
			schemas: path.resolve(process.cwd(), 'src/indexcards/schemas'),
			override: {
				query: {
					useInfinite: true,
					usePrefetch: true,
					useInfiniteQueryParam: 'offset',
				},
				fetch: {
					useRuntimeFetcher: true,
				},
				requestOptions: {
					credentials: 'include',
				},
			},
		},
		hooks: {
			afterAllFilesWrite: 'prettier --write --config ./config/prettier.config.ts',
		},
	},
});