<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BallotLayout from '../../../../../../routes/user/judge/ballot/BallotLayout.svelte';
	import { debateContext, feedbackFor } from './fixtures';

	// Layout elements every event type shares. Stories use a debate context
	// as the carrier; event-specific differences go in that type's file.
	const { Story } = defineMeta({
		title: 'Routes/User/Judge/Ballot/General',
		component: BallotLayout,
		args: { judgeId: 1, panelId: 1 },
		parameters: {
			layout: 'fullscreen',
		},
	});

	const [aff, neg] = debateContext().Entries;

	const notedEntries = [
		{ ...aff, notes: 'May sit while speaking without penalty' },
		{ ...neg, notes: 'Smith may have 1 extra minute of prep\nMay use a laptop for flowing' },
	];

	// As much turned on as one debate ballot can have, to check the page when it's full
	const busy = debateContext({
		chair: true,
		Round: {
			id: 6,
			name: 6,
			label: 'Quarterfinals',
			notes: 'https://zoom.example.com/j/12345678901\n\nEmail tab with questions: tab@example.com',
		},
		flight: 2,
		onlineMode: 'sync',
		Room: { name: 'Zoom 3', joinable: true, hybrid: false, mapUrl: null },
		docShare: 'https://share.tabroom.com/quarters-flt2-room3',
		logo: '/img/tabroom-sparky.png',
		ballotHeader: '<p>Tabroom.com and the tournament are committed to fair and equitable judging. Please evaluate each debater on the arguments made in the round, without bias based on identity, appearance, school, or style of delivery.</p><p>Judges who observe or experience harassment should contact tab immediately. Your ballot is reviewed by tab staff before results are published.</p>',
		rules: [
			'<p>Please disclose your decision to the debaters after submitting your ballot.</p>',
			'<p>Do not discuss the round with coaches before your ballot is in.</p>',
			'<p>If a debater is absent at the start time, notify tab before beginning the round.</p>',
		],
		scoring: {
			winloss: { lpw: 'forbid' },
			points: { min: 26, max: 30, step: 0.1, ties: false, team: false, ranksAgree: true },
			ranks: {},
			feedback: feedbackFor(notedEntries, { minWords: { rfd: 100, comments: 50 } }),
		},
		Entries: notedEntries.map((entry) => ({ ...entry, doubled: 1 })),
		otherJudges: [
			{ first: 'Dana', middle: 'L', last: 'Whitfield', chair: false, pronoun: null },
			{ first: 'Chris', middle: null, last: 'Alvarez', chair: false, pronoun: 'he/him' },
		],
		ballotTopics: '<ul><li>Topic A: Patents</li><li>Topic B: Copyright</li><li>Topic C: Trade secrets</li></ul>',
	});
</script>

<Story name="Default" args={{ context: debateContext() }} />

<Story name="Chair Judge" args={{ context: debateContext({ chair: true }) }} />

<Story
	name="Round Notes"
	args={{ context: debateContext({ Round: { id: 1, name: 3, label: null, notes: 'https://example.com\n\nexampleclassic@gmail.com' } }) }}
/>

<Story name="Accommodation Note" args={{ context: debateContext({ Entries: notedEntries }) }} />

<Story name="Busy Ballot" args={{ context: busy }} />
