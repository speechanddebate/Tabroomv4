import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-node';

/// <reference types="vitest/config" />
/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import {svelteTesting} from '@testing-library/svelte/vite';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile();

export default defineConfig( () => {

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				// Consult https://svelte.dev/docs/kit/integrations
				// for more information about preprocessors
				preprocess: [vitePreprocess()],
				compilerOptions: { experimental: { async: true } },
				adapter: adapter(),
				// src/service-worker is only for web push, so only #lib/helpers/webpush registers it
				serviceWorker: { register: false },
				// exposed as `version` from $app/env. Falls back to kit's default (build timestamp) outside CI
				version: { name: process.env.GIT_COMMIT || undefined }
			}),
			svelteTesting()
		],
		build: { target: 'es2022' },
		server: {
			host         : process.env.VITE_HOST ?? 'localhost',
			port         : process.env.VITE_PORT ? Number(process.env.VITE_PORT) : 9000,
			allowedHosts : [
				process.env.WEB_URL ?? 'localhost',
			],
			strictPort   : true,
			fs: {
				allow: ['.', './config'],
			},
			hmr: {
				clientPort : process.env.VITE_CLIENT_PORT ? Number(process.env.VITE_CLIENT_PORT) : undefined,
			},
			proxy: {
				'/v1': {
					target: process.env.INDEXCARDS_HOST,
					changeOrigin: true,
				},
			},
		},
		preview: {
			host       : process.env.VITE_HOST ?? 'localhost',
			port       : process.env.VITE_PREVIEW_PORT ? Number(process.env.VITE_PREVIEW_PORT) : 9000,
			strictPort : true,
			open       : false,
		},
	};
});
