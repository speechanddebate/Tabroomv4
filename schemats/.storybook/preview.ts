/// <reference types="vite/client" />
import type { Preview } from '@storybook/sveltekit';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { configure } from 'storybook/test';
import '../src/app.css';
import QueryClientDecorator from '../src/storybook/decorators/QueryClientDecorator.svelte';
import { getIndexCardsAPIMock } from '../src/indexcards/index.msw';

const isApiRequest = (url: string): boolean => {
	return new URL(url).pathname.includes('/v1');
};

initialize({
	// vitest runs in test mode; MSW's per-request logs drown out the test output
	quiet: import.meta.env.MODE === 'test',
	onUnhandledRequest(request, print) {
		if (isApiRequest(request.url)) {
			print.warning();
		}
	},
});

configure({ asyncUtilTimeout: 10_000 });

const preview: Preview = {
	loaders: [mswLoader],
	decorators: [
		(Story, { parameters }) => ({
			Component: QueryClientDecorator,
			props: {
				session: parameters?.session ?? null,
			},
			slots: {
				default: Story,
			},
		}),
	],

	parameters: {
		msw: {
			handlers: getIndexCardsAPIMock(),
		},

		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},

		a11y: {
			test: 'error',
		},
	},
};

export default preview;