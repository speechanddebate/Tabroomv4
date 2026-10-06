<script lang="ts">
	import { indexFetch } from '$lib/indexfetch';
	import type { EventResultSets } from '@tabroom/types';
	import { getContext } from 'svelte';
	import type { Tourn } from '$indexcards/schemas';

	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import ResultsSidebar from './sidebar.svelte';
	const tourn:Tourn = getContext('webnameTourn');
	const resultSets = $derived(indexFetch<Record<number, EventResultSets>>(`/rest/tourns/${tourn.id}/results`));
</script>

	<WithSidebar>
		{#if resultSets.status === 'pending'}
			<div class='text-success font-semibold'>
				Data Loading...
			</div>
		{:else if resultSets.status === 'error'}
			<span>Error: {resultSets.error.message}</span>
		{:else}

			{#if resultSets.isPending}
				<div class='text-success font-semibold'>
					Data Updating...
				</div>
			{:else}
				<h5>Results Tables</h5>
			{/if}
		{/if}

		{#snippet sidebar()}
			<ResultsSidebar />
		{/snippet}
	</WithSidebar>