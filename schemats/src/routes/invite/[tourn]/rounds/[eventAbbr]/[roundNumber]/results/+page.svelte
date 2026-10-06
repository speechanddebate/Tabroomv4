<script lang="ts">

	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { indexFetch } from '$lib/indexfetch';
	import type { PersonTournPresence, RoundResults } from '@tabroom/types';

	import Ranked from './Ranked.svelte';
	import Winloss from './Winloss.svelte';

	import Loading from '$lib/layouts/Loading.svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import RoundsSidebar from '../../../sidebar.svelte';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');

	let myTourn = $derived.by( () => {
		return indexFetch<PersonTournPresence>(`/user/tourns/${tourn.id}`);
	});

	let roundNumber = $derived(page.params.roundNumber);
	let eventAbbr   = $derived(page.params.eventAbbr);

	// Page params calls must be in a derived for reactivity.
	let results = $derived(indexFetch<RoundResults>(`/pages/invite/${tourn.id}/${eventAbbr}/${roundNumber}/results`));

</script>

	<WithSidebar>
		<Loading tanstackJobs={ [myTourn, results] }></Loading>

		{#if results.status === 'success'}
			<div class="
				flex
				bt-0 mt-0
				border-b-2 border-primary-strong
				pb-2 mb-2
			">
				<span class="w-3/5">
					<div class="flex flex-col justify-between h-full pb-1">
						<h4 class='py-0 leading-8 pb-0.5'>
							{ results.data.Event?.name }
						</h4>
					</div>
				</span>

				<span class="w-2/5 content-right m-0 p-0 flex flex-col justify-around">
					<h5 class='text-right pe-2'>Posted Results</h5>
				</span>
			</div>


			{#if results.data.Event?.Settings?.primaryScore === 'winloss' }
				<Winloss
					results = {results.data}
					tourn   = {tourn}
				/>
			{:else if results.data.Event?.Settings?.primaryScore === 'rank' }
				<Ranked
				/>
			{:else}

				<h5 class="font-semibold text-center py-2">
					This round's results are not yet available
				</h5>

				<p class="text-center">
					Hey, could you do our servers a solid?  Don't refresh this
					page every sixteen microseconds. Tabroom will now auto
					refresh!
				</p>
			{/if}
		{/if}

		{#snippet sidebar()}
			<RoundsSidebar parent='results' />
		{/snippet}
	</WithSidebar>