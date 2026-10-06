// src/hooks.client.ts
import type { ClientInit, HandleClientError } from '@sveltejs/kit';
import { clientLogger } from '$lib/helpers/logging/logging';

export const handleError: HandleClientError = ({ error, event, status, message }): App.Error => {
	// log the error to our server log endpoint RCT
	clientLogger.error(message, {
		error,
		status,
		path: event?.url.pathname ?? null,
		source: 'handleError',
	});
	return {
		message,
		errorId: 'client-error',
	};
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
