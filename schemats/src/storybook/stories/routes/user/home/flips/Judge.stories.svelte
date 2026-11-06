<script lang="ts" module>
	/*
	 * A judge's card with a debate ballot at each step of its coin flip. Sides are hidden
	 * until the flip is done, and judges never learn who won the toss. The "Sides pending
	 * coin flip" line isn't drawn yet.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TournCard from '../../../../../../routes/user/home/TournCard.svelte';
	import { freezeTime } from '../../../../../utils/freezeTime';
	import * as fx from '../fixtures';
	import { judge } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Flips/Judge',
		parameters: { layout: 'padded' },
		beforeEach: () => freezeTime(fx.now),
	});
</script>

<Story name="Winner choosing">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={judge.winnerChoosing} /></div>{/snippet}
</Story>

<Story name="Loser choosing">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={judge.loserChoosing} /></div>{/snippet}
</Story>

<Story name="Either choosing">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={judge.eitherChoosing} /></div>{/snippet}
</Story>

<Story name="Flip done">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={judge.done} /></div>{/snippet}
</Story>

<Story name="No flip">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={judge.noFlip} /></div>{/snippet}
</Story>
