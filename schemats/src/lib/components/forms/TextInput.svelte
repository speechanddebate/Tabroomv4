<script lang="ts">
	import { Copy, CopyCheck, CopyX, Eye, EyeOff } from '@lucide/svelte';
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
		// Adds a button that copies the value
		copyable?    : boolean,
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
		copyable = false,
		class: classOverride,
		...rest
	}: Props = $props();

	const padding = $derived(size === 'md' ? 'px-3' : 'px-2');	const iconSize = $derived(size === 'md' ? 18 : 14);
	const iconButton = $derived([
		'flex h-full shrink-0 cursor-pointer items-center rounded text-muted hover:text-text',
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong',
		'disabled:cursor-not-allowed disabled:hover:text-muted',
		padding,
	]);

	let revealed = $state(false);

	let copyState: 'idle' | 'copied' | 'failed' = $state('idle');
	let copyReset: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		clearTimeout(copyReset);
		try {
			await navigator.clipboard.writeText(value);
			copyState = 'copied';
		} catch {
			// Refused permission or an insecure origin
			copyState = 'failed';
		}
		copyReset = setTimeout(() => (copyState = 'idle'), 2000);
	}
</script>

<Field class={classOverride} {description} {error} {hideLabel} {label} {required}>
	{#snippet children(control)}
		{#if prefix || suffix || type === 'password' || copyable}
			<!-- The box is the wrapper so a unit or button sits inside the border; a unit is read as part of the description.
			     It outlines on the input's focus only, so a button shows its own outline -->
			<div
				class={[
					'flex items-center rounded border-2 border-border-strong bg-surface font-sans text-text',
					'has-[input:focus]:border-primary-strong has-[input:focus]:outline-2 has-[input:focus]:outline-offset-2 has-[input:focus]:outline-primary-strong',
					'has-[[aria-invalid=true]]:border-danger has-disabled:border-border has-disabled:bg-surface-alt has-disabled:text-muted',					controlHeights[size],
				]}
			>
				{#if prefix}
					<span id="{control.id}-prefix" class={['shrink-0 text-muted', padding]}>{prefix}</span>
				{/if}
				<input
					class={['h-full w-full min-w-0 border-0 bg-transparent font-sans focus:ring-0 focus:outline-none disabled:cursor-not-allowed', padding, prefix && 'pl-0']}
					{required}
					type={revealed ? 'text' : type}
					bind:value
					{...control}
					aria-describedby={[control['aria-describedby'], prefix && `${control.id}-prefix`, suffix && `${control.id}-suffix`].filter(Boolean).join(' ') || undefined}
					{...rest}
				/>
				{#if suffix}
					<span id="{control.id}-suffix" class={['shrink-0 text-muted', padding]}>{suffix}</span>
				{/if}
				{#if type === 'password'}
					<!-- A toggle keeps one name and reports its state through aria-pressed -->
					<button
						class={iconButton}
						aria-controls={control.id}
						aria-label="Show password"
						aria-pressed={revealed}
						disabled={rest.disabled}
						onclick={() => (revealed = !revealed)}
						type="button"
					>
						{#if revealed}
							<EyeOff aria-hidden="true" size={iconSize} />
						{:else}
							<Eye aria-hidden="true" size={iconSize} />
						{/if}
					</button>
				{/if}
				{#if copyable}
					<!-- Stays enabled on a disabled field: the value is still shown, and copying changes nothing -->
					<button class={iconButton} aria-label="Copy {label}" onclick={copy} type="button">
						{#if copyState === 'copied'}
							<CopyCheck class="text-success" aria-hidden="true" size={iconSize} />
						{:else if copyState === 'failed'}
							<CopyX class="text-danger" aria-hidden="true" size={iconSize} />
						{:else}
							<Copy aria-hidden="true" size={iconSize} />
						{/if}
					</button>
					<!-- In the page from the start, so the change is announced -->
					<span class="sr-only" role="status">
						{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Couldn\'t copy' : ''}
					</span>
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
