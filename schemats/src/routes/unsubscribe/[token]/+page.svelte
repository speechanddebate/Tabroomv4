<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import {
		createRestNotifyEmailUnsubscribe,
		createRestNotifyEmailUnsubscribeStatus,
		getRestNotifyEmailUnsubscribeStatusQueryKey,
	} from '$indexcards';
	import Button from '$lib/components/Button.svelte';
	import { handleMutation } from '$lib/helpers/query';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	const queryClient = useQueryClient();
	const statusQuery = createRestNotifyEmailUnsubscribeStatus(() => data.token);
	const unsubscribeMutation = createRestNotifyEmailUnsubscribe();

	// Set once the button worked, so the page says so even before the status query refetches
	let unsubscribed = $state(false);
	let working = $state(false);

	// The status is a 200 with who the link is for, or a 404 for a link that is not recognized.
	// Anything else (the API being down) stays null and the page keeps its loading state
	const status = $derived.by(() => {
		const response = statusQuery.data;
		if (!response) return null;
		if (response.status === 200) return { kind: 'valid' as const, ...response.data };
		if (response.status === 404) return { kind: 'invalid' as const };
		return null;
	});

	const email = $derived(status?.kind === 'valid' ? status.email : null);
	const done = $derived(unsubscribed || (status?.kind === 'valid' && status.noEmail));

	const stopEmails = async () => {
		working = true;
		try {
			const result = await handleMutation(unsubscribeMutation.mutateAsync({ token: data.token }));
			if (result) {
				unsubscribed = true;
				await queryClient.invalidateQueries({ queryKey: getRestNotifyEmailUnsubscribeStatusQueryKey(data.token) });
			}
		} finally {
			working = false;
		}
	};
</script>

<svelte:head>
	<title>Unsubscribe | Tabroom.com</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex w-full justify-center py-10">
	<div class="w-full max-w-md rounded-md border border-border bg-surface-alt p-6">
		{#if status === null}
			<h2 class="text-xl font-semibold text-primary-deep">Tabroom emails</h2>
			<p class="text-sm text-muted" role="status">Checking your link…</p>
		{:else if status.kind === 'invalid'}
			<h2 class="text-xl font-semibold text-primary-deep">This link isn't valid</h2>
			<p class="mt-2 text-sm text-text">
				It may be from an older email, or for an address that has since changed on your account.
			</p>
			<p class="mt-4 text-sm text-text">
				You can turn Tabroom emails off from <a class="text-primary-strong underline" href="/user/profile">your profile</a>.
			</p>
		{:else if done}
			<h2 class="text-xl font-semibold text-primary-deep">You've unsubscribed</h2>
			<p class="mt-2 text-sm text-text">
				Tabroom will stop sending email to <strong>{email}</strong>. You'll still see messages in your
				Tabroom inbox, and web push notifications keep working if you've turned them on.
			</p>
			<p class="mt-4 text-sm text-text">
				Changed your mind? Turn emails back on from <a class="text-primary-strong underline" href="/user/profile">your profile</a>.
			</p>
		{:else}
			<h2 class="text-xl font-semibold text-primary-deep">Stop Tabroom emails?</h2>
			<p class="mt-2 text-sm text-text">
				Tabroom will stop sending email to <strong>{email}</strong>. You'll still see messages in your
				Tabroom inbox, and web push notifications keep working if you've turned them on.
			</p>
			<p class="mt-4 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm font-bold text-text" role="note">
				If you are attending a tournament, we highly recommend leaving emails on. With them off you will
				not receive important updates about the tournament, such as pairings, room changes, and schedule changes.
			</p>
			<div class="mt-4">
				<Button color="danger" disabled={working} onclick={stopEmails}>Stop these emails</Button>
			</div>
		{/if}
	</div>
</div>
