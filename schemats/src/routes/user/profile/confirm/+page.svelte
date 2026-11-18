<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Problem } from '@tabroom/types';
	import { useQueryClient } from '@tanstack/svelte-query';
	import {
		createUserEmailConfirm,
		createUserEmailResend,
		createUserProfile,
		getUserHomeQueryKey,
		getUserProfileQueryKey,
	} from '#indexcards';
	import Button from '#lib/components/Button.svelte';
	import { FormProblem, TextInput } from '#lib/components/forms/index.ts';
	import { fieldErrors } from '#lib/helpers/forms.ts';
	import { handleMutation, handleOrval } from '#lib/helpers/query.ts';
	import { toast } from '#lib/helpers/toasts.ts';
	import WithSidebar from '#lib/layouts/WithSidebar.svelte';
	import ProfileSidebar from '../ProfileSidebar.svelte';

	// Confirming also happens from the email link and on classic, so never show a stored copy
	const profileQuery = createUserProfile(() => ({ query: { meta: { persist: false } } }));
	const profile = $derived(handleOrval(profileQuery));
	const confirm = createUserEmailConfirm();
	const resend = createUserEmailResend();
	const queryClient = useQueryClient();

	let code = $state('');
	let problem = $state<Problem | null>(null);
	let busy = $state(false);
	const errors = $derived(fieldErrors(problem));
	const expired = $derived(problem?.status === 410);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy) return;
		problem = null;
		busy = true;
		// a 204 resolves to undefined; a problem or a network error resolves to null
		const confirmed = await handleMutation(() => confirm.mutateAsync({ data: { code } }), {
			Problem: (result) => { problem = result; },
		});
		busy = false;
		if (confirmed === null) return;

		toast.success({ message: 'Your email address is confirmed' });
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: getUserProfileQueryKey() }),
			queryClient.invalidateQueries({ queryKey: getUserHomeQueryKey() }),
		]);
		await goto('/user/home');
	};

	const sendNewCode = async ({ expired = false } = {}) => {
		if (busy) return;
		busy = true;
		const sent = await handleMutation(() => resend.mutateAsync());
		busy = false;
		if (sent !== null) {
			problem = null;
			code = '';
			toast.success({
				message: expired
					? `Your last code had expired, so we sent a new one to ${profile?.email}`
					: `We sent a new code to ${profile?.email}`,
			});
		} else {
			// Refused because it's already confirmed (on classic, or from the email link): show that
			await queryClient.invalidateQueries({ queryKey: getUserProfileQueryKey() });
		}
	};

	// An expired code, or none at all on an old account, can't confirm anything, so a new one goes out
	// on arrival. The load prefetched the profile, so it is here at mount
	onMount(() => {
		if (profile?.emailUnconfirmed && profile.emailCodeExpired) sendNewCode({ expired: true });
	});

	const card = 'raised @container flex flex-col gap-3 p-4';
	const cardTitle = 'font-display text-xl text-primary-deep normal-case tracking-normal';
	const link = 'font-semibold text-primary-strong underline';
</script>

<WithSidebar canvas>
	<div class="@container flex flex-1 flex-col gap-3">
		<h2 class="font-display text-3xl text-primary-deep normal-case tracking-normal">Confirm your email</h2>

		{#if profile && !profile.emailUnconfirmed}
			<section class={card} aria-labelledby="email-confirmed-title" data-testid="email-confirmed">
				<h3 id="email-confirmed-title" class={cardTitle}>You're all set</h3>
				<p class="text-sm text-text">Your email address, {profile.email}, is confirmed.</p>
				<a class={['self-start text-sm', link]} href="/user/home">Go to your home page</a>
			</section>
		{:else if profile}
			<form class={card} onsubmit={submit}>
				<FormProblem problem={expired ? null : problem} />
				<p class="text-sm text-text">
					Enter the code we sent to <strong>{profile.email}</strong>. Codes work for 7 days.
				</p>
				<div class="flex flex-wrap items-start gap-3">
					<TextInput
						class="w-48"
						autocapitalize="characters"
						autocomplete="one-time-code"
						error={expired ? 'Your code has expired. Send a new one below.' : errors.code}
						label="Confirmation code"
						maxlength={16}
						required
						spellcheck={false}
						bind:value={code}
					/>
					<Button class="mt-6" color="primary" disabled={busy} type="submit">Confirm</Button>
				</div>
			</form>

			<section class={card} aria-labelledby="confirm-help">
				<h3 id="confirm-help" class={cardTitle}>Didn't get the email?</h3>
				<ul class="flex list-disc flex-col gap-1 pl-5 text-sm text-text">
					<li>Check your spam or junk folder. The email can take a few minutes to arrive.</li>
					<li>Make sure {profile.email} is right. If it isn't, <a class={link} href="/user/profile">change it on your profile</a>.</li>
				</ul>
				<Button class="self-start" disabled={busy} onclick={() => sendNewCode()} variant="outline">Send a new code</Button>
			</section>
		{/if}
	</div>

	{#snippet sidebar()}
		<ProfileSidebar forcePasswordChange={false} />
	{/snippet}
</WithSidebar>
