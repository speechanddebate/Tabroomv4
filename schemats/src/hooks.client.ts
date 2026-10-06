// src/hooks.client.ts

import type { ClientInit, HandleClientError } from '@sveltejs/kit';
import  {
	BROWSER_ID_COOKIE_NAME,
	COOKIE_DOMAIN,
} from '$app/env/public';
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

	ensureBrowserId();
};

/**
 *  Extract a cookie value by name from document.cookie.
 * @param name the name of the cookie to extract
 * @returns the cookie value, or undefined if the cookie is not found or malformed
 */
export const getCookieValue = (name: string): string | undefined => {
	if (typeof document !== 'undefined') {
		const cookie = document.cookie
		.split('; ')
		.find((row) => row.startsWith(`${name}=`));
		if (!cookie) {
			return undefined;
		}
		const value = cookie.split('=')[1];
		if (!value) {
			clientLogger.warn(`cookie "${name}" was malformed in document.cookie`);
			return undefined;
		}
		return decodeURIComponent(value);
	}
	clientLogger.warn(`document is undefined, cannot read cookie "${name}"`);
	return undefined;
};

// browsers cap cookie lifetimes at 400 days
const BROWSER_ID_MAX_AGE = 60 * 60 * 24 * 400;

/**
 * Identify this browser across visits, even when nobody is logged in.
 * The id lives in a cookie on COOKIE_DOMAIN so the browser sends it to indexcards on every request (and SSR forwards it),
 * and is mirrored into localStorage so the same id comes back if the cookie is cleared. RCT
 * @returns the browser id
 */
export const ensureBrowserId = (): string => {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(BROWSER_ID_COOKIE_NAME);
	} catch (error) {
		clientLogger.warn('could not read browser id from localStorage', { error });
	}

	const browserId = getCookieValue(BROWSER_ID_COOKIE_NAME) ?? stored ?? crypto.randomUUID();

	// always rewrite the cookie to push its expiry forward
	const domain = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : '';
	const secure = window.location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${BROWSER_ID_COOKIE_NAME}=${encodeURIComponent(browserId)}; Path=/; Max-Age=${BROWSER_ID_MAX_AGE}; SameSite=Lax${domain}${secure}`;

	if (stored !== browserId) {
		try {
			localStorage.setItem(BROWSER_ID_COOKIE_NAME, browserId);
		} catch (error) {
			clientLogger.warn('could not write browser id to localStorage', { error });
		}
	}

	return browserId;
};
