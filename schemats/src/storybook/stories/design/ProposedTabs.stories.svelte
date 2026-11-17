<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ChevronDown, CircleAlert, ClockAlert, OctagonAlert } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { Select } from '$lib/components/forms';
	import { Tabs, TabItem } from '$lib/components/Tabs';

	const { Story } = defineMeta({
		title: 'Design System/Proposed Tabs',
	});

	type Option = {
		key      : string,
		name     : string,
		note     : string,
		// Classes for the element around the tab strip and the panel
		wrap     : string,
		list     : string,
		tab      : string,
		active   : string,
		inactive : string,
		disabled : string,
		panel    : string,
	};

	const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong';

	// Full class names only, so Tailwind can find them.
	const options: Option[] = [
		{
			key      : 'underline',
			name     : 'A · Underline',
			note     : 'Text tabs on a hairline. The selected tab gets a 2px primary-strong underline, so thickness carries the state, not color alone. Quietest option; works for page navigation and for panels inside a card, and scrolls sideways on a phone.',
			wrap     : 'raised p-4',
			list     : 'flex gap-1 overflow-x-auto border-b border-border',
			tab      : 'shrink-0 border-b-2 px-3 py-2 text-sm font-semibold',
			active   : 'border-primary-strong text-primary-strong',
			inactive : 'cursor-pointer border-transparent text-muted hover:border-border-strong hover:text-text',
			disabled : 'cursor-not-allowed border-transparent text-muted opacity-50',
			panel    : 'pt-4',
		},
		{
			key      : 'folder',
			name     : 'B · Folder',
			note     : 'The selected tab is part of the raised card under it, with the Tabroom yellow kept as a 2px cap. Closest to classic and to the current look, and the clearest "these tabs own this card" signal. Needs the card directly below, so it suits page navigation more than tabs nested in a card.',
			wrap     : '',
			// Sits over the card's top border so the selected tab can cover it
			list     : 'relative z-10 flex gap-1 overflow-x-auto px-2',
			tab      : 'shrink-0 rounded-t-md border-x border-t-2 px-4 py-2 text-sm font-semibold',
			active   : 'border-x-border border-t-accent bg-surface text-primary-deep',
			inactive : 'cursor-pointer border-transparent text-muted hover:bg-surface-alt hover:text-text',
			disabled : 'cursor-not-allowed border-transparent text-muted opacity-50',
			panel    : 'raised -mt-px p-4',
		},
		{
			key      : 'segmented',
			name     : 'C · Segmented',
			note     : 'A sunken track with the selected segment raised out of it, built only from the elevation levels. Reads as a view switch, not navigation. Best for two to four panels inside a card (roles on a tournament card, ballot feedback); a long list of page links would not fit.',
			wrap     : 'raised p-4',
			list     : 'sunken inline-flex max-w-full gap-1 overflow-x-auto rounded-md border border-border p-1',
			tab      : 'shrink-0 rounded px-3 py-1.5 text-sm font-semibold',
			active   : 'bg-surface text-primary-strong shadow-sm',
			inactive : 'cursor-pointer text-muted hover:text-text',
			disabled : 'cursor-not-allowed text-muted opacity-50',
			panel    : 'pt-4',
		},
		{
			key      : 'pills',
			name     : 'D · Pills',
			note     : 'Each tab is a small Button: solid primary when selected, ghost primary otherwise. Reuses the Button look exactly and wraps to a second line instead of scrolling. Loudest option, and the tabs can be mistaken for actions when real buttons sit nearby.',
			wrap     : 'raised p-4',
			list     : 'flex flex-wrap gap-2',
			tab      : 'rounded border-2 px-3 py-1 text-sm font-semibold',
			active   : 'border-primary-strong bg-primary-strong text-white',
			inactive : 'cursor-pointer border-transparent text-primary-strong hover:bg-primary-soft',
			disabled : 'cursor-not-allowed border-transparent text-muted opacity-50',
			panel    : 'pt-4',
		},
	];

	const tabs = ['Invite', 'Events', 'Entries', 'Judges', 'Pairings', 'Results'];
	const disabledTab = 'Results';
	// One selected and one unselected, to show the marker in both states
	const alertTabs = ['Entries', 'Judges'];

	// A select can't draw the dot, so the marker becomes words; the disabled tab is left out
	const selectOptions = tabs
		.filter((tab) => tab !== disabledTab)
		.map((tab) => ({ value: tab, label: alertTabs.includes(tab) ? `${tab} (needs attention)` : tab }));

	// The chosen style, used by the alert and small screen stories
	const underline = options[0];
	const underlineTab = `inline-flex items-center gap-1.5 ${underline.tab} ${focus}`;

	const alertCounts: Record<string, number> = { Entries: 2, Judges: 12 };

	const alertKeys = ['dot', 'count', 'countSoft', 'icon', 'levels'];
	const smallKeys = ['select', 'menu', 'scroll', 'more'];

	// Tabs the "More" option keeps in the strip; the rest go in its menu
	const pinnedTabs = tabs.slice(0, 3);
	const overflowTabs = tabs.slice(3);
</script>

<script lang="ts">
	let selected: Record<string, string> = $state(Object.fromEntries(
		[...options.map((option) => option.key), ...alertKeys, ...smallKeys].map((key) => [key, 'Entries']),
	));

	// Open at first so the menu's contents show without a click
	let menuOpen = $state(true);
	let moreOpen = $state(false);

	const hasHiddenAlert = (key: string) => alertTabs.some((tab) => tab !== selected[key]);
</script>

{#snippet heading(name: string, note: string)}
	<h2 class="font-display text-2xl tracking-normal normal-case">{name}</h2>
	<p class="max-w-3xl px-0 text-sm">{note}</p>
{/snippet}

{#snippet demo()}
	<div class="flex flex-col gap-10 bg-page p-6 font-sans text-text">
		<section>
			{@render heading('Current', 'The component as it is today, for comparison. Link tabs and panel tabs are styled differently; this is the panel style.')}
			<div class="raised p-4">
				<Tabs label="Current tabs">
					{#each tabs as tab (tab)}
						<TabItem disabled={tab === disabledTab} open={tab === 'Entries'} title={tab}>
							<div class="pt-4 text-sm">{tab} panel</div>
						</TabItem>
					{/each}
				</Tabs>
			</div>
		</section>

		{#each options as option (option.key)}
			<section>
				{@render heading(option.name, option.note)}
				<div class={option.wrap}>
					<Select
						class     = "mb-3 sm:hidden"
						hideLabel
						label     = "{option.name} section"
						options   = {selectOptions}
						bind:value = {selected[option.key]}
					/>
					<div class="hidden sm:block">
						<div class={option.list} aria-label="{option.name} sample" role="tablist">
							{#each tabs as tab (tab)}
								<button
									id            = "{option.key}-{tab}"
									class         = "inline-flex items-center gap-1.5 {option.tab} {focus} {tab === disabledTab ? option.disabled : selected[option.key] === tab ? option.active : option.inactive}"
									aria-selected = {selected[option.key] === tab}
									disabled      = {tab === disabledTab}
									onclick       = {() => selected[option.key] = tab}
									role          = "tab"
									type          = "button"
								>
									{tab}
									{#if alertTabs.includes(tab)}
										<!-- The ring keeps the dot visible on the solid pill -->
										<span class="size-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true"></span>
										<span class="sr-only">(needs attention)</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
					<div
						class      = "{option.panel} text-sm"
						aria-label = "{option.name}: {selected[option.key]}"
						role       = "tabpanel"
					>
						{selected[option.key]} panel
					</div>
				</div>
			</section>
		{/each}
	</div>
{/snippet}

{#snippet dotMark()}
	<!-- The ring keeps the dot visible on a filled background -->
	<span class="size-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true"></span>
{/snippet}

{#snippet dot(tab: string)}
	{#if alertTabs.includes(tab)}
		{@render dotMark()}
		<span class="sr-only">(needs attention)</span>
	{/if}
{/snippet}

{#snippet count(tab: string)}
	{#if alertCounts[tab]}
		<span class="rounded-full bg-danger px-1.5 text-xs leading-5 text-white">{alertCounts[tab]}<span class="sr-only"> need attention</span></span>
	{/if}
{/snippet}

{#snippet countSoft(tab: string)}
	{#if alertCounts[tab]}
		<span class="rounded-full bg-danger-soft px-1.5 text-xs leading-5 text-danger">{alertCounts[tab]}<span class="sr-only"> need attention</span></span>
	{/if}
{/snippet}

{#snippet icon(tab: string)}
	{#if alertTabs.includes(tab)}
		<CircleAlert class="size-4 text-danger" aria-hidden="true" />
		<span class="sr-only">(needs attention)</span>
	{/if}
{/snippet}

{#snippet levels(tab: string)}
	{#if tab === 'Entries'}
		<OctagonAlert class="size-4 text-danger" aria-hidden="true" />
		<span class="sr-only">(overdue)</span>
	{:else if tab === 'Judges'}
		<ClockAlert class="size-4 text-warning" aria-hidden="true" />
		<span class="sr-only">(due soon)</span>
	{/if}
{/snippet}

{#snippet strip(key: string, marker: Snippet<[string]>, shown: string[], listClass: string)}
	<div class={listClass} aria-label="{key} sample" role="tablist">
		{#each shown as tab (tab)}
			<button
				class         = "{underlineTab} {tab === disabledTab ? underline.disabled : selected[key] === tab ? underline.active : underline.inactive}"
				aria-selected = {selected[key] === tab}
				disabled      = {tab === disabledTab}
				onclick       = {() => selected[key] = tab}
				role          = "tab"
				type          = "button"
			>
				{tab}
				{@render marker(tab)}
			</button>
		{/each}
	</div>
{/snippet}

{#snippet panel(key: string)}
	<div class="pt-4 text-sm" aria-label="{key}: {selected[key]}" role="tabpanel">{selected[key]} panel</div>
{/snippet}

<!-- The rows of a dropdown: every tab, with its marker and disabled state -->
{#snippet menuItems(key: string, shown: string[], close: () => void)}
	{#each shown as tab (tab)}
		<li>
			<button
				class        = "flex w-full items-center gap-1.5 rounded px-3 py-2 text-left text-sm {focus} {selected[key] === tab ? 'bg-primary-soft font-semibold text-primary-strong' : 'hover:bg-surface-alt'} disabled:cursor-not-allowed disabled:opacity-50"
				aria-current = {selected[key] === tab ? 'true' : undefined}
				disabled     = {tab === disabledTab}
				onclick      = {() => { selected[key] = tab; close(); }}
				type         = "button"
			>
				{tab}
				{@render dot(tab)}
			</button>
		</li>
	{/each}
{/snippet}

{#snippet alertSection(key: string, name: string, note: string, marker: Snippet<[string]>)}
	<section>
		{@render heading(name, note)}
		<div class="raised p-4">
			{@render strip(key, marker, tabs, underline.list)}
			{@render panel(key)}
		</div>
	</section>
{/snippet}

<Story name="Options">
	{@render demo()}
</Story>

<Story name="Underline: alert options">
	<div class="flex flex-col gap-10 bg-page p-6 font-sans text-text">
		{@render alertSection('dot', '1 · Dot', 'Says only "check this." Smallest and calmest; no room for how many or how urgent.', dot)}
		{@render alertSection('count', '2 · Count, solid', 'A number of things waiting, in the familiar notification style. Loudest; only works when the alert is countable.', count)}
		{@render alertSection('countSoft', '3 · Count, soft', 'The same count as a danger-soft badge, matching status badges elsewhere. Quieter, so it competes less with the selected underline.', countSoft)}
		{@render alertSection('icon', '4 · Icon', 'An alert icon after the label. Shape carries the meaning even without color, and it matches the icons on user home task rows.', icon)}
		{@render alertSection('levels', '5 · Two levels', 'The user home tones on tabs: a red octagon for overdue (Entries) and a mustard clock for due soon (Judges). Most information; needs each tab to know its level.', levels)}
	</div>
</Story>

<Story name="Underline: small screen options">
	<div class="flex flex-col gap-10 bg-page p-6 font-sans text-text">
		<section>
			{@render heading('1 · Native select', 'The form Select. Uses the phone\'s own picker, so it is the easiest to build and to use one-handed. Markers become words, a dot beside it flags an alert on a section that is not showing, and disabled tabs need a disabled option added to Select.')}
			<div class="raised w-full max-w-sm p-4">
				<div class="flex items-center gap-2">
					<Select
						class     = "flex-1"
						hideLabel
						label     = "Native select section"
						options   = {selectOptions}
						bind:value = {selected.select}
					/>
					{#if hasHiddenAlert('select')}
						{@render dotMark()}
						<span class="sr-only">Another section needs attention</span>
					{/if}
				</div>
				{@render panel('select')}
			</div>
		</section>

		<section>
			{@render heading('2 · Menu', 'A button that opens our own list on the overlay level. Rows keep the real markers and show disabled tabs, so nothing is lost from the desktop strip. More to build: focus handling, Escape, and closing on an outside tap.')}
			<div class="raised min-h-80 w-full max-w-sm p-4">
				<div class="relative">
					<button
						class         = "flex w-full items-center justify-between rounded border border-border-strong bg-surface px-3 py-2 text-sm font-semibold {focus}"
						aria-controls = "menu-rows"
						aria-expanded = {menuOpen}
						onclick       = {() => menuOpen = !menuOpen}
						type          = "button"
					>
						<span class="inline-flex items-center gap-1.5">{selected.menu} {@render dot(selected.menu)}</span>
						<span class="inline-flex items-center gap-2">
							{#if hasHiddenAlert('menu')}
								{@render dotMark()}
								<span class="sr-only">Another section needs attention</span>
							{/if}
							<ChevronDown class="size-4" aria-hidden="true" />
						</span>
					</button>
					{#if menuOpen}
						<ul id="menu-rows" class="overlay absolute inset-x-0 top-full z-10 mt-1 p-1">
							{@render menuItems('menu', tabs, () => menuOpen = false)}
						</ul>
					{/if}
				</div>
				{@render panel('menu')}
			</div>
		</section>

		<section>
			{@render heading('3 · Scrolling strip', 'No dropdown: the same tabs scroll sideways and a fade on the right edge hints that there are more. Nothing new to learn and markers stay as they are, but tabs past the edge, and any alerts on them, stay out of sight until the user scrolls.')}
			<div class="raised w-full max-w-sm p-4">
				<div class="relative">
					{@render strip('scroll', dot, tabs, underline.list)}
					<div class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-surface to-transparent"></div>
				</div>
				{@render panel('scroll')}
			</div>
		</section>

		<section>
			{@render heading('4 · Strip with More', 'The first tabs stay as tabs and the rest move into a More menu, which carries a dot when a tab inside it has an alert. Keeps the main sections one tap away. Needs a rule for which tabs stay, and measuring to know how many fit.')}
			<div class="raised min-h-64 w-full max-w-sm p-4">
				<div class="flex border-b border-border">
					{@render strip('more', dot, pinnedTabs, 'flex gap-1')}
					<div class="relative ml-auto">
						<button
							class         = "{underlineTab} {overflowTabs.includes(selected.more) ? underline.active : underline.inactive}"
							aria-controls = "more-rows"
							aria-expanded = {moreOpen}
							onclick       = {() => moreOpen = !moreOpen}
							type          = "button"
						>
							{overflowTabs.includes(selected.more) ? selected.more : 'More'}
							{#if overflowTabs.some((tab) => alertTabs.includes(tab))}
								{@render dotMark()}
								<span class="sr-only">(a section here needs attention)</span>
							{/if}
							<ChevronDown class="size-4" aria-hidden="true" />
						</button>
						{#if moreOpen}
							<ul id="more-rows" class="overlay absolute top-full right-0 z-10 mt-1 w-44 p-1">
								{@render menuItems('more', overflowTabs, () => moreOpen = false)}
							</ul>
						{/if}
					</div>
				</div>
				{@render panel('more')}
			</div>
		</section>
	</div>
</Story>

<!-- Below sm the tab strip becomes a select -->
<Story name="Phone width" globals={{ viewport: { value: 'mobile2', isRotated: false } }}>
	{@render demo()}
</Story>
