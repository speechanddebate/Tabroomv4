<script lang="ts">

	// This pattern leads to reactive data display in Svelte 5 & TanStack,
	// which is otherwise tricky.

	import { indexFetch } from '$lib/indexfetch';
	import type { TournInvite, Webpage } from '@tabroom/types';
	import { getContext } from 'svelte';

	import { ucfirst } from '$lib/helpers/text';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import InviteSidebar from './page/[slug]/sidebar.svelte';
	import Loading from '$lib/layouts/Loading.svelte';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');
	const pageContent = $derived(indexFetch<TournInvite>(`/rest/tourns/${tourn.id}/invite`));

	const mainPages = $derived(pageContent.data?.Webpages?.filter(
		(webpage:Webpage) => webpage.slug === 'main'
	));

</script>

	<WithSidebar>
		<Loading tanstackJob={pageContent}></Loading>

		{#if mainPages && mainPages.length > 0}
			<h5
				class='border-b border-primary mb-4'
			>{ ucfirst(mainPages[0].title) || 'Invitation' }</h5>

			<!-- wrap-anywhere: long emails and URLs in tournament HTML can't push the page wide -->
			<div class='wrap-anywhere'>
				{@html mainPages[0].content}
			</div>
		{:else }
			<h5>Welcome</h5>
			<p>
				This tournament has not set up a main webpage.  For further
				information, please contact the tournament organizers, or
				consult any page links at right.
			</p>
		{/if}

		{#snippet sidebar()}
			{#if pageContent.data}
				<InviteSidebar
					tourn = {pageContent.data}
				/>
			{/if}
		{/snippet}
	</WithSidebar>
