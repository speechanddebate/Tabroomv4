<script lang='ts'>
	import { resolve } from '$app/paths';
	let { row } = $props();

	import { getContext } from 'svelte';
	import type { Tourn } from '$indexcards/schemas';
	let tourn:Tourn = getContext('webnameTourn');

	let linkUrl = $derived(resolve('/invite/[tourn]/entries/[entryId]', {
		tourn   : tourn.webname,
		entryId : String(row.Opponent.id),
	}));
	let linkText = $derived(row.Opponent.code);

</script>
	<a
		class = 'hover:text-primary-strong hover:text-decoration-line break-normal font-normal'
		href  = {linkUrl}
	>{@html linkText}</a>