<script lang='ts'>
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Tooltip } from 'flowbite-svelte';
	import { setTabsContext, type TabEntry } from './context';

	type Props = {
		children      : Snippet,
		label?        : string,
		class?        : string,
		contentClass? : string,
		// Panel tabs: called with the newly selected tab's title when the user picks another
		onchange?     : (title: string) => void,
	};

	let {
		children,
		label        = 'Tabs',
		class        : className = '',
		contentClass = 'pt-4',
		onchange,
	}: Props = $props();

	let items: TabEntry[] = $state.raw([]);

	// The panel tab the user picked; until then `open` or the first usable tab wins
	let chosenId: string | undefined = $state();

	setTabsContext({
		register: (entry) => {
			items = [...items, entry];
		},
		unregister: (id) => {
			items = items.filter( (item) => item.id !== id);
		},
	});

	const linkMode = $derived(items.some( (item) => item.href));

	// Link tab matching the current page. Exact matches always win.
	const activeLinkId = $derived.by( () => {
		const path = page.url.pathname;

		return (items.find( (item) => item.href === path)
			?? items.find( (item) =>
				(item.href && !item.exact && path.includes(item.href))
				|| item.matchPatterns?.some( (pattern) => path.includes(pattern))
			))?.id;
	});

	const selectedPanel = $derived(
		items.find( (item) => item.id === chosenId && !item.disabled)
		?? items.find( (item) => item.open && !item.disabled)
		?? items.find( (item) => !item.disabled)
	);

	const activeId = $derived(linkMode ? activeLinkId : selectedPanel?.id);

	const choose = (item: TabEntry) => {
		if (item.disabled || item.id === selectedPanel?.id) return;
		chosenId = item.id;
		onchange?.(item.title);
	};

	// Manual activation: arrows move focus and Enter or Space selects, so onchange
	// (which saves ballot feedback) doesn't fire on every arrow press
	const moveFocus = (event: KeyboardEvent) => {
		const tabs = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=tab]')];
		const from = tabs.indexOf(document.activeElement as HTMLElement);
		const to = {
			ArrowRight : (from + 1) % tabs.length,
			ArrowLeft  : (from - 1 + tabs.length) % tabs.length,
			Home       : 0,
			End        : tabs.length - 1,
		}[event.key];

		if (to === undefined || from === -1) return;
		event.preventDefault();
		tabs[to].focus();
	};

	const stripClass = 'flex gap-1 overflow-x-auto border-b border-border';

	// The outline sits inside the tab because the scrolling strip clips anything outside it
	const tabClass = `
		inline-flex shrink-0 items-center gap-1.5
		border-b-2 px-3 py-2
		text-sm font-semibold
		focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-strong
	`;

	const stateClass = (item: TabEntry) => item.disabled
		? 'cursor-not-allowed border-transparent text-muted opacity-50'
		: item.id === activeId
			? 'border-primary-strong text-primary-strong'
			: 'cursor-pointer border-transparent text-muted hover:border-border-strong hover:text-text';
</script>

<!-- TabItems only register themselves here; they render nothing. -->
{@render children()}

{#snippet title(item: TabEntry)}
	{item.title}
	{#if item.alert}
		<!-- The ring keeps the dot visible on a filled background -->
		<span class='size-2 rounded-full bg-danger ring-2 ring-surface' aria-hidden='true'></span>
		<span class='sr-only'>(needs attention)</span>
	{/if}
{/snippet}

<div class='tabs {className}'>
	{#if linkMode}
		<nav aria-label={label}>
			<ul class={stripClass}>
				{#each items as item (item.id)}
					<li class='shrink-0'>
						{#if item.disabled || !item.href}
							<!-- Focusable so keyboard users can reach the tooltip -->
							<span
								id            = {item.id}
								class         = '{tabClass} {stateClass(item)}'
								aria-disabled = 'true'
								role          = 'link'
								tabindex      = '0'
							>
								{@render title(item)}
							</span>
						{:else}
							<a
								id           = {item.id}
								class        = '{tabClass} {stateClass(item)}'
								aria-current = {item.id === activeId ? 'page' : undefined}
								href         = {item.href}
							>
								{@render title(item)}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>
	{:else}
		<div class={stripClass} aria-label={label} onkeydown={moveFocus} role='tablist' tabindex='-1'>
			{#each items as item (item.id)}
				<!-- Disabled tabs stay focusable (aria-disabled, not disabled) so their tooltip can be reached -->
				<button
					id            = {item.id}
					class         = '{tabClass} {stateClass(item)}'
					aria-controls = '{item.id}-panel'
					aria-disabled = {item.disabled || undefined}
					aria-selected = {item.id === activeId}
					onclick       = {() => choose(item)}
					role          = 'tab'
					tabindex      = {item.id === activeId ? 0 : -1}
					type          = 'button'
				>
					{@render title(item)}
				</button>
			{/each}
		</div>

		{#if selectedPanel}
			<div
				id              = '{selectedPanel.id}-panel'
				class           = {contentClass}
				aria-labelledby = {selectedPanel.id}
				role            = 'tabpanel'
				tabindex        = '0'
			>
				{@render selectedPanel.children?.()}
			</div>
		{/if}
	{/if}

	{#each items as item (item.id)}
		{#if item.tooltip}
			<Tooltip placement='bottom' triggeredBy='#{item.id}'>{item.tooltip}</Tooltip>
		{/if}
	{/each}
</div>
