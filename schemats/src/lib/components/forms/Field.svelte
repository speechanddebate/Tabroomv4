<script lang="ts" module>
	// Spread onto the control so its label, description and error are announced with it
	export type FieldControl = {
		id                 : string,
		'aria-describedby' : string | undefined,
		'aria-invalid'     : true | undefined,
	};

	// Button's heights: md for form fields, sm for controls inside dense rows (tables, filters, scores)
	export type ControlSize = 'md' | 'sm';

	// The 2px box TextInput and Select share, with Button's border and focus outline
	export const controlBox = [
		'rounded border-2 border-border-strong bg-surface font-sans text-text',
		'focus:border-primary-strong focus:ring-0 focus:outline-2 focus:outline-offset-2 focus:outline-primary-strong',
		'aria-invalid:border-danger',
		'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-alt disabled:text-muted',
	].join(' ');

	export const controlHeights: Record<ControlSize, string> = {
		md : 'h-10 text-sm',
		sm : 'h-7 text-xs',
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label        : string,
		description? : string,
		error?       : string,
		// Marks the label only; the control sets its own required attribute
		required?    : boolean,
		// Keeps the label for screen readers only, for a control whose column or row already names it
		hideLabel?   : boolean,
		class?       : string,
		children     : Snippet<[FieldControl]>,
	};

	let {
		label,
		description,
		error,
		required  = false,
		hideLabel = false,
		class: classOverride,
		children,
	}: Props = $props();

	const id = $props.id();
	const descriptionId = `${id}-description`;
	const errorId = `${id}-error`;

	let control: FieldControl = $derived({
		id,
		'aria-describedby' : [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined,
		'aria-invalid'     : error ? true : undefined,
	});
</script>

<div class={['flex min-w-0 flex-col gap-1', classOverride]}>
	<label class={['text-sm font-semibold text-text', hideLabel && 'sr-only']} for={id}>
		{label}
		{#if required}
			<span class="text-danger" aria-hidden="true">*</span>
		{/if}
	</label>
	{#if description}
		<span id={descriptionId} class="text-xs text-muted">{description}</span>
	{/if}
	{@render children(control)}
	{#if error}
		<span id={errorId} class="text-xs font-semibold text-danger">{error}</span>
	{/if}
</div>
