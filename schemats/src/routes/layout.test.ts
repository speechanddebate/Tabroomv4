import { render, waitFor } from '@testing-library/svelte';
import { QueryClient, dehydrate } from '@tanstack/svelte-query';

import Layout from './+layout.svelte';
import { load } from './+layout';

const PERSISTED_CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';
const profileKey = ['/v1/user/profile'];

// Writes the cache the way an earlier page load would have persisted it
const seedPersistedCache = () => {
	const previous = new QueryClient();
	previous.setQueryData(profileKey, { first: 'Alice', email: 'alice@example.com' });
	localStorage.setItem(PERSISTED_CACHE_KEY, JSON.stringify({
		buster      : '',
		timestamp   : Date.now(),
		clientState : dehydrate(previous),
	}));
};

type AppShellProps = {
	logoutFn : () => Promise<void>;
	suEndFn  : () => Promise<void>;
};

const {
	appShellProps,
	env,
	mockInvalidateAll,
	mockLogoutMutateAsync,
	mockSuEndMutateAsync,
	mockIsPushSupported,
	mockSyncPush,
} = vi.hoisted(() => ({
	appShellProps: { current: null as null | AppShellProps },
	env: { browser: true },
	mockInvalidateAll: vi.fn(),
	mockLogoutMutateAsync: vi.fn(),
	mockSuEndMutateAsync: vi.fn(),
	mockIsPushSupported: vi.fn(),
	mockSyncPush: vi.fn(),
}));

vi.mock('$app/env', () => ({
	get browser() {
		return env.browser;
	},
}));
vi.mock('$app/navigation', () => ({ invalidateAll: mockInvalidateAll }));
vi.mock('@tanstack/svelte-query-devtools', () => ({ SvelteQueryDevtools: () => {} }));
vi.mock('$lib/components/ToastProvider.svelte', () => ({ default: () => {} }));
// Capture the session handlers the layout hands to the shell instead of rendering the header
vi.mock('$lib/layouts/AppShell.svelte', () => ({
	default: (_anchor: unknown, props: AppShellProps) => {
		appShellProps.current = props;
	},
}));
vi.mock('$indexcards', () => ({
	createAuthLogout: () => ({ mutateAsync: mockLogoutMutateAsync }),
	createAuthSuEnd: () => ({ mutateAsync: mockSuEndMutateAsync }),
	createUserInboxUnread: () => ({ data: undefined, error: null, isError: false, isSuccess: false }),
	getUserNotifyPushQueryKey: () => ['userNotifyPush'],
	getUserSessionsQueryKey: () => ['userSessions'],
}));
vi.mock('$lib/helpers/webpush', () => ({
	isPushSupported: mockIsPushSupported,
	syncPush: mockSyncPush,
}));

beforeEach(() => {
	mockIsPushSupported.mockReturnValue(true);
	mockSyncPush.mockResolvedValue('no-permission');
});

afterEach(() => {
	vi.clearAllMocks();
});

const renderLayout = (sessionData: unknown, queryClient = new QueryClient()) => render(Layout, {
	props: {
		data: { queryClient, sessionData },
		children: () => {},
	},
} as never);

describe('root layout push sync', () => {
	it('syncs push once for a logged-in session and refreshes the push queries', async () => {
		const queryClient = new QueryClient();
		const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
		const { rerender } = renderLayout({ id: 7, Person: { id: 1, first: 'Alice' } }, queryClient);

		await waitFor(() => {
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ['userNotifyPush'] });
		});
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['userSessions'] });

		// A rerun of the layout load for the same login doesn't sync again
		await rerender({ data: { queryClient, sessionData: { id: 7, Person: { id: 1, first: 'Alice' } } } } as never);
		expect(mockSyncPush).toHaveBeenCalledTimes(1);
	});

	it('syncs again for a different login', async () => {
		const queryClient = new QueryClient();
		const { rerender } = renderLayout({ id: 7, Person: { id: 1, first: 'Alice' } }, queryClient);
		await rerender({ data: { queryClient, sessionData: { id: 8, Person: { id: 2, first: 'Bob' } } } } as never);

		await waitFor(() => {
			expect(mockSyncPush).toHaveBeenCalledTimes(2);
		});
	});

	it.each([
		['logged out', null],
		['su\'d', { id: 7, Person: { id: 2, first: 'Bob' }, Su: { id: 1, first: 'Alice' } }],
	])('does not sync when %s', (_name, sessionData) => {
		renderLayout(sessionData);
		expect(mockSyncPush).not.toHaveBeenCalled();
	});

	it('does not sync in a browser without web push', () => {
		mockIsPushSupported.mockReturnValue(false);
		renderLayout({ id: 7, Person: { id: 1, first: 'Alice' } });
		expect(mockSyncPush).not.toHaveBeenCalled();
	});

	it('logs a failed sync instead of throwing', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mockSyncPush.mockRejectedValue(new Error('push service down'));
		renderLayout({ id: 7, Person: { id: 1, first: 'Alice' } });

		await waitFor(() => {
			expect(consoleError).toHaveBeenCalledWith('Push sync failed', expect.any(Error));
		});
	});
});

describe('root layout session teardown', () => {
	beforeEach(() => {
		localStorage.clear();
		appShellProps.current = null;
		mockLogoutMutateAsync.mockResolvedValue({ status: 200, data: { ok: true } });
		mockSuEndMutateAsync.mockResolvedValue({ status: 200, data: { ok: true } });
	});

	it.each([
		['logout', 'logoutFn'],
		['su end', 'suEndFn'],
	] as const)('%s clears the query cache and the persisted copy so the next user cannot read it', async (_name, handler) => {
		seedPersistedCache();
		const queryClient = new QueryClient();
		render(Layout, {
			props: {
				data: { queryClient, sessionData: { Person: { id: 1, first: 'Alice' } } },
				children: () => {},
			},
		} as never);

		await waitFor(() => {
			expect(queryClient.getQueryData(profileKey)).toBeDefined();
		});

		await appShellProps.current![handler]();

		expect(localStorage.getItem(PERSISTED_CACHE_KEY) ?? '').not.toContain('alice@example.com');
		expect(queryClient.getQueryData(profileKey)).toBeUndefined();
	});
});

describe('root layout load', () => {
	const runLoad = async () => {
		const result = await load({ data: { sessionData: null } } as never);
		return (result as { queryClient: QueryClient }).queryClient;
	};

	afterEach(() => {
		env.browser = true;
	});

	// invalidateAll reruns this load on login, logout and su end; a new client there splits
	// QueryClientProvider (keeps the first) from PersistQueryClientProvider (follows data)
	it('reuses one query client in the browser across reruns', async () => {
		expect(await runLoad()).toBe(await runLoad());
	});

	it('creates a query client per request on the server', async () => {
		env.browser = false;
		expect(await runLoad()).not.toBe(await runLoad());
	});
});
