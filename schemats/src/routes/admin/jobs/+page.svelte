<script lang="ts">
	/*
	 * The jobs the API runs on a timer: whether each is on schedule, what its last run did, and
	 * a button to run one now. Site admins only (the /admin layout turns everyone else away).
	 * Whether a job is overdue or failing is decided by the API, by the rules its alerts use.
	 */
	import type { ScheduledJob } from '@tabroom/types';
	import { RefreshCw } from '@lucide/svelte';
	import { renderSnippet } from '@tanstack/svelte-table';
	import Button from '$lib/components/Button.svelte';
	import Table from '$lib/components/utils/Table.svelte';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';
	import { handleMutation, handleOrval } from '$lib/helpers/query';
	import { getPerson } from '$lib/helpers/SessionContext.svelte';
	import { toast } from '$lib/helpers/toasts';
	import { createAdminJobRun, createAdminJobs } from '$indexcards';
	import { durationText, jobStatus, lastRunText, runBlockedReason, runTime, scheduleText, type JobTone } from './jobs';

	const tz = $derived(getPerson()?.tz ?? 'UTC');

	const listQuery = createAdminJobs(() => ({ query: { refetchInterval: 15_000, meta: { persist: false } } }));
	// The queues being down is shown on the page, since a toast every refetch would pile up
	const unavailable = $derived(listQuery.data?.status === 503);
	const jobs = $derived(handleOrval(listQuery, {
		Problem: (problem, callDefault) => { if (problem.status !== 503) callDefault(problem); },
	})?.jobs ?? []);

	const run = createAdminJobRun();
	let asking = $state<string | null>(null);

	async function runNow(job: ScheduledJob) {
		asking = job.name;
		const queued = await handleMutation(() => run.mutateAsync({ jobName: job.name }));
		if (queued) toast.success({ message: `${job.name} will run now` });
		await listQuery.refetch();
		asking = null;
	}

	const helper = createAppColumnHelper<ScheduledJob>();
	const columns = helper.columns([
		helper.display({ id: 'job', header: 'Job', cell: ({ row }) => renderSnippet(jobCell, row.original), meta: { truncate: false } }),
		helper.accessor((job) => scheduleText(job.Schedule), { id: 'schedule', header: 'Schedule', size: 170, meta: { truncate: false } }),
		helper.display({ id: 'status', header: 'Status', cell: ({ row }) => renderSnippet(statusCell, row.original), size: 120, meta: { truncate: false } }),
		helper.display({ id: 'next', header: 'Next run', cell: ({ row }) => renderSnippet(nextCell, row.original), size: 190, meta: { truncate: false } }),
		helper.display({ id: 'last', header: 'Last run', cell: ({ row }) => renderSnippet(lastCell, row.original), meta: { truncate: false } }),
		helper.display({ id: 'run', header: 'Run', cell: ({ row }) => renderSnippet(runCell, row.original), size: 150, enableResizing: false, meta: { truncate: false } }),
	]);

	const tones: Record<JobTone, string> = {
		success : 'bg-success-soft text-success',
		warning : 'bg-warning-soft text-warning',
		danger  : 'bg-danger-soft text-danger',
		info    : 'bg-primary-soft text-primary-strong',
		muted   : 'bg-surface-alt text-muted',
	};
</script>

{#snippet jobCell(job: ScheduledJob)}
	<span class="block font-semibold text-text">{job.name}</span>
	{#if job.description}<span class="block text-xs text-muted">{job.description}</span>{/if}
{/snippet}

{#snippet statusCell(job: ScheduledJob)}
	{@const status = jobStatus(job)}
	<span class="rounded-sm px-1.5 py-0.5 text-xs font-semibold {tones[status.tone]}">{status.label}</span>
{/snippet}

{#snippet nextCell(job: ScheduledJob)}
	{#if job.nextRun}
		{@const next = runTime(job.nextRun, tz)}
		<span class="block">{next.at}</span>
		<span class="block text-xs text-muted">{next.relative}</span>
	{:else}
		<span class="text-xs text-muted">Not scheduled</span>
	{/if}
{/snippet}

{#snippet lastCell(job: ScheduledJob)}
	{#if job.LastRun}
		{@const last = runTime(job.LastRun.finishedAt, tz)}
		{@const detail = lastRunText(job.LastRun)}
		<span class="block">
			<span class="font-semibold {job.LastRun.outcome === 'failed' ? 'text-danger' : 'text-text'}">{job.LastRun.outcome === 'failed' ? 'Failed' : 'Completed'}</span>
			{last.relative}{job.LastRun.durationMs === null ? '' : `, took ${durationText(job.LastRun.durationMs)}`}
		</span>
		<span class="block text-xs text-muted">{last.at}{detail ? `: ${detail}` : ''}</span>
	{:else}
		<span class="text-xs text-muted">Has not run</span>
	{/if}
{/snippet}

{#snippet runCell(job: ScheduledJob)}
	{@const blocked = runBlockedReason(job)}
	<Button
		color="primary"
		disabled={blocked !== null || asking !== null}
		onclick={() => runNow(job)}
		size="sm"
		variant="outline"
	>Run now<span class="sr-only">: {job.name}</span></Button>
	{#if blocked}<span class="mt-1 block text-xs text-muted">{blocked}</span>{/if}
{/snippet}

<div class="flex flex-wrap items-center justify-between gap-2">
	<h2>Scheduled jobs</h2>
	<Button disabled={listQuery.isFetching} label="Refresh" onclick={() => listQuery.refetch()} size="sm" variant="outline">
		<RefreshCw class="size-4 {listQuery.isFetching ? 'motion-safe:animate-spin' : ''}" aria-hidden="true" />
	</Button>
</div>
<p class="mt-1 text-sm text-muted">
	The jobs Tabroom runs on a timer. A job that is switched off here does not run and cannot be started from this page.
	Times are in your time zone, and the list refreshes every 15 seconds.
</p>

<section class="mt-4">
	{#if unavailable}
		<div class="rounded-md border border-danger bg-danger-soft p-4 text-sm text-danger" role="alert">
			<p class="font-semibold">The job queues are unavailable right now.</p>
			<p class="mt-1">The jobs themselves may still be fine; this page cannot reach the queue to check.</p>
			<Button class="mt-3" color="danger" onclick={() => listQuery.refetch()} size="sm" variant="outline">Try again</Button>
		</div>
	{:else}
		<Table
			caption="Scheduled jobs"
			{columns}
			data={jobs}
			emptyMessage="No scheduled jobs."
			enableSorting={false}
			getRowId={(job) => job.name}
		/>
	{/if}
</section>
