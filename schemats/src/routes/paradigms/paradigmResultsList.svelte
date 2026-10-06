<script lang="ts">
	import type { ParadigmSearchResult, ProblemSchema } from '$indexcards/schemas';
	import type { CreateInfiniteQueryResult } from '@tanstack/svelte-query';

	import ParadigmListItem from './[id]/paradigmListItem.svelte';
	import InfiniteScroll from '$lib/components/utils/infiniteScroll.svelte';

	type Props = {
		results: ParadigmSearchResult[];
		searchTerm: string;
		selectedHref: (id: number) => string;
		paradigmsQuery: CreateInfiniteQueryResult<unknown, ProblemSchema>;
		// Called when a result is picked, e.g. to close the mobile drawer.
		onselect?: () => void;
	};

	const {
		results,
		searchTerm,
		selectedHref,
		paradigmsQuery,
		onselect,
	}: Props = $props();
</script>

<InfiniteScroll query={paradigmsQuery}>
	{#if results.length > 0}
		<div class="mx-auto flex w-full flex-col gap-3 overflow-y-auto">
			{#each results as result (result.id)}
				<ParadigmListItem href={selectedHref(result.id)} item={result} {onselect} />
			{/each}
		</div>
	{:else}
		<p class="text-sm text-muted">No paradigms found matching "{searchTerm}"</p>
	{/if}
</InfiniteScroll>
