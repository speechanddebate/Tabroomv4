import { flushSync } from 'svelte';
import { createPushState } from './pushState.svelte';
import type { PushStatus } from '$indexcards/schemas';

const mocks = vi.hoisted(() => ({
	pushResponse: { status: 200, data: {} as unknown } as { status: number; data: unknown },
	su: false,
	invalidateQueries: vi.fn(),
	subscribeMutateAsync: vi.fn(),
	unsubscribeMutateAsync: vi.fn(),
	toastError: vi.fn(),
	webpush: {
		isPushSupported: vi.fn(),
		subscribeBrowser: vi.fn(),
		unsubscribeBrowser: vi.fn(),
	},
}));

vi.mock('@tanstack/svelte-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/svelte-query')>(
		'@tanstack/svelte-query',
	);
	return {
		...actual,
		useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
	};
});

vi.mock('$indexcards', () => ({
	createUserNotifyPush: () => ({
		get data() { return mocks.pushResponse; },
		error: null,
		isError: false,
		isSuccess: true,
		isPending: false,
		isLoading: false,
		isFetching: false,
	}),
	createUserNotifyPushSubscribe: () => ({ mutateAsync: mocks.subscribeMutateAsync, isPending: false }),
	createUserNotifyPushUnsubscribe: () => ({ mutateAsync: mocks.unsubscribeMutateAsync, isPending: false }),
	getUserNotifyPushQueryKey: () => ['userNotifyPush'],
	getUserSessionsQueryKey: () => ['userSessions'],
}));

vi.mock('$lib/helpers/SessionContext.svelte', () => ({
	isSuSession: () => mocks.su,
}));

vi.mock('$lib/helpers/toasts', () => ({
	toast: { error: mocks.toastError },
}));

vi.mock('$lib/helpers/webpush', () => mocks.webpush);

const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

const setStatus = (overrides: Partial<PushStatus> = {}) => {
	mocks.pushResponse = {
		status: 200,
		data: { publicKey: 'BPublicKey', endpoint: null, disabled: false, ...overrides },
	};
};

const browserSubscription = {
	json: { endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } },
	subscription: {},
};

const notification = { permission: 'default' as NotificationPermission };

/** Creates the state inside an effect root, as a component would, and reads the permission */
const setup = () => {
	let push!: ReturnType<typeof createPushState>;
	const cleanup = $effect.root(() => {
		push = createPushState();
	});
	push.readPermission();
	flushSync();
	return { push, cleanup };
};

describe('createPushState', () => {
	beforeEach(() => {
		mocks.su = false;
		notification.permission = 'default';
		setStatus();
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.subscribeMutateAsync.mockResolvedValue({ status: 200, data: {} });
		mocks.unsubscribeMutateAsync.mockResolvedValue({ status: 204, data: {} });
		mocks.webpush.isPushSupported.mockReturnValue(true);
		mocks.webpush.subscribeBrowser.mockResolvedValue(browserSubscription);
		mocks.webpush.unsubscribeBrowser.mockResolvedValue(true);
		vi.stubGlobal('Notification', notification);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	describe('state', () => {
		it('is null until the permission is read', () => {
			let push!: ReturnType<typeof createPushState>;
			const cleanup = $effect.root(() => {
				push = createPushState();
			});
			expect(push.state).toBeNull();
			cleanup();
		});

		it('is undecided when permission has not been asked and push is not set up', () => {
			const { push, cleanup } = setup();
			expect(push.state).toBe('undecided');
			cleanup();
		});

		it('is unsupported when the browser cannot do web push', () => {
			mocks.webpush.isPushSupported.mockReturnValue(false);
			const { push, cleanup } = setup();
			expect(push.state).toBe('unsupported');
			cleanup();
		});

		it('is su for an su\'d session', () => {
			mocks.su = true;
			const { push, cleanup } = setup();
			expect(push.state).toBe('su');
			cleanup();
		});

		it('is unavailable when the server has no push configured', () => {
			mocks.pushResponse = { status: 503, data: { title: 'Service Unavailable', status: 503 } };
			const { push, cleanup } = setup();
			expect(push.state).toBe('unavailable');
			cleanup();
		});

		it('is denied when notifications are blocked', () => {
			notification.permission = 'denied';
			const { push, cleanup } = setup();
			expect(push.state).toBe('denied');
			cleanup();
		});

		it('is off when push was turned off for this login', () => {
			notification.permission = 'granted';
			setStatus({ disabled: true });
			const { push, cleanup } = setup();
			expect(push.state).toBe('off');
			cleanup();
		});

		it('is on when permission is granted and the login has a subscription', () => {
			notification.permission = 'granted';
			setStatus({ endpoint });
			const { push, cleanup } = setup();
			expect(push.state).toBe('on');
			cleanup();
		});

		it('is undecided when the login lists a subscription the browser no longer allows', () => {
			setStatus({ endpoint });
			const { push, cleanup } = setup();
			expect(push.state).toBe('undecided');
			cleanup();
		});
	});

	describe('enable', () => {
		it('subscribes the browser, saves it with enable, and refreshes the queries', async () => {
			const { push, cleanup } = setup();

			await expect(push.enable()).resolves.toBe(true);

			expect(mocks.webpush.subscribeBrowser).toHaveBeenCalledWith('BPublicKey');
			expect(mocks.subscribeMutateAsync).toHaveBeenCalledWith({
				data: { subscription: browserSubscription.json, enable: true },
			});
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['userNotifyPush'] });
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['userSessions'] });
			cleanup();
		});

		it('stops when permission is not granted, and rereads the permission', async () => {
			mocks.webpush.subscribeBrowser.mockImplementation(async () => {
				notification.permission = 'denied';
				return null;
			});
			const { push, cleanup } = setup();

			await expect(push.enable()).resolves.toBe(false);

			expect(mocks.subscribeMutateAsync).not.toHaveBeenCalled();
			expect(push.state).toBe('denied');
			cleanup();
		});

		it('turns a browser error into a toast', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			mocks.webpush.subscribeBrowser.mockRejectedValue(new Error('push service down'));
			const { push, cleanup } = setup();

			await expect(push.enable()).resolves.toBe(false);

			expect(mocks.toastError).toHaveBeenCalledWith({
				message: 'Turning on notifications failed',
				detail: 'push service down',
			});
			expect(push.busy).toBe(false);
			cleanup();
		});
	});

	describe('turnOff', () => {
		it('turns push off for the login, then drops the browser subscription', async () => {
			notification.permission = 'granted';
			setStatus({ endpoint });
			const { push, cleanup } = setup();

			await expect(push.turnOff()).resolves.toBe(true);

			expect(mocks.unsubscribeMutateAsync).toHaveBeenCalled();
			expect(mocks.webpush.unsubscribeBrowser).toHaveBeenCalled();
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['userNotifyPush'] });
			cleanup();
		});

		it('keeps the browser subscription when the server refuses', async () => {
			mocks.unsubscribeMutateAsync.mockResolvedValue({
				status: 403,
				data: { title: 'Forbidden', status: 403 },
			});
			const { push, cleanup } = setup();

			await expect(push.turnOff()).resolves.toBe(false);

			expect(mocks.webpush.unsubscribeBrowser).not.toHaveBeenCalled();
			cleanup();
		});
	});
});
