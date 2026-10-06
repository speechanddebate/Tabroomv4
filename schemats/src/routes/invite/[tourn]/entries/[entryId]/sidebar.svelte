<script lang='ts'>

	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	import indexFetch from '$lib/indexfetch';
	import type { EventField } from '@tabroom/types';
    import Select from '$lib/layouts/Select.svelte';
	import type { Tourn } from '$indexcards/schemas';

	type FieldEntry = EventField['Entries'][number];

	let { event } = $props();
	let selectedEntryId = $derived(parseInt(page.params.entryId ?? ''));
	let tourn:Tourn = getContext('webnameTourn');

	let field = $derived(indexFetch<EventField>(`/rest/tourns/${tourn.id}/events/${event.abbr}/field`));

	let selections = $derived.by( () => {
		return field.data?.Entries.sort( (a:FieldEntry, b:FieldEntry) => {
			return (a.code ?? '').localeCompare(b.code ?? '');
		}).map( (entry:FieldEntry) => {
			return {
				value: entry.id,
				label: `${entry.code}: ${entry.name}`,
			};
		});
	});

	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const options:any = {
		onchange: (selection: { value: number | string; label: string }) => {
			if (selection?.value) goto(`/invite/${tourn.id}/entries/${selection.value}`);
		},
	};

</script>

	<!-- invite/entries/[entryId]/sidebar.svelte: content for a WithSidebar sidebar snippet -->
	{#if field.isSuccess}
		<div class="sidenote">
			<h4>Entries in {event.abbr}</h4>
			<Select
				items   = {selections}
				options = {options}
				startId = {selectedEntryId}
			/>
		</div>
	{/if}
