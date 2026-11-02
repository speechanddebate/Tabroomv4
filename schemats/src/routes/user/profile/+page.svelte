<script lang="ts">
	import { onMount } from 'svelte';
	import { Toggle } from 'flowbite-svelte';
	import { CLASSIC_URL } from '$app/env/public';
	import { createPushState } from '$lib/helpers/pushState.svelte';

	// A stub until the profile moves here: push lives on this page, everything else on classic

	const push = createPushState();

	onMount(() => {
		push.readPermission();
	});

	// Only these states can change; the rest say why under the toggle
	const canToggle = $derived(push.state === 'on' || push.state === 'off' || push.state === 'undecided');

	const toggle = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		if (push.state === 'on') {
			await push.turnOff();
		} else {
			await push.enable();
		}
		// A refused permission or a failed request leaves the state as it was, so put the switch back
		input.checked = push.state === 'on';
	};
</script>

<div class="flex flex-1 flex-col gap-3 bg-surface-alt p-3">
	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-sm">
		<h1 class="text-lg font-semibold text-text">Your Profile</h1>

		<Toggle
			checked={push.state === 'on'}
			disabled={!canToggle || push.busy}
			onchange={toggle}
		>
			Receive notifications on this browser
		</Toggle>

		{#if push.state === 'unsupported'}
			<p class="text-sm text-muted" data-testid="push-note">This browser doesn't support push notifications.</p>
		{:else if push.state === 'su'}
			<p class="text-sm text-muted" data-testid="push-note">Push notifications can't be changed while su'd.</p>
		{:else if push.state === 'unavailable'}
			<p class="text-sm text-muted" data-testid="push-note">Push notifications aren't available right now.</p>
		{:else if push.state === 'denied'}
			<p class="text-sm text-muted" data-testid="push-note">
				Notifications from Tabroom are blocked in this browser. To get them, open your
				browser's site settings for Tabroom and allow notifications.
			</p>
		{/if}

		<p class="text-sm text-text">
			Your name, password and email settings are still on the classic site.
			<a
				class="font-semibold text-primary-strong underline"
				href={`${CLASSIC_URL}/user/login/profile.mhtml`}
			>
				Edit your profile
			</a>
		</p>
	</section>
</div>
