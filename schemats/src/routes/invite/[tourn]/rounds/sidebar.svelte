<script lang='ts'>

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getContext } from 'svelte';

	let { parent = 'schematic' } = $props();

	import { indexFetch } from '$lib/indexfetch';
	import type { PersonTournPresence, PublishedRound } from '@tabroom/types';
	import { ucfirst } from '$lib/helpers/text';

	const eventGroupKeys = ['your', 'school', 'other'] as const;
	type EventGroupKey = typeof eventGroupKeys[number];
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	type EventBuckets = Record<EventGroupKey, Record<string, any>>;

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');

	const roundList   = $derived(indexFetch<PublishedRound[]>(`/rest/tourns/${tourn.id}/rounds`));
	const myTourn     = $derived(indexFetch<PersonTournPresence>(`/user/tourns/${tourn.id}`));

	let events:EventBuckets = $derived.by( ():EventBuckets => {

		if (!myTourn.isFetched) return { your: {}, school: {}, other: {} };
		if (!roundList.isFetched) return { your: {}, school: {}, other: {} };

		const myEvents = myTourn.data?.me?.events || [];
		const mineEvents = myTourn.data?.mine?.events || [];

		const rawEvents:EventBuckets = {
			your   : {},
			school : {},
			other  : {},
		};

		const done: number[] = [];

		roundList.data?.forEach( (round:PublishedRound) => {
			if (!round.Event?.id) return;
			if (done.includes(round.Event.id)) return;
			let tag:EventGroupKey = 'other';

			if (myEvents.includes(round.Event.id)) tag = 'your';
			if (mineEvents.includes(round.Event.id)) tag = 'school';

			rawEvents[tag][String(round.Event.id)] = round.Event;
			done.push(round.Event.id);
		});

		return rawEvents;
	});

	let multiple = $derived.by( () => {
		if (!myTourn.isFetched) return;
		if (events) {
			if (Object.keys(events.school).length) return 1;
		}
	});

	const roundsByEvent = $derived.by( () => {
		if (!myTourn.isFetched) return;
		if (!roundList.isFetched) return;

		// oxlint-disable-next-line @typescript-eslint/no-explicit-any
		const eventBins:any = {};
		roundList.data?.forEach( (round:PublishedRound) => {
			if (!eventBins[round.event]) {
				eventBins[round.event] = [];
			}
			eventBins[round.event].push(round);
		});

		Object.keys(eventBins).forEach( (eventId) => {
			eventBins[eventId] = eventBins[eventId]?.sort( (a:PublishedRound,b:PublishedRound) => {
				if (a.name !== b.name)  return (b.name ?? 0) - (a.name ?? 0);
			});
		});

		return eventBins;
	});

	let selectedEventAbbr = $derived(page.params.eventAbbr);
	let selectedRoundNumber = $derived(parseInt(page.params.roundNumber ?? ''));

</script>

	{#if myTourn.isFetched && roundList.isFetched}

	<!-- invite/rounds/sidebar.svelte: content for a WithSidebar sidebar snippet -->
		<div class="sidenote">
			{#each eventGroupKeys as key (key) }

				{#if events[key] && Object.keys(events[key]).length}

					<h5 class='my-0 border-b border-accent pb-0 leading-8 mb-2 pt-1'>
						{multiple ? ucfirst(key) : ''} Events
					</h5>

					{#each Object.keys(events[key]).sort( (a,b) => {

						const eA = events[key][a];
						const eB = events[key][b];

						if (eA.type !== eB.type)
							return (eA.type).localeCompare(eB.type);

						if (eA.nsda_category !== eB.nsda_category)
							return eA.nsda_category - eB.nsda_category;

						if (eA.abbr && eB.abbr)
							return (eA.abbr).localeCompare(eB.abbr);
					}) as id (id) }

						<div class='flex flex-wrap'>
							<a
								class = 'blue w-full bg-surface-alt text-sm
									border-s-2 border-primary
									border-y border-y-border
									hover:bg-page
									p-1
									ps-2
									text-[12px]
									flex
									{selectedEventAbbr === events[key][id]?.abbr ? 'selected bg-accent-soft font-semibold' : '' }
								'
								href = { resolve('/invite/[tourn]/rounds/[eventAbbr]', {
									tourn     : String(tourn.id),
									eventAbbr : events[key][id].abbr,
								}) }
							>
								<span class="grow">
									{events[key][id].name}
								</span>
								<span class='min-w-[3em]
									flex
									flex-col
									justify-around
									text-right pe-0.75
									text-xs
								'>
									{events[key][id].abbr}
								</span>
							</a>

							<div class='block ps-2 {selectedEventAbbr === events[key][id].abbr ? '' : 'hidden' } mb-2 w-full'>
								{#each roundsByEvent[id] as round (round.id)}

									{#if round.post_primary === 3 || round.Event?.Settings?.publishResults}
										<div
											class = 'w-full flex {
												myTourn.data?.me?.rounds.includes(round.id)
													? 'text-warning font-semibold'
													: ''
											}'
										>
											{#if myTourn.data?.me?.rounds.includes(round.id) }
												{@html '&#x21e8;'}
											{/if}
											<a class='w-2/3
												bg-surface-alt text-xs
												border-s-2 border-accent
												border-y border-y-border
												hover:bg-accent-soft
												{ (parent !== 'results' && selectedRoundNumber === round.name ? 'selected bg-warning-soft ' : '') }'
												href = {resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]', {
													tourn       : tourn.webname,
													eventAbbr   : events[key][id].abbr,
													roundNumber : String(round.name),
												})}
											>{ events[key][id].abbr } { round.label || `Round ${round.name}`} Schematic</a>
											<a class='w-1/4 ml-1 grow
												bg-surface-alt text-xs
												border-s-2 border-accent
												border-y border-y-border
												{ (parent === 'results' && selectedRoundNumber === round.name) ? 'selected bg-warning-soft ' : '' }
												hover:bg-accent-soft'
												href = {resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]/results', {
													tourn       : tourn.webname,
													eventAbbr   : events[key][id].abbr,
													roundNumber : String(round.name),
												})}
											>Results</a>
										</div>
									{:else}
										<a
											class = 'blue w-full
												bg-surface-alt text-xs
												border-s-2 border-accent
												border-y border-y-border
												hover:bg-accent-soft
												{myTourn.data?.me?.rounds.includes(round.id) ? 'text-warning font-semibold' : '' }
												{selectedRoundNumber === round.name ? 'selected bg-accent-soft ' : '' }
											'
											href = {resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]', {
												tourn       : tourn.webname,
												eventAbbr   : events[key][id].abbr,
												roundNumber : String(round.name),
											})}
										>{#if myTourn.data?.me?.rounds.includes(round.id) }
											{@html '&#x21e8;'}
										{/if}
										{ events[key][id].abbr } { round.label || `Round ${round.name}`}</a>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			{/each}
		</div>
	{/if}
