<script lang="ts">
	import type { Problem } from '@tabroom/types';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createUserPasswordChange, getUserProfileQueryKey, getUserSessionsQueryKey } from '$indexcards';
	import Button from '$lib/components/Button.svelte';
	import { FormProblem, TextInput } from '$lib/components/forms';
	import { fieldErrors } from '$lib/helpers/forms';
	import { handleMutation } from '$lib/helpers/query';
	import { isSuSession } from '$lib/helpers/SessionContext.svelte';
	import { toast } from '$lib/helpers/toasts';

	const change = createUserPasswordChange();
	const queryClient = useQueryClient();

	let currentPassword = $state('');
	let newPassword = $state('');
	let repeatPassword = $state('');
	let problem: Problem | null = $state(null);
	let saving = $state(false);
	const errors = $derived(fieldErrors(problem));

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (saving) return;
		problem = null;
		saving = true;
		// a 204 resolves to undefined; a problem or a network error resolves to null
		const changed = await handleMutation(change.mutateAsync({ data: { currentPassword, newPassword, repeatPassword } }), {
			Problem: (result) => { problem = result; },
		});
		if (changed !== null) {
			currentPassword = '';
			newPassword = '';
			repeatPassword = '';
			toast.success({ message: 'Your password is changed, and you\'re logged out everywhere else' });
			// The other sessions are gone, and a required change is no longer required
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: getUserSessionsQueryKey() }),
				queryClient.invalidateQueries({ queryKey: getUserProfileQueryKey() }),
			]);
		}
		saving = false;
	};
</script>

{#if isSuSession()}
	<p class="text-sm text-muted" data-testid="password-su">Passwords can't be changed while su'd.</p>
{:else}
	<form class="flex flex-col gap-3" data-testid="password-form" onsubmit={save}>
		<FormProblem {problem} />
		<TextInput
			autocomplete="current-password"
			error={errors.currentPassword}
			label="Current password"
			required
			type="password"
			bind:value={currentPassword}
		/>
		<TextInput
			autocomplete="new-password"
			description="At least 8 characters."
			error={errors.newPassword}
			label="New password"
			required
			type="password"
			bind:value={newPassword}
		/>
		<TextInput
			autocomplete="new-password"
			error={errors.repeatPassword}
			label="Repeat new password"
			required
			type="password"
			bind:value={repeatPassword}
		/>
		<Button class="self-start" color="primary" disabled={saving} type="submit">Change password</Button>
	</form>
{/if}
