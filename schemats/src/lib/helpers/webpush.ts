/**
 * Browser side of web push: service worker registration, the browser's PushManager
 * subscription, and the page-load sync with the API.
 *
 * Browser only. Every function touches `navigator`, `window` or `Notification`, so call them
 * from onMount or an event handler, never during server rendering.
 *
 * The client contract with the API:
 * - Page load (syncPush, run by the root layout once per login): if permission is granted, get or create the subscription without prompting and
 *   PUT it without `enable`. A 409 means push is turned off for this login: unsubscribe.
 *   A null endpoint from GET with a subscription present under another key is a key rotation:
 *   unsubscribe, subscribe with the new key, PUT.
 * - Subscribe: request permission, subscribe, PUT `{ subscription, enable: true }`.
 * - Turn off: DELETE, then unsubscribe.
 * - The service worker handles `pushsubscriptionchange` itself (src/service-worker.ts).
 */
import { userNotifyPush, userNotifyPushSubscribe, userNotifyPushUnsubscribe } from '$indexcards';
import type { PushSubscription as PushSubscriptionBody } from '$indexcards/schemas';

/** SvelteKit serves src/service-worker.ts here, in dev and in the build */
const SERVICE_WORKER_URL = '/service-worker.js';

/** Whether this browser has everything web push needs */
export const isPushSupported = (): boolean => {
	return typeof navigator !== 'undefined'
		&& 'serviceWorker' in navigator
		&& typeof window !== 'undefined'
		&& 'PushManager' in window
		&& 'Notification' in window;
};

/**
 * Decodes a base64url VAPID public key (unpadded, as the API returns it) into the bytes
 * PushManager.subscribe expects as applicationServerKey
 */
export const urlBase64ToUint8Array = (key: string): Uint8Array<ArrayBuffer> => {
	const padding = '='.repeat((4 - (key.length % 4)) % 4);
	const base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
};

/** Whether two keys hold the same bytes */
const sameBytes = (a: ArrayBuffer | ArrayBufferView | null | undefined, b: Uint8Array): boolean => {
	if (!a) {
		return false;
	}
	const left = a instanceof ArrayBuffer
		? new Uint8Array(a)
		: new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
	return left.length === b.length && left.every((byte, i) => byte === b[i]);
};

/**
 * Registers the app's service worker (only this helper registers it; SvelteKit's automatic
 * registration is off in svelte.config.js) and waits until it is active. Registering again
 * is a no-op when it is already installed.
 */
export const getPushRegistration = async (): Promise<ServiceWorkerRegistration> => {
	// In dev SvelteKit serves the worker as an ES module; the build emits a classic script
	await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
		type: import.meta.env.DEV ? 'module' : 'classic',
	});
	return await navigator.serviceWorker.ready;
};

export type BrowserSubscription = {
	/** The subscription as the API expects it, from PushSubscription.toJSON() */
	json: PushSubscriptionBody;
	/** The live subscription, for unsubscribe() and its options */
	subscription: PushSubscription;
};

/** Converts a live subscription to the API body, or null if the browser left out the keys */
const toBrowserSubscription = (subscription: PushSubscription): BrowserSubscription | null => {
	const { endpoint, expirationTime, keys } = subscription.toJSON();
	if (!endpoint || !keys?.p256dh || !keys.auth) {
		return null;
	}
	return {
		json: {
			endpoint,
			expirationTime: expirationTime ?? null,
			keys: { p256dh: keys.p256dh, auth: keys.auth },
		},
		subscription,
	};
};

/** This browser's current push subscription, or null if it has none */
export const getBrowserSubscription = async (): Promise<BrowserSubscription | null> => {
	const registration = await getPushRegistration();
	const subscription = await registration.pushManager.getSubscription();
	return subscription ? toBrowserSubscription(subscription) : null;
};

/**
 * Subscribes this browser with the given VAPID public key, asking for notification permission
 * first if it hasn't been decided. A subscription made under a different key (a key rotation)
 * is dropped and replaced; one under the same key is reused. Returns null when permission is
 * not granted.
 */
export const subscribeBrowser = async (publicKey: string): Promise<BrowserSubscription | null> => {
	if (Notification.permission === 'default') {
		await Notification.requestPermission();
	}
	if (Notification.permission !== 'granted') {
		return null;
	}

	const applicationServerKey = urlBase64ToUint8Array(publicKey);
	const registration = await getPushRegistration();
	const existing = await registration.pushManager.getSubscription();

	if (existing) {
		if (sameBytes(existing.options.applicationServerKey, applicationServerKey)) {
			const current = toBrowserSubscription(existing);
			if (current) {
				return current;
			}
		}
		// subscribe() throws InvalidStateError for a new key while the old subscription exists
		await existing.unsubscribe();
	}

	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey,
	});
	return toBrowserSubscription(subscription);
};

/** Drops this browser's push subscription, if it has one. Returns whether there was one */
export const unsubscribeBrowser = async (): Promise<boolean> => {
	const registration = await getPushRegistration();
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		return false;
	}
	return await subscription.unsubscribe();
};

/**
 * What a sync did:
 * - subscribed: this browser's subscription is saved to this login
 * - off: push is turned off for this login, so the browser subscription was dropped
 * - no-permission: notifications aren't allowed in this browser, so nothing was done
 * - reset: notifications were reset in this browser after it subscribed, so the stale
 *   subscription was removed from this login
 * - unavailable: the API couldn't take the subscription (push unconfigured, su'd, or an error)
 * - unsupported: this browser can't do web push
 */
export type SyncResult = 'subscribed' | 'off' | 'no-permission' | 'reset' | 'unavailable' | 'unsupported';

/** The API calls syncPush makes, so tests can swap them out */
export type PushClient = {
	getStatus: typeof userNotifyPush;
	save: typeof userNotifyPushSubscribe;
	remove: typeof userNotifyPushUnsubscribe;
};

const defaultClient: PushClient = { getStatus: userNotifyPush, save: userNotifyPushSubscribe, remove: userNotifyPushUnsubscribe };

/**
 * The page-load sync from the client contract. Never prompts for permission: when it is
 * granted, makes sure this browser is subscribed under the server's current key and saves
 * the subscription to this login without turning push back on.
 */
export const syncPush = async (client: PushClient = defaultClient): Promise<SyncResult> => {
	if (!isPushSupported()) {
		return 'unsupported';
	}
	const status = await client.getStatus();
	if (status.status !== 200) {
		return 'unavailable';
	}

	// Resetting or revoking permission drops the browser subscription without telling the
	// server, so a login that still reads as subscribed here has a dead endpoint: remove it
	if (Notification.permission !== 'granted') {
		if (status.data.endpoint) {
			await client.remove();
			return 'reset';
		}
		return 'no-permission';
	}

	// Turned off for this login: the PUT would only get a 409, so drop the subscription now
	if (status.data.disabled) {
		await unsubscribeBrowser();
		return 'off';
	}

	// Reuses a subscription under the current key, or replaces one under an old key. A null
	// endpoint from the server with a browser subscription present lands here as a rotation
	const browser = await subscribeBrowser(status.data.publicKey);
	if (!browser) {
		return 'no-permission';
	}

	const saved = await client.save({ subscription: browser.json });
	if (saved.status === 200) {
		return 'subscribed';
	}
	if (saved.status === 409) {
		// turned off between the GET and the PUT
		await browser.subscription.unsubscribe();
		return 'off';
	}
	return 'unavailable';
};
