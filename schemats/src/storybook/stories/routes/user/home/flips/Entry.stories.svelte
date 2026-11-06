<script lang="ts" module>
	/*
	 * A competitor's card at each turn of an online coin flip. The task row asks for a choice
	 * on the entry's turn or when either may choose, and links to classic until the beta
	 * takes choices; the round table shows "Flip" while it's open.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TournCard from '../../../../../../routes/user/home/TournCard.svelte';
	import { freezeTime } from '../../../../../utils/freezeTime';
	import * as fx from '../fixtures';
	import { entry } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Flips/Entry',
		parameters: { layout: 'padded' },
		beforeEach: () => freezeTime(fx.now),
	});
</script>

<Story name="Won, side only">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.wonSideOnly} /></div>{/snippet}
</Story>

<Story name="Won, side or speaking order">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.wonSideOrOrder} /></div>{/snippet}
</Story>

<Story name="Lost, now my turn">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.lostNowMyTurn} /></div>{/snippet}
</Story>

<Story name="Won, turn handed back">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.wonHandedBack} /></div>{/snippet}
</Story>

<Story name="Either may choose">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.eitherMayChoose} /></div>{/snippet}
</Story>

<Story name="Opponent choosing">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.opponentChoosing} /></div>{/snippet}
</Story>

<Story name="Waiting after my pick">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.waitingAfterMyPick} /></div>{/snippet}
</Story>

<Story name="In progress, two minutes left">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={entry.inProgress} /></div>{/snippet}
</Story>
