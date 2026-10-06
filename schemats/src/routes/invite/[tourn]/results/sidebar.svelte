<script lang='ts'>

	import { resolve } from '$app/paths';
	import { getContext, untrack } from 'svelte';

	import { indexFetch } from '$lib/indexfetch';
	import type { EventResultSets, PersonTournPresence } from '@tabroom/types';

	import type { Tourn } from '$indexcards/schemas';

	let {selectedResultSetId = 0, selectedEventId = 0} = $props();

	const tourn:Tourn = getContext('webnameTourn');
	const resultSets  = $derived(indexFetch<Record<number, EventResultSets>>(`/rest/tourns/${tourn.id}/results`));
	const myTourn     = $derived(indexFetch<PersonTournPresence>(`/user/tourns/${tourn.id}`));

	let selectedEvent = $state(untrack(() => selectedEventId));

	interface Bucket {
		[key: string]: Array<EventResultSets>;
	}

	const buckets:Bucket = $derived.by( () => {

		const myEvents = myTourn.data?.me?.events || [];
		const mineEvents = myTourn.data?.mine?.events || [];

		const myBuckets:Bucket = {};

		if (resultSets.data && resultSets.isFetched) {

			const events = Object.values(resultSets.data).sort( (a, b) => {

				if (myEvents.includes(b.id) && !myEvents.includes(a.id)) return 1;
				if (myEvents.includes(a.id) && !myEvents.includes(b.id)) return -1;

				if (mineEvents.includes(b.id) && !mineEvents.includes(a.id)) return 1;
				if (mineEvents.includes(a.id) && !mineEvents.includes(b.id)) return -1;

				if (a.nsdacategory !== b.nsdacategory) return (a.nsdacategory ?? 0) - (b.nsdacategory ?? 0);
				if (a.level !== b.level) return b.level.localeCompare(a.level);
				if (a.type !== b.type) return a.type.localeCompare(b.type);
				if (a.abbr !== b.abbr) return a.abbr.localeCompare(b.abbr);
				return a.id - b.id;
			});

			events.forEach( (event) => {
				if (!myBuckets[event.type]) myBuckets[event.type] = [];
				myBuckets[event.type].push(event);
			});
		}
		return myBuckets;
	});

</script>

	{#if myTourn.isFetched && resultSets.isFetched}

	<!-- invite/results/sidebar.svelte: content for a WithSidebar sidebar snippet -->
		<div class="sidenote">
			<h5 class='my-0 border-b border-accent pb-0 leading-8 mb-2 pt-1'>
				Events
			</h5>

			{#each Object.keys(buckets) as eventType (eventType) }
				{#each buckets[eventType] as event (event.id) }
					{#if event.ResultSets.length > 0}

						<div class='flex flex-wrap'>
							<button
								class = 'blue w-full bg-surface-alt text-sm
									border-s-2 border-primary
									border-y border-y-border
									hover:bg-page
									p-1
									ps-2
									text-[12px]
									flex
									mb-1
									{selectedEvent === event.id ? 'selected bg-accent-soft font-semibold' : '' }
								'
								onclick={ () => { selectedEvent = event.id; } }
								type  ='button'
							>
								<span class="grow text-left">
									{event.name}
								</span>
								<span class='min-w-[3em]
										flex
										flex-col
										justify-aresultSet
										text-right pe-0.75
										text-xs
									'>
										{event.abbr}
								</span>
							</button>

							<div class='block ps-2 {selectedEvent === event.id ? '' : 'hidden' } mb-2'>
								{#each event.ResultSets as resultSet (resultSet.id)}
									<a
										class = 'blue w-full
											bg-surface-alt text-xs
											border-s-2 border-accent
											border-y border-y-border
											hover:bg-accent-soft
											{selectedResultSetId === resultSet.id ? 'selected bg-accent-soft ' : '' }
										'
										href = {resolve('/invite/[tourn]/results/[resultSetId]', {
											tourn       : tourn.webname,
											resultSetId : String(resultSet.id),
										})}
									>{ resultSet.label  }</a>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			{/each}
		</div>
	{/if}
