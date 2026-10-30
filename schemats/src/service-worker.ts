/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Service worker for web push. SvelteKit bundles it to /service-worker.js; automatic
 * registration is off (svelte.config.js) and only $lib/helpers/webpush registers it, so
 * pages that never touch push (and Storybook, which uses MSW's static/mockServiceWorker.js)
 * don't get it. It does no caching or fetch handling.
 *
 * Service workers can only import $app/env/public (and $env/static/public) from SvelteKit.
 */
import { INDEXCARDS_BASE_PATH, INDEXCARDS_HOST } from '$app/env/public';

// The DOM lib types `self` as Window in the shared tsconfig, so re-type it here
const sw = self as unknown as ServiceWorkerGlobalScope;

// Same value as indexcardsApiBaseUrl() in $indexcards/runtime, which a worker can't import
const API_BASE = `${INDEXCARDS_HOST}${INDEXCARDS_BASE_PATH}`;

type PushPayload = { title?: string; body?: string; url?: string; tag?: string };

/** The message from a push, as JSON `{ title, body, url, tag }`, or plain text as the body */
const readPayload = (event: PushEvent): PushPayload => {
	if (!event.data) {
		return {};
	}
	try {
		const parsed: unknown = event.data.json();
		return parsed && typeof parsed === 'object' ? (parsed as PushPayload) : { body: String(parsed) };
	} catch {
		return { body: event.data.text() };
	}
};

sw.addEventListener('install', () => {
	// nothing to cache, so take over straight away instead of waiting for old tabs to close
	void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (event) => {
	const { title, body, url, tag } = readPayload(event);
	event.waitUntil(sw.registration.showNotification(title || 'Tabroom', {
		body,
		tag,
		data: { url },
		icon: '/img/favicon.png',
	}));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data as { url?: string } | null;
	const target = new URL(data?.url || '/', sw.location.origin).href;

	event.waitUntil((async () => {
		const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
		const open = windows.find(client => client.url === target);
		if (open) {
			await open.focus();
			return;
		}
		await sw.clients.openWindow(target);
	})());
});

// The push service replaced or expired the subscription: save the new one in place of the old
sw.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil((async () => {
		const applicationServerKey = event.oldSubscription?.options.applicationServerKey;
		const subscription = event.newSubscription
			?? (applicationServerKey
				? await sw.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
				: null);
		if (!subscription) {
			return;
		}

		// The cookie and an Origin header go along, which the API's CSRF check needs
		const res = await fetch(`${API_BASE}/user/notify/push`, {
			method: 'PUT',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				subscription: subscription.toJSON(),
				replaces: event.oldSubscription?.endpoint,
			}),
		});

		// push was turned off for this login since the browser subscribed
		if (res.status === 409) {
			await subscription.unsubscribe();
		}
	})());
});
