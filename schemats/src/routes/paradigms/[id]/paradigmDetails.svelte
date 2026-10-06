<script lang="ts">
	import { Skeleton } from 'flowbite-svelte';
	import { Tabs, TabItem } from '$lib/components/Tabs';
	import { showDateTime } from '$lib/helpers/dt';
	import Quiz from './Quiz.svelte';
	import type { ParadigmDetailsSchema } from '$indexcards/schemas';
	import { getPerson } from '$lib/helpers/SessionContext.svelte';
    import type { JudgeRecord } from '$indexcards/schemas';
	import JudgeRecordTable from './judgeRecord.svelte';

	type Props = {
		data         : ParadigmDetailsSchema | null;
		record       : JudgeRecord[] | null;
		isLoading    : boolean;
		recordLoading : boolean;
		displayBack  : boolean;
		backFunction : () => void;
	};

	const { data: paradigmDetails, record, isLoading, recordLoading, displayBack, backFunction }: Props = $props();

	const person = $derived(getPerson());

</script>

<div class="rounded-lg border border-accent bg-surface p-2 lg:p-6 text-text w-full">
	{#if displayBack}
		<button
			class="mb-4 text-primary-strong hover:text-primary-deep text-sm font-semibold"
			onclick={backFunction}
			type="button"
		>
			← Back to results
		</button>
	{/if}
	<h2
		class="mb-4 flex flex-col gap-2 text-2xl font-bold
			sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:text-3xl"
	>
		<span>{paradigmDetails?.name ?? (isLoading ? 'Loading...' : 'No data')}</span>
		{#if paradigmDetails?.lastReviewed}
			<span class="text-sm font-normal text-primary-strong sm:ml-4 sm:text-base sm:whitespace-nowrap">
				Last reviewed: {showDateTime({
					dt: new Date(paradigmDetails.lastReviewed),
					tz: person?.tz || 'UTC',
					showTz   : true,
					joinWord : 'at',
				})}
			</span>
		{/if}
	</h2>

	<Tabs>
		<TabItem open title="Paradigm">
			<div>
				{#if isLoading}
					<Skeleton size="lg"/>
				{:else if paradigmDetails}
					{#if paradigmDetails.paradigm}
						<div class="prose prose-sm max-w-none">
							{@html paradigmDetails.paradigm}
						</div>
					{:else}
						<p class="text-primary-strong">No paradigm text available</p>
					{/if}
				{:else}
					<p class="text-primary-strong">No paradigm information available</p>
				{/if}
			</div>
		</TabItem>
			<TabItem title="Record">
			{#if recordLoading}
				<Skeleton size="lg"/>
			{:else if record && record.length > 0}
				<JudgeRecordTable records={record} />
			{:else}
				<p class="text-primary-strong">No record information available</p>
			{/if}
			</TabItem>
		{#if paradigmDetails?.certifications && paradigmDetails.certifications.length > 0}
			<TabItem title="Certifications">
				<div class="space-y-4">
					{#each paradigmDetails.certifications as quiz, index (`${quiz.label}-${quiz.PersonQuizzes?.[0]?.updatedAt}-${quiz.Badge?.imageUrl ?? index}`)}
						<Quiz {quiz} variant="paradigm" />
					{/each}
				</div>
			</TabItem>
		{/if}
	</Tabs>
</div>