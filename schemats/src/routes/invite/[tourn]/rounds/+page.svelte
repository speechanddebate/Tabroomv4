<script lang="ts">
	import { indexFetch } from '$lib/indexfetch';
	import type { PublishedRound } from '@tabroom/types';
	import { getContext } from 'svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import RoundsSidebar from './sidebar.svelte';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');
	let roundList = $derived(indexFetch<PublishedRound[]>(`/rest/tourns/${tourn.id}/rounds`));

</script>

	<WithSidebar>
		{#if roundList.status === 'pending'}
			<div class='text-success font-semibold'>
				Data Loading...
			</div>
		{:else if roundList.status === 'error'}
			<span>Error: {roundList.error.message}</span>
		{:else}

			{#if roundList.isPending}
				<div class='text-success font-semibold'>
					Data Updating...
				</div>

			{:else if roundList.data.length < 1}

				<h5>No Published Rounds</h5>

				<p>This tournament has not yet published rounds.</p>

			{:else}
				<h5>Published Rounds</h5>
			{/if}
		{/if}

		{#snippet sidebar()}
			<RoundsSidebar />
		{/snippet}
	</WithSidebar>
