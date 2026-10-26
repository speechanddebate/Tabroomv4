<script lang="ts">
	import { Spinner } from 'flowbite-svelte';
	import type { JudgeTournHistory } from '$indexcards/schemas';
	import { parseDateTime } from '$lib/helpers/dt';
	import JudgeTournRecord from './JudgeTournRecord.svelte';

	let {
		data,
		isLoading = false,
		notFound = false,
	}: {
		data: JudgeTournHistory | null;
		isLoading?: boolean;
		notFound?: boolean;
	} = $props();

	const year = $derived(data ? parseDateTime({ dtISO: data.Tourn.start, tz: data.Tourn.tz }).year : '');
</script>

{#if isLoading}
	<div class="p-6 text-center">
		<Spinner color="primary" />
	</div>
{:else if notFound || !data || data.Judges.length === 0}
	<p class="p-6 text-center text-sm text-muted">No judging record found for this tournament.</p>
{:else}
	<div class="mb-4 flex items-baseline justify-between gap-4">
		<h2>{data.Tourn.name}</h2>
		<span class="text-lg font-semibold text-muted">{year}</span>
	</div>
	<div class="flex flex-col gap-6">
		{#each data.Judges as judge (judge.id)}
			<JudgeTournRecord {judge} tourn={data.Tourn} />
		{/each}
	</div>
{/if}
