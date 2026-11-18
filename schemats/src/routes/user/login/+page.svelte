<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Problem } from '@tabroom/types';
	import { createAuthLogin } from '#indexcards';
	import { handleMutation } from '#lib/helpers/query.ts';
	import { fieldErrors } from '#lib/helpers/forms.ts';
	import Button from '#lib/components/Button.svelte';
	import { FormProblem, TextInput } from '#lib/components/forms/index.ts';

	let username = $state('');
	let password = $state('');
	let error: Problem | null = $state(null);
	let isSubmitting = $state(false);

	const errors = $derived(fieldErrors(error));

	const redirectParam = $derived(page.url.searchParams.get('redirect'));
	const reasonParam = $derived(page.url.searchParams.get('reason'));

	// Same-origin paths only: '//evil.com' starts with '/' but is another host
	const getSafeRedirect = (value: string | null): string => {
		if (!value) {
			return '/';
		}
		const url = new URL(value, page.url.origin);
		return url.origin === page.url.origin ? `${url.pathname}${url.search}${url.hash}` : '/';
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
				// goto rejects a path with no route here, e.g. login from a 404 page
				await goto(target, { replace: true, refreshAll: true })
					.catch(() => goto('/', { replace: true, refreshAll: true }));
				return;
			}
		} catch (err) {
			error = err as Problem;
		} finally {
			isSubmitting = false;
		}
	};
</script>

<div class="flex w-full justify-center px-4 py-10">
	<div class="raised flex w-full max-w-md flex-col gap-4 p-6">
		<div class="flex flex-col gap-1">
			<h2 class="font-display text-3xl text-primary-deep normal-case tracking-normal">Sign in</h2>
			<span class="text-sm text-muted">Use the email address tied to your Tabroom account.</span>
		</div>
		{#if reasonParam === 'auth'}
			<FormProblem problem={{ title: 'Authentication Required', detail: 'You must be signed in to access this page.' }} />
		{/if}

		<form class="flex flex-col gap-4" onsubmit={submit}>
			<FormProblem problem={error} />
			<TextInput
				autocomplete = "username"
				error        = {errors.username}
				label        = "Email"
				required
				bind:value   = {username}
			/>
			<TextInput
				autocomplete = "current-password"
				error        = {errors.password}
				label        = "Password"
				required
				type         = "password"
				bind:value   = {password}
			/>
			<Button color="success" disabled={isSubmitting} type="submit">
				{isSubmitting ? 'Signing in...' : 'Sign in'}
			</Button>
		</form>
	</div>
</div>
