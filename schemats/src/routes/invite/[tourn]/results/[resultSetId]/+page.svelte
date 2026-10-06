<script lang="ts">

	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { indexFetch } from '$lib/indexfetch';
	import type { PersonTournPresence, ResultSet as ResultSetData } from '@tabroom/types';

	import Loading from '$lib/layouts/Loading.svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import ResultsSidebar from '../sidebar.svelte';
	import ResultSet from './ResultSet.svelte';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');

	let myTourn = $derived.by( () => {
		return indexFetch<PersonTournPresence>(`/user/tourns/${tourn.id}`);
	});

	let resultSetId = $derived(parseInt(page.params.resultSetId ?? '0'));

	// Page params calls must be in a derived for reactivity.
	let resultSetFetch = $derived(indexFetch<ResultSetData[]>(`/rest/tourns/${tourn.id}/results/${resultSetId}`));
	let resultSet = $derived(resultSetFetch.data?.[0]);

</script>

	<WithSidebar>
		<Loading tanstackJobs={ [myTourn, resultSetFetch] }></Loading>

		{#if resultSet}
			<div class="
				flex
				bt-0 mt-0
				border-b-2 border-primary-strong
				pb-2 mb-2
			">
				<span class="w-3/5 justify-around flex flex-col">
					<h4 class='pb-1 my-0 leading-8'>
						{ resultSet.Event?.name }
					</h4>
				</span>

				<span class="w-2/5 content-right m-0 p-0 flex flex-col justify-around">
					<h6 class='py-0 leading-3 pb-0.5 text-right font-semibold'>
						{ tourn.start.toString().substring(0, 4) }
						{ tourn.name }
					</h6>
				</span>
			</div>

			{#if resultSet.tag === 'bracket' }

				<p>I haven't done the {resultSet.tag} report on the beta; it's
				kind of tricky code, if fun.  For now, look at Tabroom Classic.</p>

			{:else}
				<ResultSet
					resultSet = {resultSet}
					tourn     = {tourn}
				/>
			{/if}
		{/if}

		{#snippet sidebar()}
			{#if resultSet}
				<ResultsSidebar
					selectedEventId = { resultSet.Event?.id }
					selectedResultSetId = { resultSet.id }
				/>
			{/if}
		{/snippet}
	</WithSidebar>
