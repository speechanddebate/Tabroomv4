// src/hooks.client.ts
import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { clientLogger } from '#lib/helpers/logging/logging.ts';

export const handleError: HandleClientError = ({ kind, error, event }) => {
	// log the error to our server log endpoint RCT
	if (kind !== 'app') {
		clientLogger.error('Unhandled client error', {
			error,
			kind,
			status: kind === 'framework' ? error.status : 500,
			path: event?.url.pathname ?? null,
			source: 'handleError',
		});
	}
	return { errorId: 'client-error' };
};

export const init: ClientInit = async () => {
	// log unhandled errors and rejections to our server log endpoint RCT
	window.addEventListener('error', (ev: ErrorEvent) => {
		const message = ev.message ?? 'Unhandled error';
		clientLogger.error(message, {
			error: ev.error ?? ev,
			kind: 'error',
			path: window.location.pathname,
			source: 'window.error',
		});
	});

	window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
		const message = ev.reason instanceof Error ? ev.reason.message
			: typeof ev.reason === 'string' ? ev.reason
			: 'Unhandled promise rejection';
		clientLogger.error(message, {
			error: ev.reason,
			kind: 'unhandledrejection',
			path: window.location.pathname,
			source: 'window.unhandledrejection',
		});
	});
};
