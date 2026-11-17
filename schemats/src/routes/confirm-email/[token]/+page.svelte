<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import {
		createRestEmailConfirm,
		createRestEmailConfirmStatus,
		getRestEmailConfirmStatusQueryKey,
		getUserHomeQueryKey,
		getUserProfileQueryKey,
	} from '$indexcards';
	import Button from '$lib/components/Button.svelte';
	import { handleMutation } from '$lib/helpers/query';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	const queryClient = useQueryClient();
	const statusQuery = createRestEmailConfirmStatus(() => data.token);
	const confirmMutation = createRestEmailConfirm();

	// Set once the button worked, so the page says so even before the status query refetches
	let confirmed = $state(false);
	let working = $state(false);

	// A 200 says who the link is for; 404 is a link a newer code or address replaced, 410 one over
	// 7 days old. Anything else (the API being down) stays null and the page keeps its loading state
	const status = $derived.by(() => {
		const response = statusQuery.data;
		if (!response) return null;
		if (response.status === 200) return { kind: 'valid' as const, ...response.data };
		if (response.status === 404) return { kind: 'replaced' as const };
		if (response.status === 410) return { kind: 'expired' as const };
		return null;
	});

	const email = $derived(status?.kind === 'valid' ? status.email : null);
	const done = $derived(confirmed || (status?.kind === 'valid' && status.confirmed));

	// Confirms on a press, never on load: mail scanners open links, and only the person should confirm
	const confirm = async () => {
		working = true;
		try {
			const result = await handleMutation(confirmMutation.mutateAsync({ token: data.token }));
			if (result) {
				confirmed = true;
				// A person logged in on this browser sees the home banner and profile catch up
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: getRestEmailConfirmStatusQueryKey(data.token) }),
					queryClient.invalidateQueries({ queryKey: getUserProfileQueryKey() }),
					queryClient.invalidateQueries({ queryKey: getUserHomeQueryKey() }),
				]);
			}
		} finally {
			working = false;
		}
	};

	const heading = 'text-xl font-semibold text-primary-deep';
	const link = 'text-primary-strong underline';
</script>

<svelte:head>
	<title>Confirm your email | Tabroom.com</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex w-full justify-center py-10">
	<div class="w-full max-w-md rounded-md border border-border bg-surface-alt p-6">
		{#if status === null}
			<h2 class={heading}>Confirm your email</h2>
			<p class="text-sm text-muted" role="status">Checking your link…</p>
		{:else if status.kind === 'replaced' || status.kind === 'expired'}
			<h2 class={heading}>{status.kind === 'expired' ? 'This link has expired' : 'This link no longer works'}</h2>
			<p class="mt-2 text-sm text-text">
				{status.kind === 'expired'
					? 'Confirmation links work for 7 days.'
					: 'A newer email replaced it, or the address on the account has changed since it was sent.'}
			</p>
			<p class="mt-4 text-sm text-text">
				Log in and <a class={link} href="/user/profile/confirm">get a new code</a>.
			</p>
		{:else if done}
			<h2 class={heading}>Your email is confirmed</h2>
			<p class="mt-2 text-sm text-text">
				Tabroom will send email to <strong>{email}</strong> again, and you can create a school or request a tournament.
			</p>
			<p class="mt-4 text-sm text-text">
				<a class={link} href="/user/home">Go to Tabroom</a>
			</p>
		{:else}
			<h2 class={heading}>Confirm your email</h2>
			<p class="mt-2 text-sm text-text">
				Confirm <strong>{email}</strong> as the email address for your Tabroom.com account.
			</p>
			<div class="mt-4">
				<Button color="primary" disabled={working} onclick={confirm}>Confirm my email address</Button>
			</div>
		{/if}
	</div>
</div>
