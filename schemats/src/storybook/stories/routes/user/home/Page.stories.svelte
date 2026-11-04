<script lang="ts" module>
	/*
	 * The whole user home in the app shell, served mock /user/home responses
	 * from ./fixtures.ts, and the page states outside tournament cards.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import type { HomeResponse } from '@tabroom/types';
	import { getUserHomeMockHandler } from '$indexcards/index.msw';
	import AppShell from '$lib/layouts/AppShell.svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import Chapters from '../../../../../routes/user/(sidebar)/Chapters.svelte';
	import Judging from '../../../../../routes/user/(sidebar)/Judging.svelte';
	import UserAccount from '../../../../../routes/user/(sidebar)/userAccount.svelte';
	import HomePage from '../../../../../routes/user/home/+page.svelte';
	import type { UserChapter } from '$indexcards/schemas';
	import { freezeTime } from '../../../../utils/freezeTime';
	import * as fx from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Page',
		parameters: { layout: 'padded' },
		beforeEach: () => freezeTime(fx.now),
	});

	const serve = (home: HomeResponse) => ({ msw: { handlers: [getUserHomeMockHandler(home)] } });

	const session = (person: typeof fx.avery) => ({
		Person: { first: person.first, last: person.last, email: person.email, id: person.id, tz: 'America/Chicago' },
	});

	const shell = {
		layout  : 'fullscreen',
		session : session(fx.avery),
		a11y    : { config: { rules: [{ id: 'nested-interactive', enabled: false }] } }, // Flowbite hamburger, see Layouts/Page
	};

	const chapters = [fx.avery.chapter] as UserChapter[];

	const logoutFn = fn(async () => {});
	const suEndFn = fn(async () => {});
</script>

{#snippet userSidebar()}
	<Chapters {chapters} />
	<Judging />
	<UserAccount />
{/snippet}

<Story name="Full page: coach, judge, and tab staff" parameters={{ ...shell, ...serve(fx.averyHome) }}>
	{#snippet template()}
		<AppShell {logoutFn} {suEndFn}>
			<WithSidebar>
				<HomePage />
				{#snippet sidebar()}{@render userSidebar()}{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>

<Story name="Full page: competitor" parameters={{ ...shell, session: session(fx.maya), ...serve(fx.mayaHome) }}>
	{#snippet template()}
		<AppShell {logoutFn} {suEndFn}>
			<WithSidebar>
				<HomePage />
				{#snippet sidebar()}<UserAccount />{/snippet}
			</WithSidebar>
		</AppShell>
	{/snippet}
</Story>

<Story name="Alerts" parameters={serve({ now: fx.now, Alerts: fx.alerts.all, Tourns: [fx.noviceNightTab] })}>
	{#snippet template()}<div class="max-w-4xl"><HomePage /></div>{/snippet}
</Story>

<Story name="Empty state: no roles yet" parameters={serve(fx.emptyHome)}>
	{#snippet template()}<HomePage />{/snippet}
</Story>
