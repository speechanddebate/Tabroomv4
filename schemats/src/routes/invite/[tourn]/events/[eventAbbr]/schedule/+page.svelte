<script lang="ts">

	// This pattern leads to reactive data display in Svelte 5 & TanStack,
	// which is otherwise tricky.
	import { indexFetch } from '$lib/indexfetch';
	import type { TournInvite } from '@tabroom/types';
	import { getContext } from 'svelte';

	import {eventType} from '$lib/helpers/text';

	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import { resolve } from '$app/paths';

	import type { Tourn } from '$indexcards/schemas';
	const tourn:Tourn = getContext('webnameTourn');
	const pageContent = $derived(indexFetch<TournInvite>(`/rest/tourns/${tourn.id}/invite`));

	const eventPage = $derived(pageContent.data?.Webpages?.filter(
		(webpage) => webpage.slug === 'events'
	) ?? []);

</script>

	{#if pageContent.status === 'pending'}
		<div class='text-success font-semibold'>
			Data Loading...
		</div>
	{:else if pageContent.status === 'error'}
		<span>Error: {pageContent.error.message}</span>
	{:else}

		{#if pageContent.isPending}
			<div class='text-success font-semibold'>
				Data Updating...
			</div>
		{:else}

			<WithSidebar>

			{#if eventPage.length === 1}
				<h5
					class='border-b border-primary mb-4'
				>{eventPage[0].title || 'Main' }</h5>

				{@html eventPage[0].content}
			{:else }
				<h4
					class='border-b border-primary mb-1'
				>Events Offered</h4>
			{/if}

			{#each pageContent.data?.Events as event (event.id) }

				<div class='border-b border-b-primary-strong'>

					<div class='w-full flex py-1 ps-1 border-b border-b-page'>

						<span class="w-1/2 flex grow">
							<span>
								<h5>{event.name}</h5>
							</span>
							<span class="ps-2">
								<h6>( {event.abbr} )</h6>
							</span>
						</span>

						{#if event.settings.fieldReport}
							<span class="w-1/4 text-right content-center">
								<a
									class ='
										bg-surface
										font-semibold
										px-2
										text-primary-deep
										hover:text-primary-strong
									'
									href  = {resolve('/invite/[tourn]/events/[eventAbbr]/field', {
										tourn     : tourn.webname,
										eventAbbr : event.abbr ?? '',
									})}
								>
									{event.metadata.entryCount || 0 } Registered Entries
								</a>
							</span>
						{/if}
					</div>

					<div class="flex w-full ms-2 mt-1 content-start">
						<span class="w-1/3 pb-2 text-sm">

							<div class="px-1 flex py-1">
								<span class="w-1/3 font-semibold">
									Event Type
								</span>
								<span class="w-2/3 ps-2 pe-4 ">
									{eventType(event.type)}
								</span>
							</div>

							{#if event.fee}
								<div class="px-1 flex py-1">
									<span class="w-1/3 font-semibold">
										Entry Fee
									</span>
									<span class="w-2/3 ps-2 pe-4">
										{event.settings.currency || '$'}{event.fee}
									</span>
								</div>
							{/if}

							{#if event.NSDACategory.code}
								<div class="px-1 flex py-1">
									<span class="w-1/3 font-semibold">
										NSDA Event
									</span>
									<span class="w-2/3 ps-2 pe-4">
										{ event.NSDACategory.name } ({event.NSDACategory.code})
									</span>
								</div>
							{/if}

							{#if event.settings.cap || event.settings.schoolCap}
								<div class="px-1 flex py-1">
									<span class="w-1/3 font-semibold content-center">
										Entry Caps
									</span>
									<span class="w-2/3 ps-2 pe-4">
										{#if event.settings.cap}
											<div class="ps-1 py-1 leading-3">
												Limited to {event.settings.cap} total entries
											</div>
										{/if}

										{#if event.settings.schoolCap}
											<div class="ps-1 py-1 leading-3">
												Limited to {event.settings.schoolCap} entries per school
											</div>
										{/if}
									</span>
								</div>
							{/if}
						</span>

						<span class="w-2/3">
							{#if event.Topic.tag}
								<div class='pb-2'>
									<div class='font-semibold ps-2 py-1 content-center'>
										Topic:
										{event.Topic.tag}
										{event.Topic.source}
										{event.Topic.eventType}
									</div>

									{#if event.Topic.text}
										<p class='italic ps-3 py-1'>
											{event.Topic.text}
										</p>
									{/if}
								</div>
							{/if}

							{#if event.settings.description}
								<div class='pb-2'>
									<div class='font-semibold ps-2 py-1 content-center'>
										Event Description
									</div>

									<p class='ps-3 py-1'>
										{@html event.settings.description}
									</p>
								</div>
							{/if}
						</span>
					</div>
				</div>
			{/each}

			{#snippet sidebar()}
				<div class="sidenote min-h-[50dvh]">
				</div>
			{/snippet}
			</WithSidebar>

		{/if}
	{/if}

