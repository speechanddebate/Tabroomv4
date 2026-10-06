<script lang="ts">

	import { resolve } from '$app/paths';
	import { CalendarDays } from '@lucide/svelte';

	let {row, column} = $props();

	let linkUrl = $derived(column.linkFunction(row));

</script>
<span
class = "w-1/3 text-primary-strong hover:text-primary-deep py-1"
>
<a href="{resolve(linkUrl,{})}">
	<CalendarDays class='m-auto size-4' />
</a>
</span>