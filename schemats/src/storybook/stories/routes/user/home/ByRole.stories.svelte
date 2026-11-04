<script lang="ts" module>
	/*
	 * User home redesign by role combination. Each story is one person's
	 * cards at a running, an upcoming, and a just-finished tournament, built
	 * from the same /user/home data in ./fixtures.ts so the combinations are
	 * comparable.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { HomeRole } from '@tabroom/types';
	import TournCard from '../../../../../routes/user/home/TournCard.svelte';
	import type { Phase } from '../../../../../routes/user/home/tasks';
	import { freezeTime } from '../../../../utils/freezeTime';
	import { now, phases, tourn } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/By role',
		parameters: { layout: 'padded' },
		beforeEach: () => freezeTime(now),
	});

	const phaseHeadings: Record<Phase, string> = {
		running  : 'Happening now',
		upcoming : 'Coming up',
		past     : 'Just finished',
	};

	// Rare but possible: a student who also judges, a judge on tab staff, a student tab assistant, a student with coach access to their own team, a coach who judges and tabs
	const others: { name: string, roles: HomeRole[] }[] = [
		{ name: 'Judge and competitor', roles: ['judge', 'competitor'] },
		{ name: 'Judge and tab staff', roles: ['judge', 'tab'] },
		{ name: 'Competitor and tab staff', roles: ['competitor', 'tab'] },
		{ name: 'Competitor and coach', roles: ['competitor', 'coach'] },
		{ name: 'Judge, coach, and tab staff', roles: ['judge', 'coach', 'tab'] },
	];

	const h2 = 'm-0 mb-3 font-display text-2xl tracking-normal text-primary-deep normal-case';
	const h3 = 'm-0 mb-2 font-display text-xl tracking-normal text-primary-deep normal-case';
</script>

{#snippet threePhases(roles: HomeRole[])}
	<div class="flex max-w-4xl flex-col gap-8">
		{#each phases as phase (phase)}
			<section>
				<h3 class={h3}>{phaseHeadings[phase]}</h3>
				<TournCard tourn={tourn(phase, roles)} />
			</section>
		{/each}
	</div>
{/snippet}

<Story name="Judge">
	{#snippet template()}{@render threePhases(['judge'])}{/snippet}
</Story>

<Story name="Competitor">
	{#snippet template()}{@render threePhases(['competitor'])}{/snippet}
</Story>

<Story name="Coach">
	{#snippet template()}{@render threePhases(['coach'])}{/snippet}
</Story>

<Story name="Tab staff">
	{#snippet template()}{@render threePhases(['tab'])}{/snippet}
</Story>

<Story name="Judge and coach">
	{#snippet template()}{@render threePhases(['judge', 'coach'])}{/snippet}
</Story>

<Story name="Coach and tab staff">
	{#snippet template()}{@render threePhases(['tab', 'coach'])}{/snippet}
</Story>

<Story name="Other combinations">
	{#snippet template()}
		<div class="flex flex-col gap-12">
			{#each others as other (other.name)}
				<section>
					<h2 class={h2}>{other.name}</h2>
					{@render threePhases(other.roles)}
				</section>
			{/each}
		</div>
	{/snippet}
</Story>
