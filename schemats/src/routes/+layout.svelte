<script lang="ts">

	import '../app.css';
	import AppShell from '$lib/layouts/AppShell.svelte';
	import ToastProvider from '$lib/components/ToastProvider.svelte';

	import { browser } from '$app/env';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

	import { initSessionContext } from '$lib/helpers/SessionContext.svelte';
	import { createAuthLogout, createAuthSuEnd, createUserInboxUnread } from '$indexcards';
	import { invalidateAll } from '$app/navigation';
	import { handleOrval } from '$lib/helpers/query';

	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	initSessionContext(() => data.sessionData ?? null);

	const persister = createAsyncStoragePersister({
		storage: browser ? window.localStorage : null,
	});

	const logoutMutation = createAuthLogout(undefined,() => data.queryClient);
	const logout = async () => {
		try {
			await logoutMutation.mutateAsync();
		} finally {
			// reload even when the request fails, e.g. the session already expired,
			// so requireLogin in the server loads redirects off protected pages
			data.queryClient.invalidateQueries();
			await invalidateAll();
		}
	};

	const suEndMutation = createAuthSuEnd(undefined, () => data.queryClient);
	const suEnd = async () => {
		await suEndMutation.mutateAsync();
		data.queryClient.invalidateQueries();
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

</script>

<svelte:head>
	<title>Tabroom.com</title>
</svelte:head>

<PersistQueryClientProvider
	client         = {data.queryClient}
	persistOptions = {{ persister }}
>

	<AppShell logoutFn={logout} notificationCount={notificationCount} suEndFn={suEnd}>
		{@render children()}
	</AppShell>
	<SvelteQueryDevtools />
	<ToastProvider />
</PersistQueryClientProvider>
