<script lang="ts" module>
	/*
	 * A coach's card with the school's open coin flips. Home doesn't draw the Flips count
	 * yet; the "{n} coin flips open" row lands with the coach flips page.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TournCard from '../../../../../../routes/user/home/TournCard.svelte';
	import { freezeTime } from '../../../../../utils/freezeTime';
	import * as fx from '../fixtures';
	import { coach } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Flips/Coach',
		parameters: { layout: 'padded' },
		beforeEach: () => freezeTime(fx.now),
	});
</script>

<Story name="No open flips">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={coach.none} /></div>{/snippet}
</Story>

<Story name="One open flip">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={coach.one} /></div>{/snippet}
</Story>

<Story name="Several open flips">
	{#snippet template()}<div class="max-w-4xl"><TournCard tourn={coach.several} /></div>{/snippet}
</Story>
