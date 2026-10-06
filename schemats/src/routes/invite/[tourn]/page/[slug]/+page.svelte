<script lang="ts">

    import { page } from '$app/state';
    import WithSidebar from '$lib/layouts/WithSidebar.svelte';
    import InviteSidebar from './sidebar.svelte';
	import Loading from '$lib/layouts/Loading.svelte';

	// This pattern leads to reactive data display in Svelte 5 & TanStack,
	// which is otherwise tricky.
	import { getContext } from 'svelte';
	import { indexFetch } from '$lib/indexfetch';
	import type { TournInvite } from '@tabroom/types';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');
	const pageContent = $derived(indexFetch<TournInvite>(`/rest/tourns/${tourn.id}/invite`));

	let webPage = $derived.by( () => {
		const myPages = pageContent.data?.Webpages?.filter(
			(webpage) => webpage?.id === parseInt(page.params?.slug ?? '')
		);
		if (myPages && myPages.length > 0) {
			return myPages[0];
		}
	});

	let slug = $derived(page.params.slug);

</script>

	<WithSidebar>
		<Loading tanstackJob={pageContent}></Loading>

		{#if pageContent.data}
			{#if webPage}
				<h5
					class='border-b border-primary mb-4'
				>{webPage.title || 'Main' }</h5>
				<!-- wrap-anywhere: long emails and URLs in tournament HTML can't push the page wide -->
				<div class='wrap-anywhere'>
					{@html webPage.content}
				</div>
			{:else }
				<h5>No Page Found</h5>
				<p>
					The page ID {slug} was not found in the tournament {tourn.name}
				</p>
			{/if}
		{/if}

		{#snippet sidebar()}
			{#if pageContent.data}
				<InviteSidebar
					tourn = {pageContent.data}
				/>
			{/if}
		{/snippet}
	</WithSidebar>
