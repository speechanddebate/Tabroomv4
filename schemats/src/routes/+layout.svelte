<script lang="ts">

	import '../app.css';
	import AppShell from '$lib/layouts/AppShell.svelte';
	import ToastProvider from '$lib/components/ToastProvider.svelte';

	import { browser } from '$app/env';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
	import { defaultShouldDehydrateQuery } from '@tanstack/svelte-query';
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

	import { initSessionContext } from '$lib/helpers/SessionContext.svelte';
	import {
		createAuthLogout,
		createAuthSuEnd,
		createUserInboxUnread,
		getUserNotifyPushQueryKey,
		getUserSessionsQueryKey,
	} from '$indexcards';
	import { invalidateAll } from '$app/navigation';
	import { handleOrval } from '$lib/helpers/query';
	import { isPushSupported, syncPush } from '$lib/helpers/webpush';

	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	initSessionContext(() => data.sessionData ?? null);

	const persister = createAsyncStoragePersister({
		storage: browser ? window.localStorage : undefined,
	});

	// Drop the cache and its persisted copy so the next user on this computer can't read it
	const clearCache = async () => {
		data.queryClient.clear();
		await persister.removeClient();
	};

	const logoutMutation = createAuthLogout(undefined,() => data.queryClient);
	const logout = async () => {
		try {
			await logoutMutation.mutateAsync();
		} finally {
			// reload even when the request fails, e.g. the session already expired,
			// so requireLogin in the server loads redirects off protected pages
			await clearCache();
			await invalidateAll();
		}
	};

	const suEndMutation = createAuthSuEnd(undefined, () => data.queryClient);
	const suEnd = async () => {
		await suEndMutation.mutateAsync();
		await clearCache();
		await invalidateAll(); // Force reload +layout.server.ts
	};

	const notificationCountQuery = createUserInboxUnread(() => ({
		query: {
			refetchInterval: 15000,
			enabled: !!data.sessionData,
		},
	}), () => data.queryClient);
	const notificationCount = $derived(
		handleOrval(notificationCountQuery, {
			// A 401 here is expected during logout/session teardown.
			Problem: (problem, callDefault) => problem.status === 401 ? void 0 : callDefault(problem),
		})?.count ?? 0,
	);

	// The page-load sync from the web push client contract ($lib/helpers/webpush), once per
	// login rather than per navigation. It never prompts. su'd sessions can't save a subscription
	let pushSyncedFor: number | null = null;
	$effect(() => {
		const session = data.sessionData;
		if (!session || session.Su || !isPushSupported() || pushSyncedFor === session.id) {
			return;
		}
		pushSyncedFor = session.id;
		syncPush()
			.then(() => Promise.all([
				data.queryClient.invalidateQueries({ queryKey: getUserNotifyPushQueryKey() }),
				data.queryClient.invalidateQueries({ queryKey: getUserSessionsQueryKey() }),
			]))
			.catch((err) => console.error('Push sync failed', err));
	});

</script>

<svelte:head>
	<title>Tabroom.com</title>
</svelte:head>

<PersistQueryClientProvider
	client         = {data.queryClient}
	persistOptions = {{
		persister,
		dehydrateOptions: {
			// A query whose data can change on the server under the page opts out with meta.persist,
			// so a reload loads it fresh instead of showing a stale copy first
			shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && query.meta?.persist !== false,
		},
	}}
>

	<AppShell logoutFn={logout} notificationCount={notificationCount} suEndFn={suEnd}>
		{@render children()}
	</AppShell>
	<SvelteQueryDevtools />
	<ToastProvider />
</PersistQueryClientProvider>
