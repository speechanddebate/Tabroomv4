<script lang='ts'>
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { ChevronDown } from '@lucide/svelte';
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

	const id = $props.id();
	let menuOpen = $state(false);
	let menuEl: HTMLElement | undefined = $state();
	let menuButton: HTMLButtonElement | undefined = $state();

	const closeMenu = (refocus: boolean) => {
		menuOpen = false;
		if (refocus) menuButton?.focus();
	};

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
	const activeItem = $derived(items.find( (item) => item.id === activeId));

	// The menu button only shows the current tab, so it flags alerts on the others
	const hasHiddenAlert = $derived(items.some( (item) => item.alert && item.id !== activeId));

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

	// Below sm the strip gives way to the menu
	const stripClass = 'hidden gap-1 overflow-x-auto border-b border-border sm:flex';

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

	const rowClass = `
		flex w-full flex-col items-start rounded px-3 py-2
		text-left text-sm
		focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-strong
	`;

	const rowStateClass = (item: TabEntry) => item.disabled
		? 'cursor-not-allowed'
		: item.id === activeId
			? 'bg-primary-soft font-semibold text-primary-strong'
			: 'text-text hover:bg-surface-alt';
</script>

<svelte:window
	onpointerdown = {(event) => {
		if (menuOpen && !menuEl?.contains(event.target as Node)) closeMenu(false);
	}}
/>

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

<!-- Touch has no hover, so the tooltip text shows under the row instead -->
{#snippet rowContent(item: TabEntry)}
	<span class='inline-flex items-center gap-1.5 {item.disabled ? 'text-muted opacity-50' : ''}'>{@render title(item)}</span>
	{#if item.tooltip}
		<span class='text-xs font-normal text-muted'>{item.tooltip}</span>
	{/if}
{/snippet}

{#snippet menu()}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this = {menuEl}
		class     = 'relative sm:hidden'
		onkeydown = {(event) => {
			if (event.key === 'Escape' && menuOpen) {
				event.preventDefault();
				closeMenu(true);
			}
		}}
	>
		<button
			bind:this     = {menuButton}
			class         = '
				flex w-full items-center justify-between gap-2
				rounded border border-border-strong bg-surface px-3 py-2
				text-sm font-semibold
				focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong
			'
			aria-controls = '{id}-menu'
			aria-expanded = {menuOpen}
			onclick       = {() => menuOpen = !menuOpen}
			type          = 'button'
		>
			<span class='inline-flex items-center gap-1.5'>
				<span class='sr-only'>{label}:</span>
				{#if activeItem}
					{@render title(activeItem)}
				{:else}
					{label}
				{/if}
			</span>
			<span class='inline-flex items-center gap-2'>
				{#if hasHiddenAlert}
					<span class='size-2 rounded-full bg-danger' aria-hidden='true'></span>
					<span class='sr-only'>(another section needs attention)</span>
				{/if}
				<ChevronDown class='size-4 transition-transform {menuOpen ? 'rotate-180' : ''}' aria-hidden='true' />
			</span>
		</button>

		{#if menuOpen}
			<ul id='{id}-menu' class='overlay absolute inset-x-0 top-full z-20 mt-1 p-1'>
				{#each items as item (item.id)}
					<li>
						{#if linkMode && (item.disabled || !item.href)}
							<span class='{rowClass} {rowStateClass(item)}' aria-disabled='true' role='link'>
								{@render rowContent(item)}
							</span>
						{:else if linkMode}
							<a
								class        = '{rowClass} {rowStateClass(item)}'
								aria-current = {item.id === activeId ? 'page' : undefined}
								href         = {item.href}
								onclick      = {() => closeMenu(false)}
							>
								{@render rowContent(item)}
							</a>
						{:else}
							<button
								class        = '{rowClass} {rowStateClass(item)}'
								aria-current = {item.id === activeId ? 'true' : undefined}
								disabled     = {item.disabled}
								onclick      = {() => {
									choose(item);
									closeMenu(true);
								}}
								type         = 'button'
							>
								{@render rowContent(item)}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<div class='tabs {className}'>
	{#if linkMode}
		<nav aria-label={label}>
			{@render menu()}
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
		{@render menu()}
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
