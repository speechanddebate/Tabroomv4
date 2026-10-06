<script lang="ts">
	import { Tooltip } from 'flowbite-svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Color = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'tertiary';
	type Variant = 'solid' | 'outline' | 'ghost';
	type Size = 'sm' | 'md';

	type Props = {
		children : Snippet,
		color?   : Color,
		variant? : Variant,
		size?    : Size,
		// Makes this an icon-only button: used as the accessible name and shown as a tooltip.
		label?    : string,
		href?     : string,
		type?     : 'button' | 'submit' | 'reset',
		disabled? : boolean,
		class?    : string,
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'children' | 'class' | 'color' | 'disabled' | 'href' | 'type'>;

	let {
		children,
		color    = 'default',
		variant  = 'solid',
		size     = 'md',
		label,
		href,
		type     = 'button',
		disabled = false,
		class: classOverride,
		...rest
	}: Props = $props();

	// Full class names only, so Tailwind can find them.
	const styles: Record<Variant, Record<Color, string>> = {
		solid: {
			default  : 'border-muted bg-muted text-white hover:border-text hover:bg-text',
			primary  : 'border-primary-strong bg-primary-strong text-white hover:border-primary-deep hover:bg-primary-deep',
			success  : 'border-success bg-success text-white hover:bg-success-soft hover:text-success',
			warning  : 'border-warning bg-warning text-white hover:bg-warning-soft hover:text-warning',
			danger   : 'border-danger bg-danger text-white hover:bg-danger-soft hover:text-danger',
			tertiary : 'border-tertiary bg-tertiary text-white hover:bg-tertiary-soft hover:text-tertiary',
		},
		outline: {
			default  : 'border-border-strong bg-surface text-text hover:border-text hover:bg-surface-alt',
			primary  : 'border-primary-strong bg-surface text-primary-strong hover:bg-primary-strong hover:text-white',
			success  : 'border-success bg-surface text-success hover:bg-success hover:text-white',
			warning  : 'border-warning bg-surface text-warning hover:bg-warning hover:text-white',
			danger   : 'border-danger bg-surface text-danger hover:bg-danger hover:text-white',
			tertiary : 'border-tertiary bg-surface text-tertiary hover:bg-tertiary hover:text-white',
		},
		ghost: {
			default  : 'border-transparent text-text hover:bg-surface-alt',
			primary  : 'border-transparent text-primary-strong hover:bg-primary-soft',
			success  : 'border-transparent text-success hover:bg-success-soft',
			warning  : 'border-transparent text-warning hover:bg-warning-soft',
			danger   : 'border-transparent text-danger hover:bg-danger-soft',
			tertiary : 'border-transparent text-tertiary hover:bg-tertiary-soft',
		},
	};

	const sizes: Record<Size, { text: string, icon: string }> = {
		sm : { text: 'px-2 py-1 text-xs', icon: 'p-1' },
		md : { text: 'px-4 py-2 text-sm', icon: 'p-1.5' },
	};

	let classes = $derived([
		'inline-flex items-center justify-center gap-2 rounded border-2 font-semibold transition cursor-pointer',
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong',
		'disabled:pointer-events-none disabled:opacity-50',
		'aria-disabled:pointer-events-none aria-disabled:opacity-50',
		styles[variant][color],
		label ? sizes[size].icon : sizes[size].text,
		classOverride,
	]);
</script>

{#if href}
	<!-- A link cannot be disabled, so drop the href and mark it instead. -->
	<a
		class         = {classes}
		aria-disabled = {disabled || undefined}
		aria-label    = {label}
		href          = {disabled ? undefined : href}
		{...rest}
	>
		{@render children()}
	</a>
{:else}
	<button
		class      = {classes}
		aria-label = {label}
		{disabled}
		{type}
		{...rest}
	>
		{@render children()}
	</button>
{/if}
{#if label}
	<Tooltip placement="bottom">{label}</Tooltip>
{/if}
