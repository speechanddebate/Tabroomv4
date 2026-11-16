<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	// Goes inside the form: Save changes is its submit button, so Enter in a field saves too
	type Props = {
		// How many fields differ from what's saved (Draft.changes)
		changes   : number,
		saving?   : boolean,
		ondiscard : () => void,
		class?    : string,
	};

	let { changes, saving = false, ondiscard, class: classOverride }: Props = $props();
</script>

<div
	class={[
		'sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border-2 px-4 py-2 shadow-lg',
		changes ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
		classOverride,
	]}
>
	<span class="text-sm text-text" aria-live="polite">
		{#if saving}
			Saving
		{:else if changes}
			{changes} unsaved {changes === 1 ? 'change' : 'changes'}
		{:else}
			All changes saved
		{/if}
	</span>
	<div class="flex gap-2">
		<Button disabled={!changes || saving} onclick={ondiscard} type="button" variant="ghost">Discard</Button>
		<Button color="primary" disabled={!changes || saving} type="submit">Save changes</Button>
	</div>
</div>
