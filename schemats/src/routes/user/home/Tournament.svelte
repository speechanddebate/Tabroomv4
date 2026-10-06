<script lang="ts">
    import { Tabs, TabItem } from '$lib/components/Tabs';
	import { showDateRange } from '$lib/helpers/dt';
    import Button from '$lib/components/Button.svelte';
    import { FileText } from '@lucide/svelte';
	import {
		createUserTournsSummary,
		createUserTournsFines,
		createUserTournsBallotsCurrent,
	} from '$indexcards';
	import { handleOrval } from '$lib/helpers/query';

	import type { Tourn } from '$indexcards/schemas';
    import Fine from './Fine.svelte';
    import Ballot from './Ballot.svelte';

	const { tourn }: { tourn: Tourn } = $props();

	const TournSummaryQuery = createUserTournsSummary(() => tourn.id,() => ({ query: { refetchInterval: 30*1000 } }));
	const tournSummary = $derived(handleOrval(TournSummaryQuery));

	const CurrBallotsQuery = createUserTournsBallotsCurrent(() => tourn.id,
		() => ({ query: { refetchInterval: new Date(tourn.start) < new Date() ? 30*1000 : false } }));
	const currBallots = $derived(handleOrval(CurrBallotsQuery));

	const FinesQuery = createUserTournsFines(() => tourn.id, () => ({ query: { refetchInterval: 30*1000 } }));
	const fines = $derived(handleOrval(FinesQuery));

const { dateOutput, timeOutput } = $derived(showDateRange({
	startISO: tourn.start,
	endISO: tourn.end,
	tz: tourn.tz,
	showTz: true,
}));

</script>
<div class="w-full border-2 rounded-md border-border shadow-md bg-surface overflow-hidden">
	<div
		class="h-1 w-full bg-primary animate-pulse"
		class:invisible={!TournSummaryQuery.isFetching && !CurrBallotsQuery.isFetching && !FinesQuery.isFetching}
	></div>
	<div class="p-2">
		<div class="flex flex-row flex-wrap">
		<div class="text-xl font-medium flex-grow-1">{tourn.name}</div>
		<a class="flex-grow-1 text-right hover:underline text-primary-strong" href="/index/tourn/index.mhtml?tourn_id={tourn.id}">https://{tourn.webname}.tabroom.com</a>
		</div>
		<div>{dateOutput} {timeOutput}</div>
		<!-- TODO
		coach dashboard
		coach regisration
		spaces?
-->
		<div class="flex flex-row flex-wrap">
			<!-- TODO: display category, event and school info where relevant-->
		</div>
		<div class="flex flex-wrap">
				{#if (tournSummary && tournSummary.livedocs.length > 0)}
				{#each tournSummary.livedocs as livedoc (livedoc.url)}
				<div class="relative shadow-sm border border-primary-strong rounded-lg px-2 py-2 m-2 basis-3xs grow">
					<div class="flex justify-center">
						<a class="font-semibold text-center" href={livedoc.url}>
							{livedoc.caption ?? 'Live Doc'}
						</a>
					</div>

					<div class="absolute right-2 top-1/2 -translate-y-1/2">
						<!-- TODO: pick an option from the "Live Doc Card (options)" story. This button does nothing yet. -->
						<Button color="primary" label="Live Doc" variant="outline">
							<FileText size="20" />
						</Button>
					</div>
				</div>
				{/each}
			{/if}
			{#if (tournSummary?.roles.includes('coach'))}
				<div class="relative shadow-sm border border-primary-strong rounded-lg px-2 py-2 m-2 basis-3xs grow">
					<div class="flex justify-center">
							Coach Dashboard (not yet implemented)
					</div>
				</div>
				<div class="relative shadow-sm border border-primary-strong rounded-lg px-2 py-2 m-2 basis-3xs grow">
					<div class="flex justify-center">
							Registration (not yet implemented)
					</div>
				</div>
			{/if}
			{#if (tournSummary?.roles.includes('student'))}
				<div class="relative shadow-sm border border-primary-strong rounded-lg px-2 py-2 m-2 basis-3xs grow">
					<div class="flex justify-center">
							Student Dashboard (not yet implemented)
					</div>
				</div>
			{/if}
		</div>
	</div>
	{#snippet notImplemented()}
		<div class="rounded-md border border-warning bg-warning-soft p-4">
			<h2 class="text-lg font-semibold text-text">Feature Under Development</h2>
			<p class="mt-2 text-sm text-text">
				This feature is still in progress. If you don't see what you need, please visit the
				<a
					class="font-semibold underline hover:text-warning"
					href="https://www.tabroom.com/user/setup.mhtml"
					rel="noopener noreferrer"
					target="_blank"
				>
					legacy user home page
				</a>.
			</p>
		</div>
	{/snippet}

	{#if (!tournSummary && !TournSummaryQuery.isFetching)}
		<div class="text-center text-sm text-muted">
			There was a problem loading this tournament's information. Please try again later.
		</div>
	{:else if (tournSummary)}
	<Tabs>
		<TabItem title="Info">{@render notImplemented()}</TabItem>
		<TabItem title="Schedule">{@render notImplemented()}</TabItem>
		{#if (tournSummary?.roles.includes('judge'))}
		<TabItem open={(currBallots && currBallots.length > 0) ?? false} title="Assignments">
			{#if currBallots && currBallots.length > 0}
			{#each currBallots as ballot (ballot.id)}
				<Ballot ballot={ballot}/>
			{/each}
			{:else}
			<div>
				As of now, you have no judging assignments.
			</div>
			{/if}
		</TabItem>
		<TabItem title="Past Ballots">{@render notImplemented()}</TabItem>
		{/if}
		{#if (tournSummary?.roles.includes('student'))}
			<TabItem title= 'Rounds'>{@render notImplemented()}</TabItem>
		{/if}
		{#if (fines && fines.length > 0)}
			<TabItem title="Fines">
				{#each fines as fine (fine.id)}
					<Fine {fine} />
				{/each}
			</TabItem>
		{/if}
	</Tabs>
	{/if}
</div>
