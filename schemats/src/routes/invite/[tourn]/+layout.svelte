<script lang="ts">

	// Tournament Invitation layout shell: the title and tabs sit above the
	// page and its sidebar.

	import { indexFetch } from '$lib/indexfetch';
	import type { TournInvite } from '@tabroom/types';
	import { setContext } from 'svelte';

	import Loading from '$lib/layouts/Loading.svelte';
	import InviteHeader from './InviteHeader.svelte';

	import type { Snippet } from 'svelte';
	import type { Tourn } from '$indexcards/schemas';

	// This pattern leads to reactive data display in Svelte 5 & TanStack,
	// which is otherwise tricky. It cost me dearly to discover this wisdom.
	let { data, children }: {data: Tourn, children:Snippet} = $props();

	let tourn:Tourn = $derived.by( () => {
		return { ... data};
	});

	// Keep access to the URL path and Tourn ID throughout this segment. I'm
	// not sure this is the best way to do it, but it is a way.

	// svelte-ignore state_referenced_locally
	setContext('webnameTourn', tourn);
	const pageContent = $derived(indexFetch<TournInvite>(`/rest/tourns/${tourn.id}/invite`));

</script>

	{#if pageContent.status !== 'success' || pageContent.isPending}
		<Loading tanstackJob={pageContent} />
	{:else}
		<div class='invitePage group/invite flex flex-1 flex-col'>
			<!--
				AppShell drops its padding when the page has a sidebar, so pad
				the header here in that case only. Full width pages (register)
				get AppShell's padding around both.
			-->
			<div class='group-has-[[data-with-sidebar]]/invite:px-4 group-has-[[data-with-sidebar]]/invite:pt-4 sm:group-has-[[data-with-sidebar]]/invite:px-6'>
				<InviteHeader />
			</div>
			{@render children() }
		</div>
	{/if}
