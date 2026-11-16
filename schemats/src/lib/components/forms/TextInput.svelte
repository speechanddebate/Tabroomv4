<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Field, { controlBox, controlHeights, type ControlSize } from './Field.svelte';

	type Props = {
		label        : string,
		value?       : string,
		type?        : 'text' | 'email' | 'tel' | 'password' | 'search' | 'date' | 'time',
		size?        : ControlSize,
		// A unit shown inside the box, before or after the value ($, rounds)
		prefix?      : string,
		suffix?      : string,
		description? : string,
		error?       : string,
		required?    : boolean,
		hideLabel?   : boolean,
		class?       : string,
	} & Omit<HTMLInputAttributes, 'class' | 'type' | 'value' | 'size' | 'prefix' | 'id' | 'aria-describedby' | 'aria-invalid'>;

	let {
		label,
		value    = $bindable(''),
		type     = 'text',
		size     = 'md',
		prefix,
		suffix,
		description,
		error,
		required = false,
		hideLabel,
		class: classOverride,
		...rest
	}: Props = $props();

	const padding = $derived(size === 'md' ? 'px-3' : 'px-2');
</script>

<Field class={classOverride} {description} {error} {hideLabel} {label} {required}>
	{#snippet children(control)}
		{#if prefix || suffix}
			<!-- The box is the wrapper so the unit sits inside the border; the unit is read as part of the description -->
			<div
				class={[
					'flex items-center rounded border-2 border-border-strong bg-surface font-sans text-text',
					'focus-within:border-primary-strong focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-strong',
					'has-[[aria-invalid=true]]:border-danger has-disabled:border-border has-disabled:bg-surface-alt has-disabled:text-muted',
					controlHeights[size],
				]}
			>
				{#if prefix}
					<span id="{control.id}-prefix" class={['shrink-0 text-muted', padding]}>{prefix}</span>
				{/if}
				<input
					class={['h-full w-full min-w-0 border-0 bg-transparent font-sans focus:ring-0 focus:outline-none disabled:cursor-not-allowed', padding, prefix && 'pl-0']}
					{required}
					{type}
					bind:value
					{...control}
					aria-describedby={[control['aria-describedby'], prefix && `${control.id}-prefix`, suffix && `${control.id}-suffix`].filter(Boolean).join(' ')}
					{...rest}
				/>
				{#if suffix}
					<span id="{control.id}-suffix" class={['shrink-0 text-muted', padding]}>{suffix}</span>
				{/if}
			</div>
		{:else}
			<input
				class={['w-full', controlBox, controlHeights[size], padding]}
				{required}
				{type}
				bind:value
				{...control}
				{...rest}
			/>
		{/if}
	{/snippet}
</Field>
