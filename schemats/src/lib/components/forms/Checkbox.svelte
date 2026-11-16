<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		label        : string,
		checked?     : boolean,
		description? : string,
		class?       : string,
	} & Omit<HTMLInputAttributes, 'class' | 'type' | 'checked' | 'id' | 'aria-describedby'>;

	let {
		label,
		checked = $bindable(false),
		description,
		class: classOverride,
		...rest
	}: Props = $props();

	const id = $props.id();
	const descriptionId = `${id}-description`;
</script>

<div class={['flex items-start gap-2', classOverride]}>
	<input
		{id}
		class="
			mt-0.5 size-4 shrink-0 cursor-pointer rounded border-2 border-border-strong text-primary-strong
			focus:ring-2 focus:ring-primary-strong focus:ring-offset-1
			disabled:cursor-not-allowed disabled:opacity-50
		"
		aria-describedby={description ? descriptionId : undefined}
		type="checkbox"
		bind:checked
		{...rest}
	/>
	<div class="flex flex-col gap-0.5">
		<label class="text-sm font-semibold text-text" for={id}>{label}</label>
		{#if description}
			<span id={descriptionId} class="text-xs text-muted">{description}</span>
		{/if}
	</div>
</div>
