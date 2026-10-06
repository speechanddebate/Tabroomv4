<script lang="ts">

	import { indexFetch } from '$lib/indexfetch';
	import type { Webpage } from '@tabroom/types';
	import Loading from '$lib/layouts/Loading.svelte';
	import { page } from '$app/state';

	// Page paramters need to be wrapped in derived blocks still.
	let pageContent = $derived( indexFetch<Webpage[]>(`/rest/pages/${page.params.slug}`) );

	// The endpoint returns a list; a slug matches one page.
	let webpage = $derived(pageContent.data?.[0]);

</script>

	<Loading tanstackJob={pageContent} />

	{#if webpage}
		<h2>{ webpage.title }</h2>
		{@html webpage.content }
	{:else if pageContent.data}
		<h2>Page Not Found</h2>
		<p>No page was found at { page.params.slug }.</p>
	{/if}
