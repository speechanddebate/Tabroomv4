<script lang='ts'>
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Tabs as FlowbiteTabs, TabItem as FlowbiteTabItem, Tooltip } from 'flowbite-svelte';
	import { setTabsContext, type TabEntry } from './context';

	type Props = {
		children      : Snippet,
		label?        : string,
		class?        : string,
		contentClass? : string,
	};

	let {
		children,
		label        = 'Tabs',
		class        : className = '',
		contentClass = 'mt-0 rounded',
	}: Props = $props();

	let items: TabEntry[] = $state.raw([]);

	setTabsContext({
		register: (entry) => {
			items = [...items, entry];
		},
		unregister: (id) => {
			items = items.filter( (item) => item.id !== id);
		},
	});

	// Links render as our own nav; panels render through flowbite's tabs,
	// which track the selected panel themselves.
	const linkMode = $derived(items.some( (item) => item.href));

	// Link tab matching the current page. Exact matches always win.
	const activeId = $derived.by( () => {
		const path = page.url.pathname;

		return (items.find( (item) => item.href === path)
			?? items.find( (item) =>
				(item.href && !item.exact && path.includes(item.href))
				|| item.matchPatterns?.some( (pattern) => path.includes(pattern))
			))?.id;
	});

	// The accent line under the strip, in both modes.
	const stripClass = `
		flex space-x-2 rtl:space-x-reverse overflow-x-auto
		border-b-2 border-accent
	`;

	const tabBase = `
		inline-block p-2 px-4
		rounded-t-sm
		text-sm text-center
		font-semibold
	`;

	const disabledClass = `
		text-muted
		bg-page
		cursor-not-allowed
	`;

	const linkActiveClass = `
		text-primary-strong
		bg-surface
		hover:text-primary-deep hover:bg-surface-alt
	`;

	const linkInactiveClass = `
		text-text
		bg-page
		hover:bg-accent-soft
	`;

	const panelActiveClass = `
		text-primary-strong
		bg-primary-soft
	`;

	const panelInactiveClass = `
		hover:text-primary-deep hover:bg-accent-soft
	`;

</script>

<!-- TabItems only register themselves here; they render nothing. -->
{@render children()}

<div class='tabs {className}'>
	{#if linkMode}
		<nav aria-label={label}>
			<ul class={stripClass}>
				{#each items as item (item.id)}
					<li class='group shrink-0 focus-within:z-10'>
						{#if item.disabled}
							<!-- Focusable so keyboard users can reach the tooltip -->
							<span
								class         = '{tabBase} {disabledClass}'
								aria-disabled = 'true'
								role          = 'link'
								tabindex      = '0'
							>
								{item.title}
							</span>
						{:else}
							<a
								class        = '{tabBase} {item.id === activeId ? linkActiveClass : linkInactiveClass}'
								aria-current = {item.id === activeId ? 'page' : undefined}
								href         = {item.href}
							>
								{item.title}
							</a>
						{/if}
						{#if item.tooltip}
							<Tooltip placement='bottom'>{item.tooltip}</Tooltip>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>
	{:else}
		<FlowbiteTabs
			class      = {stripClass}
			aria-label = {label}
			classes    = {{ content: contentClass }}
			divider    = {false}
		>
			{#each items as item (item.id)}
				<FlowbiteTabItem
					activeClass   = '{tabBase} {panelActiveClass}'
					disabled      = {item.disabled}
					inactiveClass = '{tabBase} {item.disabled ? disabledClass : panelInactiveClass}'
					key           = {item.id}
					open          = {item.open}
					title         = {item.title}
				>
					{@render item.children?.()}
				</FlowbiteTabItem>
			{/each}
		</FlowbiteTabs>

		<!--
			A Tooltip with no triggeredBy attaches to its previous sibling, which here
			is flowbite's role=presentation <li>, and makes it focusable.
			if we ever get rid of flowbite, we can probably preserve this tooltip behavior 
			by attaching it directly to the tab button.
		-->
		{#each items as item (item.id)}
			{#if item.tooltip}
				<Tooltip placement='bottom' triggeredBy='#{item.id}'>{item.tooltip}</Tooltip>
			{/if}
		{/each}
	{/if}
</div>