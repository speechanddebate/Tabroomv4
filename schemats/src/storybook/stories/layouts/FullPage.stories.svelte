<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { faker } from '@faker-js/faker';
	import { fn } from 'storybook/test';
	import AppShell from '$lib/layouts/AppShell.svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import Chapters from '../../../routes/user/(sidebar)/Chapters.svelte';
	import Judging from '../../../routes/user/(sidebar)/Judging.svelte';
	import UserAccount from '../../../routes/user/(sidebar)/userAccount.svelte';
	import { getUserChaptersResponseMock } from '$indexcards/index.msw';

	/*
	 * The whole app frame (header, gradient, footer) around the two kinds of
	 * page body: full width, and WithSidebar. Each comes in a short and a tall
	 * version so you can see how the page height reacts to the sidebar.
	 */
	const { Story } = defineMeta({
		title: 'Layouts/Page',
		component: AppShell,
		args: {
			logoutFn: fn(),
			suEndFn: fn(),
		},
		parameters: {
			layout: 'fullscreen',
			session: {
				Person: {
					first: faker.person.firstName(),
					last: faker.person.lastName(),
					email: faker.internet.email(),
					id: faker.number.int(),
					tz: 'UTC',
				},
			},
			a11y: {
				config: {
					rules: [
						// Flowbite Menu.svelte bug: SVG has role="button" tabindex="0" hardcoded
						// inside the NavHamburger's <button>, causing a false nested-interactive violation.
						// https://github.com/themesberg/flowbite-svelte/blob/main/src/lib/navbar/Menu.svelte
						{ id: 'nested-interactive', enabled: false },
					],
				},
			},
		},
	});

	const chapters = getUserChaptersResponseMock().slice(0, 3);

	const eventAbbrs = ['LD', 'PF', 'CX', 'OO', 'DI', 'HI', 'INF', 'USX'];

	const rounds = Array.from({ length: 40 }, (_, idx) => ({
		id: idx + 1,
		event: eventAbbrs[idx % eventAbbrs.length],
		round: Math.floor(idx / eventAbbrs.length) + 1,
		aff: `${faker.location.city()} ${faker.string.alpha({ length: 2, casing: 'upper' })}`,
		neg: `${faker.location.city()} ${faker.string.alpha({ length: 2, casing: 'upper' })}`,
		judge: faker.person.fullName(),
		room: `Room ${faker.number.int({ min: 100, max: 350 })}`,
	}));

	const paragraphs = Array.from({ length: 4 }, () => faker.lorem.paragraph({ min: 4, max: 8 }));
</script>

<script lang="ts">
	// State for the "Sidebar Controls Page" story. In a real page this lives in
	// the page's own script, and the sidebar snippet closes over it.
	let selectedEvent = $state<string | null>(null);
	let showRooms = $state(true);

	const visibleRounds = $derived(
		selectedEvent ? rounds.filter((r) => r.event === selectedEvent) : rounds
	);
</script>

{#snippet shortContent()}
	<h2>Short Page</h2>
	<h3>Nothing Scheduled</h3>
	<p>
		Only a heading and a sentence, like user home with no tournaments. The
		frame's minimum height decides how tall the page is, so opening and
		closing the sidebar shouldn't change it.
	</p>
{/snippet}

{#snippet roundsTable(list: typeof rounds, withRooms: boolean)}
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-border-strong text-left">
				<th class="p-2">Event</th>
				<th class="p-2">Rd</th>
				<th class="p-2">Aff</th>
				<th class="p-2">Neg</th>
				<th class="p-2">Judge</th>
				{#if withRooms}
					<th class="p-2">Room</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each list as row (row.id)}
				<tr class="border-b border-border hover:bg-accent-soft">
					<td class="p-2">{row.event}</td>
					<td class="p-2">{row.round}</td>
					<td class="p-2">{row.aff}</td>
					<td class="p-2">{row.neg}</td>
					<td class="p-2">{row.judge}</td>
					{#if withRooms}
						<td class="p-2">{row.room}</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#snippet tallContent()}
	<h2>Tall Page</h2>
	<p>
		A full table and some prose, taller than the viewport, so the page
		scrolls. The sidebar column should stretch to the bottom while its
		contents stick to the top of the viewport.
	</p>

	<h3>Pairings</h3>

	{@render roundsTable(rounds, true)}

	{#each paragraphs as paragraph, idx (idx)}
		<p>{paragraph}</p>
	{/each}
{/snippet}

{#snippet userSidebar()}
	<Chapters {chapters} />
	<Judging />
	<UserAccount />
{/snippet}

{#snippet tallSidebar()}
	<Chapters {chapters} />
	<Judging />
	<UserAccount />
	<div class="sidenote">
		<h4>Events</h4>
		{#each { length: 4 } as _, pass (pass)}
			{#each eventAbbrs as abbr (abbr)}
				<a class="full blue" href="/" onclick={(e) => e.preventDefault()}>
					{abbr} Round {pass + 1}
				</a>
			{/each}
		{/each}
	</div>
{/snippet}

<Story name="Full Page Short">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			{@render shortContent()}
		</AppShell>
	{/snippet}
</Story>

<Story name="Full Page Tall">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			{@render tallContent()}
		</AppShell>
	{/snippet}
</Story>

<Story name="Sidebar Short Page">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			<WithSidebar>
				{@render shortContent()}
				{#snippet sidebar()}
					{@render userSidebar()}
				{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>

<Story name="Sidebar Tall Page">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			<WithSidebar>
				{@render tallContent()}
				{#snippet sidebar()}
					{@render userSidebar()}
				{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>

<Story name="Sidebar Closed Short Page">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			<WithSidebar sidebarOpen={false}>
				{@render shortContent()}
				{#snippet sidebar()}
					{@render userSidebar()}
				{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>

<Story name="Tall Sidebar Short Page">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			<WithSidebar>
				{@render shortContent()}
				{#snippet sidebar()}
					{@render tallSidebar()}
				{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>

<Story name="Sidebar Controls Page">
	{#snippet template(args)}
		<AppShell logoutFn={args.logoutFn} suEndFn={args.suEndFn}>
			<WithSidebar>
				<h2>{selectedEvent ?? 'All'} Pairings</h2>
				<p>
					The sidebar snippet reads and writes this page's state directly.
					Picking an event filters the table, and on mobile also closes
					the drawer through <code>closeDrawer</code>.
				</p>
				{@render roundsTable(visibleRounds, showRooms)}

				{#snippet sidebar({ closeDrawer })}
					<div class="sidenote">
						<h3>Events</h3>
						{#each [null, ...eventAbbrs] as abbr (abbr ?? 'all')}
							<button
								class="
									block w-full text-left p-1 ps-2 text-sm
									border-s-2 border-primary border-y border-y-border
									hover:bg-page
									{selectedEvent === abbr ? 'bg-accent-soft font-semibold' : 'bg-surface-alt'}
								"
								onclick={() => { selectedEvent = abbr; closeDrawer(); }}
							>
								{abbr ?? 'All events'}
							</button>
						{/each}
					</div>
					<div class="sidenote">
						<h3>Display</h3>
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" bind:checked={showRooms} />
							Show rooms
						</label>
					</div>
				{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>
