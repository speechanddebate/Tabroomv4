import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import PushPage from './+page.svelte';
import type { PushStatus, UserSession } from '$indexcards/schemas';

const mocks = vi.hoisted(() => ({
	pushResponse: { status: 200, data: {} as unknown } as { status: number; data: unknown },
	sessionsResponse: { status: 200, data: [] as unknown } as { status: number; data: unknown },
	su: false,
	invalidateQueries: vi.fn(),
	subscribeMutateAsync: vi.fn(),
	unsubscribeMutateAsync: vi.fn(),
	unsubscribeSessionMutateAsync: vi.fn(),
	webpush: {
		isPushSupported: vi.fn(),
		getBrowserSubscription: vi.fn(),
		subscribeBrowser: vi.fn(),
		unsubscribeBrowser: vi.fn(),
		syncPush: vi.fn(),
	},
}));

vi.mock('@tanstack/svelte-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/svelte-query')>(
		'@tanstack/svelte-query',
	);

	return {
		...actual,
		useQueryClient: () => ({
			invalidateQueries: mocks.invalidateQueries,
		}),
	};
});

const query = (data: unknown) => ({
	data,
	error: null,
	isError: false,
	isSuccess: true,
	isPending: false,
	isLoading: false,
	isFetching: false,
});

vi.mock('$indexcards', () => ({
	createUserPush: () => query(mocks.pushResponse),
	createUserSessions: () => query(mocks.sessionsResponse),
	createUserPushSubscribe: () => ({
		mutateAsync: mocks.subscribeMutateAsync,
		isPending: false,
	}),
	createUserPushUnsubscribe: () => ({
		mutateAsync: mocks.unsubscribeMutateAsync,
		isPending: false,
	}),
	createUserPushUnsubscribeSession: () => ({
		mutateAsync: mocks.unsubscribeSessionMutateAsync,
		isPending: false,
	}),
	getUserPushQueryKey: () => ['userPush'],
	getUserSessionsQueryKey: () => ['userSessions'],
}));

vi.mock('$lib/helpers/SessionContext.svelte', () => ({
	isSuSession: () => mocks.su,
	getPerson: () => ({ tz: 'America/Chicago' }),
}));

vi.mock('$lib/helpers/webpush', () => mocks.webpush);

const setStatus = (status: PushStatus) => {
	mocks.pushResponse = { status: 200, data: status };
};

const setSessions = (sessions: UserSession[]) => {
	mocks.sessionsResponse = { status: 200, data: sessions };
};

const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

const subscribed: PushStatus = {
	publicKey: 'BPublicKey',
	endpoint,
	disabled: false,
};

const browserSubscription = (url = endpoint) => ({
	json: { endpoint: url, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } },
	subscription: {},
});

const session = (overrides: Partial<UserSession>): UserSession => ({
	id: 1,
	current: false,
	subscribed: false,
	disabled: false,
	host: null,
	agent: 'Mozilla/5.0 Chrome',
	ip: '10.0.0.1',
	last_access: '2026-10-29T14:00:00.000Z',
	created_at: '2026-10-01T14:00:00.000Z',
	...overrides,
});

describe('Push notifications page', () => {
	beforeEach(() => {
		mocks.su = false;
		setSessions([]);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.subscribeMutateAsync.mockResolvedValue({ status: 200, data: subscribed });
		mocks.unsubscribeMutateAsync.mockResolvedValue({ status: 204, data: {} });
		mocks.unsubscribeSessionMutateAsync.mockResolvedValue({ status: 204, data: {} });
		mocks.webpush.isPushSupported.mockReturnValue(true);
		mocks.webpush.getBrowserSubscription.mockResolvedValue(null);
		mocks.webpush.subscribeBrowser.mockResolvedValue(browserSubscription());
		mocks.webpush.unsubscribeBrowser.mockResolvedValue(true);
		mocks.webpush.syncPush.mockResolvedValue('subscribed');
		vi.stubGlobal('Notification', { permission: 'default' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('labels the page as a developer tool', () => {
		setStatus(subscribed);
		render(PushPage);

		expect(screen.getByRole('note')).toHaveTextContent('Developer tool');
	});

	it('shows the push host and a Turn off button when subscribed', async () => {
		setStatus(subscribed);
		vi.stubGlobal('Notification', { permission: 'granted' });
		render(PushPage);

		expect(screen.getByTestId('push-status')).toHaveTextContent('Subscribed through fcm.googleapis.com');
		expect(screen.getByTestId('push-status')).not.toHaveTextContent('abc123');
		// enabled once the page-load sync finishes
		await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off' })).toBeEnabled());
		expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
	});

	it('offers Subscribe with a note instead of Turn off when the browser permission was reset', async () => {
		setStatus(subscribed);
		vi.stubGlobal('Notification', { permission: 'default' });
		render(PushPage);

		await waitFor(() => expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled());
		expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
		expect(screen.getByTestId('push-reset')).toHaveTextContent('Subscribe again');
	});

	it('shows the turned off state and a Subscribe button', async () => {
		setStatus({ ...subscribed, endpoint: null, disabled: true });
		render(PushPage);

		expect(screen.getByTestId('push-status')).toHaveTextContent('Turned off');
		await waitFor(() => expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled());
		expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
	});

	it('shows the not set up state', () => {
		setStatus({ ...subscribed, endpoint: null });
		render(PushPage);

		expect(screen.getByTestId('push-status')).toHaveTextContent('Not set up');
		expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument();
	});

	it('shows the unavailable state and no buttons or logins on 503', () => {
		mocks.pushResponse = {
			status: 503,
			data: { type: 'about:blank', title: 'Service Unavailable', status: 503 },
		};
		render(PushPage);

		expect(screen.getByText('Push notifications are not available right now.')).toBeInTheDocument();
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.queryByTestId('push-sessions')).toBeNull();
	});

	it('syncs on load and shows the result', async () => {
		setStatus(subscribed);
		render(PushPage);

		await waitFor(() => {
			expect(screen.getByTestId('push-sync')).toHaveTextContent('saved to this login');
		});
		expect(mocks.webpush.syncPush).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['userPush'] });
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['userSessions'] });
	});

	it('shows when the sync found push turned off', async () => {
		mocks.webpush.syncPush.mockResolvedValue('off');
		setStatus({ ...subscribed, endpoint: null, disabled: true });
		render(PushPage);

		await waitFor(() => {
			expect(screen.getByTestId('push-sync')).toHaveTextContent('turned off for this login');
		});
	});

	it('syncs again from the Sync now button', async () => {
		setStatus(subscribed);
		render(PushPage);
		await waitFor(() => expect(mocks.webpush.syncPush).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled());

		await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));

		await waitFor(() => expect(mocks.webpush.syncPush).toHaveBeenCalledTimes(2));
	});

	it('disables the buttons, skips the sync and explains why while su\'d', async () => {
		mocks.su = true;
		setStatus(subscribed);
		vi.stubGlobal('Notification', { permission: 'granted' });
		const { unmount } = render(PushPage);

		expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
		expect(screen.getByText('Push notifications can\'t be changed while su\'d.')).toBeInTheDocument();
		expect(screen.getByTestId('push-sync')).toHaveTextContent('Skipped while su\'d');
		await waitFor(() => expect(mocks.webpush.getBrowserSubscription).toHaveBeenCalled());
		expect(mocks.webpush.syncPush).not.toHaveBeenCalled();
		unmount();

		setStatus({ ...subscribed, endpoint: null });
		render(PushPage);
		expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
	});

	it('subscribes this browser and saves it with enable', async () => {
		setStatus({ ...subscribed, endpoint: null, disabled: true });
		render(PushPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled());

		await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

		await waitFor(() => {
			expect(mocks.webpush.subscribeBrowser).toHaveBeenCalledWith('BPublicKey');
			expect(mocks.subscribeMutateAsync).toHaveBeenCalledWith({
				data: { subscription: browserSubscription().json, enable: true },
			});
		});
	});

	it('saves nothing when the browser does not grant permission', async () => {
		mocks.webpush.subscribeBrowser.mockResolvedValue(null);
		setStatus({ ...subscribed, endpoint: null });
		render(PushPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled());

		await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

		await waitFor(() => expect(mocks.webpush.subscribeBrowser).toHaveBeenCalled());
		expect(mocks.subscribeMutateAsync).not.toHaveBeenCalled();
	});

	it('turns off push for this login, then drops the browser subscription', async () => {
		setStatus(subscribed);
		vi.stubGlobal('Notification', { permission: 'granted' });
		render(PushPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off' })).toBeEnabled());

		await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));

		await waitFor(() => {
			expect(mocks.unsubscribeMutateAsync).toHaveBeenCalledTimes(1);
			expect(mocks.webpush.unsubscribeBrowser).toHaveBeenCalledTimes(1);
		});
		expect(mocks.unsubscribeMutateAsync.mock.invocationCallOrder[0])
			.toBeLessThan(mocks.webpush.unsubscribeBrowser.mock.invocationCallOrder[0]!);
	});

	it('keeps the browser subscription when the turn off request fails', async () => {
		mocks.unsubscribeMutateAsync.mockResolvedValue({
			status: 403,
			data: { type: 'about:blank', title: 'Forbidden', status: 403 },
		});
		setStatus(subscribed);
		vi.stubGlobal('Notification', { permission: 'granted' });
		render(PushPage);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off' })).toBeEnabled());

		await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));

		await waitFor(() => expect(mocks.unsubscribeMutateAsync).toHaveBeenCalled());
		expect(mocks.webpush.unsubscribeBrowser).not.toHaveBeenCalled();
	});

	it('shows the browser subscription host and whether it matches the login', async () => {
		mocks.webpush.getBrowserSubscription.mockResolvedValue(browserSubscription());
		setStatus(subscribed);
		render(PushPage);

		await waitFor(() => {
			expect(screen.getByTestId('push-browser')).toHaveTextContent('Subscribed through fcm.googleapis.com');
		});
		expect(screen.getByTestId('push-browser')).toHaveTextContent('Matches the subscription saved to this login');
		expect(screen.queryByTestId('push-key-rotated')).toBeNull();
	});

	it('hints at a key rotation when the server has no endpoint but the browser does', async () => {
		mocks.webpush.syncPush.mockResolvedValue('unavailable');
		mocks.webpush.getBrowserSubscription.mockResolvedValue(browserSubscription());
		setStatus({ ...subscribed, endpoint: null });
		render(PushPage);

		await waitFor(() => {
			expect(screen.getByTestId('push-key-rotated')).toHaveTextContent('key may have rotated');
		});
		expect(screen.getByTestId('push-browser')).toHaveTextContent('Doesn\'t match');
	});

	it('lists the person\'s logins with their push status', () => {
		setStatus(subscribed);
		setSessions([
			session({ id: 1, current: true, subscribed: true, host: 'fcm.googleapis.com' }),
			session({ id: 2, subscribed: true, host: 'updates.push.services.mozilla.com', ip: '10.0.0.2' }),
			session({ id: 3, disabled: true }),
			session({ id: 4 }),
		]);
		render(PushPage);

		const rows = within(screen.getByTestId('push-sessions')).getAllByRole('row').slice(1);
		expect(rows).toHaveLength(4);
		expect(rows[0]).toHaveTextContent('This login');
		expect(rows[0]).toHaveTextContent('Subscribed through fcm.googleapis.com');
		expect(within(rows[0]!).queryByRole('button')).toBeNull();
		expect(rows[1]).toHaveTextContent('10.0.0.2');
		expect(rows[1]).toHaveTextContent('Subscribed through updates.push.services.mozilla.com');
		expect(within(rows[1]!).getByRole('button', { name: 'Turn off push for login 2' })).toBeInTheDocument();
		expect(rows[2]).toHaveTextContent('Turned off');
		expect(within(rows[2]!).queryByRole('button')).toBeNull();
		expect(rows[3]).toHaveTextContent('None');
		expect(within(rows[3]!).queryByRole('button')).toBeNull();
	});

	it('turns off push for another login and refreshes the list', async () => {
		setStatus(subscribed);
		setSessions([session({ id: 2, subscribed: true, host: 'fcm.googleapis.com' })]);
		render(PushPage);
		const button = screen.getByRole('button', { name: 'Turn off push for login 2' });
		await waitFor(() => expect(button).toBeEnabled());
		mocks.invalidateQueries.mockClear();

		await userEvent.click(button);

		await waitFor(() => {
			expect(mocks.unsubscribeSessionMutateAsync).toHaveBeenCalledWith({ session: 2 });
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['userSessions'] });
		});
	});

	it('explains how to unblock notifications when the browser denies them', () => {
		vi.stubGlobal('Notification', { permission: 'denied' });
		setStatus({ ...subscribed, endpoint: null });
		render(PushPage);

		expect(screen.getByTestId('push-permission')).toHaveTextContent('blocked');
		expect(screen.getByTestId('push-permission')).toHaveTextContent('site settings');
		expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
	});

	it('says when the browser does not support notifications', () => {
		mocks.webpush.isPushSupported.mockReturnValue(false);
		setStatus({ ...subscribed, endpoint: null });
		render(PushPage);

		expect(screen.getByTestId('push-permission')).toHaveTextContent('doesn\'t support push notifications');
	});
});
