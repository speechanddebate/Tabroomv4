<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Problem } from '$indexcards/schemas/problem';
	import { createAuthLogin } from '$indexcards';
	import { Alert } from 'flowbite-svelte';
	import { handleMutation } from '$lib/helpers/query';

	let username = $state('');
	let password = $state('');
	let error: Problem | null = $state(null);
	let isSubmitting = $state(false);

	const redirectParam = $derived(page.url.searchParams.get('redirect'));
	const reasonParam = $derived(page.url.searchParams.get('reason'));

	const getSafeRedirect = (value: string | null): string => {
		if (!value) {
			return '/';
		}

		try {
			const decoded = decodeURIComponent(value);
			return decoded.startsWith('/') ? decoded : '/';
		} catch {
			return '/';
		}
	};

	const loginMutation = createAuthLogin();

	const setProblemError = (problem: Problem) => {
		error = problem;
	};

	const setUnknownError = (queryError: unknown) => {
		error = queryError as Problem;
	};

	const submit = async (e: Event) => {
		e.preventDefault();
		if (isSubmitting) {
			return;
		}

		error = null;
		isSubmitting = true;
		const target = getSafeRedirect(redirectParam);
		try {
			const success = await handleMutation(loginMutation.mutateAsync({ data: { username, password } }), {
				Problem: setProblemError,
				queryError: setUnknownError,
			});

			if (success) {
				// target is already a full in-app path from the redirect param
				await goto(target, { replaceState: true, invalidateAll: true });
				return;
			}
		} catch (err) {
			error = err as Problem;
		} finally {
			isSubmitting = false;
		}
	};
</script>

<div class="flex w-full justify-center py-10">
	<div class="w-full max-w-md bg-surface-alt border border-border rounded-md p-6">
		<h2 class="text-xl font-semibold text-primary-deep">Sign in</h2>
		<p class="text-sm text-muted mb-4">
			Use the email address tied to your Tabroom account.
		</p>
		{#if reasonParam === 'auth'}
			<Alert class="mb-4" color="red">
				<div class="font-semibold">Authentication Required</div>
				<div class="text-sm">You must be signed in to access this page.</div>
			</Alert>
		{/if}

		{#if error}
			<Alert class="mb-4" color="red">
				<div class="font-semibold">{error.title}</div>
				<div class="text-sm">{error.detail}</div>
				{#if error.status}
					<div class="text-xs opacity-80">Status: {error.status}</div>
				{/if}
			</Alert>
		{/if}

		<form class="flex flex-col gap-4" onsubmit={submit}>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold">Email</span>
				<input
					class="form-input p-2 rounded border border-border-strong"
					autocomplete="username"
					required
					bind:value={username}
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold">Password</span>
				<input
					class="form-input p-2 rounded border border-border-strong"
					autocomplete="current-password"
					required
					type="password"
					bind:value={password}
				/>
			</label>

			<button
				class="
					bg-success
					text-white
					font-semibold
					rounded-md
					py-2
					hover:brightness-90
					disabled:opacity-60"
				disabled={isSubmitting}
				type="submit"
			>
				{isSubmitting ? 'Signing in...' : 'Sign in'}
			</button>
		</form>
	</div>
</div>