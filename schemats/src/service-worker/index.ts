/**
 * Service worker for web push. SvelteKit bundles it to /service-worker.js; automatic
 * registration is off (vite.config.ts) and only #lib/helpers/webpush registers it, so
 * pages that never touch push (and Storybook, which uses MSW's static/mockServiceWorker.js)
 * don't get it. It does no caching or fetch handling.
 */
import { self } from '$app/service-worker';
import { indexcardsApiBaseUrl } from '#indexcards/runtime';

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

self.addEventListener('install', () => {
	// nothing to cache, so take over straight away instead of waiting for old tabs to close
	void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	const { title, body, url, tag } = readPayload(event);
	event.waitUntil(self.registration.showNotification(title || 'Tabroom', {
		body,
		tag,
		data: { url },
		icon: '/img/favicon.png',
	}));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data as { url?: string } | null;
	const target = new URL(data?.url || '/', self.location.origin).href;

	event.waitUntil((async () => {
		const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		const open = windows.find(client => client.url === target);
		if (open) {
			await open.focus();
			return;
		}
		await self.clients.openWindow(target);
	})());
});

// The push service replaced or expired the subscription: save the new one in place of the old
self.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil((async () => {
		const applicationServerKey = event.oldSubscription?.options.applicationServerKey;
		const subscription = event.newSubscription
			?? (applicationServerKey
				? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
				: null);
		if (!subscription) {
			return;
		}

		// The cookie and an Origin header go along, which the API's CSRF check needs
		const res = await fetch(`${indexcardsApiBaseUrl()}/user/notify/push`, {
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
