<script lang="ts">

	// This pattern leads to reactive data display in Svelte 5 & TanStack,
	// which is otherwise tricky.

	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	import { indexFetch } from '$lib/indexfetch';
	import type { ScheduleRound } from '@tabroom/types';
	import { getContext } from 'svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import RoundsSidebar from '../sidebar.svelte';

    import ShowDate from '$lib/layouts/ShowDate.svelte';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');

	let schedule = indexFetch<ScheduleRound[]>(`/rest/tourns/${tourn.id}/schedule`);
	let eventAbbr = $derived(page.params.eventAbbr ?? '');

	const rounds = $derived(schedule.data?.filter(
		(round:ScheduleRound) => round.Event?.abbr === eventAbbr
	) ?? []);

</script>

	<WithSidebar>
		{#if schedule.status === 'pending'}
			<div class='text-success font-semibold'>
				Data Loading...
			</div>
		{:else if schedule.status === 'error'}
			<span>Error: {schedule.error.message}</span>
		{:else}

			{#if schedule.isPending}
				<div class='text-success font-semibold'>
					Data Updating...
				</div>
			{:else}

				<h5>{eventAbbr} Event Schedule</h5>

				{#each rounds as round (round.id) }

					<div class="flex border-t border-border-strong w-full py-2">
						<span class="w-1/4 ps-1">
							{ round.label || `Round ${round.name}` }
						</span>

						<span class="w-1/4 capitalize">
							{ round.type }
						</span>

						<span class="w-1/10">
							<ShowDate
								dtISO  = {round.start_time || round.Timeslot.start}
								format = 'dayOnly'
								mode   = 'date'
							/>
						</span>
						<span class="w-1/6">
							<ShowDate
								dtISO  = {round.start_time || round.Timeslot.start}
								format = 'short'
								mode   = 'time'
							/>
						</span>

						<span class="w-1/6 grow text-xs text-right pe-2">
							<a class='flexrow'
								href= { resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]', {
									tourn       : tourn.webname,
									eventAbbr   : eventAbbr,
									roundNumber : String(round.name),
								}) }
							>
								{ round.published == 1 ? 'Published' : '' }
							</a>
							<a class='flexrow'
								href= { resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]/results', {
									tourn       : tourn.webname,
									eventAbbr   : eventAbbr,
									roundNumber : String(round.name),
								}) }
							>
								{ round.post_primary ? 'Results Posted' : '' }
							</a>
						</span>
					</div>
				{/each}
			{/if}
		{/if}

		{#snippet sidebar()}
			<RoundsSidebar />
		{/snippet}
	</WithSidebar>
