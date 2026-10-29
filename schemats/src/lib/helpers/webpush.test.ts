import {
	getBrowserSubscription,
	getPushRegistration,
	isPushSupported,
	subscribeBrowser,
	syncPush,
	unsubscribeBrowser,
	urlBase64ToUint8Array,
} from './webpush';
import type { PushClient } from './webpush';

// The real client imports the API base URL from $app/env/public; syncPush gets fakes instead
vi.mock('$indexcards', () => ({
	userPush: vi.fn(),
	userPushSubscribe: vi.fn(),
	userPushUnsubscribe: vi.fn(),
}));

// 65 bytes, like a real uncompressed P-256 VAPID public key
const keyBytes = (fill: number) => {
	const bytes = new Uint8Array(65).fill(fill);
	bytes[0] = 0x04;
	return bytes;
};
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
	.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const currentKey = keyBytes(1);
const oldKey = keyBytes(2);
const publicKey = toBase64Url(currentKey);

const subscriptionJson = (endpoint: string) => ({
	endpoint,
	expirationTime: null,
	keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
});

/** A fake PushSubscription made under the given key */
const fakeSubscription = (endpoint: string, key: Uint8Array) => ({
	endpoint,
	options: { applicationServerKey: key.buffer.slice(0), userVisibleOnly: true },
	toJSON: () => subscriptionJson(endpoint),
	unsubscribe: vi.fn().mockResolvedValue(true),
});
type FakeSubscription = ReturnType<typeof fakeSubscription>;

const pushManager = {
	getSubscription: vi.fn<() => Promise<FakeSubscription | null>>(),
	subscribe: vi.fn<(options: PushSubscriptionOptionsInit) => Promise<FakeSubscription>>(),
};
const registration = { pushManager };
const serviceWorker = {
	register: vi.fn().mockResolvedValue(registration),
	ready: Promise.resolve(registration),
};

const notification = {
	permission: 'default' as NotificationPermission,
	requestPermission: vi.fn(),
};

/** Fake API client for syncPush, answering GET with the given status */
const fakeClient = (
	status: { status: number; data: unknown },
	save: { status: number; data: unknown } = { status: 200, data: {} },
) => ({
	getStatus: vi.fn().mockResolvedValue(status),
	save: vi.fn().mockResolvedValue(save),
	remove: vi.fn().mockResolvedValue({ status: 204, data: {} }),
});
const asClient = (client: ReturnType<typeof fakeClient>) => client as unknown as PushClient;

const pushStatus = (overrides: Record<string, unknown> = {}) => ({
	status: 200,
	data: { publicKey, endpoint: null, disabled: false, ...overrides },
});

describe('webpush helper', () => {
	beforeEach(() => {
		notification.permission = 'default';
		notification.requestPermission.mockImplementation(async () => {
			notification.permission = 'granted';
			return 'granted';
		});
		pushManager.getSubscription.mockResolvedValue(null);
		pushManager.subscribe.mockImplementation(async ({ applicationServerKey }) =>
			fakeSubscription('https://fcm.googleapis.com/fcm/send/new', applicationServerKey as Uint8Array));
		vi.stubGlobal('Notification', notification);
		vi.stubGlobal('PushManager', function PushManager() {});
		Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		Reflect.deleteProperty(navigator, 'serviceWorker');
	});

	describe('isPushSupported', () => {
		it('is true with a service worker, PushManager and Notification', () => {
			expect(isPushSupported()).toBe(true);
		});

		it('is false without a service worker', () => {
			Reflect.deleteProperty(navigator, 'serviceWorker');
			expect(isPushSupported()).toBe(false);
		});

		it('is false without PushManager or Notification', () => {
			vi.unstubAllGlobals();
			expect(isPushSupported()).toBe(false);
		});
	});

	describe('urlBase64ToUint8Array', () => {
		it('decodes unpadded base64url, including - and _', () => {
			expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
			expect(Array.from(urlBase64ToUint8Array(publicKey))).toEqual(Array.from(currentKey));
		});
	});

	describe('getPushRegistration', () => {
		it('registers /service-worker.js and waits for it to be ready', async () => {
			await expect(getPushRegistration()).resolves.toBe(registration);
			expect(serviceWorker.register).toHaveBeenCalledWith('/service-worker.js', expect.objectContaining({ type: expect.any(String) }));
		});
	});

	describe('getBrowserSubscription', () => {
		it('returns null without a subscription', async () => {
			await expect(getBrowserSubscription()).resolves.toBeNull();
		});

		it('returns the toJSON body and the live subscription', async () => {
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', currentKey);
			pushManager.getSubscription.mockResolvedValue(existing);

			const result = await getBrowserSubscription();
			expect(result?.json).toEqual(subscriptionJson('https://fcm.googleapis.com/fcm/send/abc'));
			expect(result?.subscription).toBe(existing);
		});
	});

	describe('subscribeBrowser', () => {
		it('asks for permission, then subscribes with the key', async () => {
			const result = await subscribeBrowser(publicKey);

			expect(notification.requestPermission).toHaveBeenCalledTimes(1);
			expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: currentKey });
			expect(result?.json.endpoint).toBe('https://fcm.googleapis.com/fcm/send/new');
		});

		it('returns null and does not subscribe when permission is denied', async () => {
			notification.requestPermission.mockImplementation(async () => {
				notification.permission = 'denied';
				return 'denied';
			});

			await expect(subscribeBrowser(publicKey)).resolves.toBeNull();
			expect(pushManager.subscribe).not.toHaveBeenCalled();
		});

		it('reuses a subscription under the same key', async () => {
			notification.permission = 'granted';
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/same', currentKey);
			pushManager.getSubscription.mockResolvedValue(existing);

			const result = await subscribeBrowser(publicKey);
			expect(notification.requestPermission).not.toHaveBeenCalled();
			expect(existing.unsubscribe).not.toHaveBeenCalled();
			expect(pushManager.subscribe).not.toHaveBeenCalled();
			expect(result?.subscription).toBe(existing);
		});

		it('replaces a subscription under a different key', async () => {
			notification.permission = 'granted';
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', oldKey);
			pushManager.getSubscription.mockResolvedValue(existing);

			const result = await subscribeBrowser(publicKey);
			expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
			expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
			expect(result?.json.endpoint).toBe('https://fcm.googleapis.com/fcm/send/new');
		});
	});

	describe('unsubscribeBrowser', () => {
		it('unsubscribes the current subscription', async () => {
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', currentKey);
			pushManager.getSubscription.mockResolvedValue(existing);

			await expect(unsubscribeBrowser()).resolves.toBe(true);
			expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
		});

		it('returns false without a subscription', async () => {
			await expect(unsubscribeBrowser()).resolves.toBe(false);
		});
	});

	describe('syncPush', () => {
		it('returns unsupported without browser support', async () => {
			Reflect.deleteProperty(navigator, 'serviceWorker');
			const client = fakeClient(pushStatus());
			await expect(syncPush(asClient(client))).resolves.toBe('unsupported');
			expect(client.getStatus).not.toHaveBeenCalled();
		});

		it('never prompts and saves nothing without permission', async () => {
			const client = fakeClient(pushStatus());
			await expect(syncPush(asClient(client))).resolves.toBe('no-permission');
			expect(notification.requestPermission).not.toHaveBeenCalled();
			expect(client.save).not.toHaveBeenCalled();
			expect(client.remove).not.toHaveBeenCalled();
		});

		it('removes the stale subscription when permission was reset after subscribing', async () => {
			const client = fakeClient(pushStatus({ endpoint: 'https://fcm.googleapis.com/fcm/send/stale' }));
			await expect(syncPush(asClient(client))).resolves.toBe('reset');
			expect(client.remove).toHaveBeenCalledTimes(1);
			expect(client.save).not.toHaveBeenCalled();
			expect(notification.requestPermission).not.toHaveBeenCalled();
		});

		it('returns unavailable when the status request fails', async () => {
			notification.permission = 'granted';
			const client = fakeClient({ status: 503, data: {} });
			await expect(syncPush(asClient(client))).resolves.toBe('unavailable');
			expect(pushManager.subscribe).not.toHaveBeenCalled();
		});

		it('subscribes and saves without enable', async () => {
			notification.permission = 'granted';
			const client = fakeClient(pushStatus());

			await expect(syncPush(asClient(client))).resolves.toBe('subscribed');
			expect(client.save).toHaveBeenCalledWith({
				subscription: subscriptionJson('https://fcm.googleapis.com/fcm/send/new'),
			});
		});

		it('re-saves an existing subscription under the current key', async () => {
			notification.permission = 'granted';
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/same', currentKey);
			pushManager.getSubscription.mockResolvedValue(existing);
			const client = fakeClient(pushStatus({ endpoint: existing.endpoint }));

			await expect(syncPush(asClient(client))).resolves.toBe('subscribed');
			expect(pushManager.subscribe).not.toHaveBeenCalled();
			expect(client.save).toHaveBeenCalledWith({ subscription: subscriptionJson(existing.endpoint) });
		});

		it('rotates a subscription made under an old key', async () => {
			notification.permission = 'granted';
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', oldKey);
			pushManager.getSubscription.mockResolvedValue(existing);
			const client = fakeClient(pushStatus({ endpoint: null }));

			await expect(syncPush(asClient(client))).resolves.toBe('subscribed');
			expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
			expect(client.save).toHaveBeenCalledWith({
				subscription: subscriptionJson('https://fcm.googleapis.com/fcm/send/new'),
			});
		});

		it('drops the browser subscription when the login is turned off', async () => {
			notification.permission = 'granted';
			const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', currentKey);
			pushManager.getSubscription.mockResolvedValue(existing);
			const client = fakeClient(pushStatus({ disabled: true }));

			await expect(syncPush(asClient(client))).resolves.toBe('off');
			expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
			expect(client.save).not.toHaveBeenCalled();
		});

		it('unsubscribes on a 409 from the save', async () => {
			notification.permission = 'granted';
			const client = fakeClient(pushStatus(), { status: 409, data: {} });

			await expect(syncPush(asClient(client))).resolves.toBe('off');
			const created = await pushManager.subscribe.mock.results[0]!.value as FakeSubscription;
			expect(created.unsubscribe).toHaveBeenCalledTimes(1);
		});

		it('returns unavailable when the save is refused', async () => {
			notification.permission = 'granted';
			const client = fakeClient(pushStatus(), { status: 403, data: {} });
			await expect(syncPush(asClient(client))).resolves.toBe('unavailable');
		});
	});
});
