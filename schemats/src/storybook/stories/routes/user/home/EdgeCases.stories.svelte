<script lang="ts" module>
	/*
	 * Cards at their limits: many conflicts and questionnaires, two judge
	 * rows, a prefs-only coach, online rooms, and phone width. Mock /user/home
	 * data from ./fixtures.ts.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import {
		getRestTournsPrepRoomsJoinMockHandler,
		getRestTournsRoomJoinMockHandler,
		getRestTournsSchoolsRoomJoinMockHandler,
		getRestTournsSectionsRoomJoinMockHandler,
	} from '$indexcards/index.msw';
	import TournCard from '../../../../../routes/user/home/TournCard.svelte';
	import { freezeTime } from '../../../../utils/freezeTime';
	import * as fx from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Edge cases',
		parameters: { layout: 'padded' },
		beforeEach: () => freezeTime(fx.now),
	});

	const joined = { url: 'https://zoom.test/room', token: null, password: null };

	// Every room join answers with a plain video link, so the buttons work in review
	const online = {
		msw: {
			handlers: [
				getRestTournsSchoolsRoomJoinMockHandler(joined),
				getRestTournsPrepRoomsJoinMockHandler(joined),
				getRestTournsRoomJoinMockHandler(joined),
				getRestTournsSectionsRoomJoinMockHandler(joined),
			],
		},
	};
</script>

<Story name="Many conflicts and questionnaires">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetBusy} /></div>{/snippet}
</Story>

<Story name="Two judge rows">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetTwoJudgeRows} /></div>{/snippet}
</Story>

<Story name="Prefs-only coach">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.gulfCoastPrefsOnly} /></div>{/snippet}
</Story>

<Story name="Online: coach and judge" parameters={online}>
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetOnlineCoachJudge} /></div>{/snippet}
</Story>

<Story name="Ballot rows">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetBallotRows} /></div>{/snippet}
</Story>

<!-- The judge is on Eastern time, so the online round's start also shows their own time -->
<Story
	name="Online: judge with a Campus ballot"
	parameters={{ ...online, session: { Person: { id: fx.avery.id, first: fx.avery.first, last: fx.avery.last, email: fx.avery.email, tz: 'America/New_York' } } }}
>
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetOnlineJudge} /></div>{/snippet}
</Story>

<Story name="Standby and training">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetStandbyTraining} /></div>{/snippet}
</Story>

<Story name="Online: competitor" parameters={online}>
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={fx.bluebonnetOnlineCompetitor} /></div>{/snippet}
</Story>

<Story name="Phone width" globals={{ viewport: { value: 'mobile2', isRotated: false } }}>
	{#snippet template()}<TournCard tourn={fx.bluebonnetCoachJudge} />{/snippet}
</Story>
