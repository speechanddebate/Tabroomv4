<script lang="ts" module>
	/** localStorage key holding the time, in ms, until which the prompt stays hidden */
	export const SNOOZE_KEY = 'tabroom.pushPrompt.snoozedUntil';
	export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, X } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import { createPushState } from '$lib/helpers/pushState.svelte';
	import { toast } from '$lib/helpers/toasts';

	// Asks people who haven't decided to turn on push. The browser's own permission dialog opens
	// only from the button, since browsers ignore or mute requests made without a click

	const push = createPushState();

	// Hidden until read in the browser, so the server render never flashes the banner
	let snoozed = $state(true);

	const readSnoozed = () => {
		try {
			return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
		} catch {
			// storage blocked: show the prompt, and "Not now" only lasts until the next load
			return false;
		}
	};

	onMount(() => {
		push.readPermission();
		snoozed = readSnoozed();
	});

	const visible = $derived(push.state === 'undecided' && !snoozed);

	const enable = async () => {
		if (await push.enable()) {
			toast.success({ message: 'Notifications are on for this browser' });
		}
	};

	const dismiss = () => {
		snoozed = true;
		try {
			localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
		} catch {
			// storage blocked: hidden for this page view only
		}
	};
</script>

{#if visible}
	<div
		class="flex flex-wrap items-center gap-3 rounded-md border border-primary bg-primary-soft px-3 py-2 text-sm text-text shadow-sm"
		aria-label="Turn on notifications"
		data-testid="push-prompt"
		role="region"
	>
		<Bell class="h-4 w-4 shrink-0" aria-hidden="true" />
		<p class="flex-1">Turn on notifications to hear when you're assigned a round or your tournament posts an update.</p>
		<Button
			color="primary"
			disabled={push.busy}
			onclick={enable}
			size="sm"
		>
			Turn on
		</Button>
		<button
			class="rounded p-1 hover:bg-surface"
			aria-label="Not now"
			onclick={dismiss}
			type="button"
		>
			<X class="h-4 w-4" aria-hidden="true" />
		</button>
	</div>
{/if}
