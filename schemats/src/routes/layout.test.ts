import { render, waitFor } from '@testing-library/svelte';
import { QueryClient, dehydrate } from '@tanstack/svelte-query';

import Layout from './+layout.svelte';

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

const { appShellProps, mockInvalidateAll, mockLogoutMutateAsync, mockSuEndMutateAsync } = vi.hoisted(() => ({
	appShellProps: { current: null as null | AppShellProps },
	mockInvalidateAll: vi.fn(),
	mockLogoutMutateAsync: vi.fn(),
	mockSuEndMutateAsync: vi.fn(),
}));

vi.mock('$app/env', () => ({ browser: true }));
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
}));

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
