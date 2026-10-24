<script lang='ts'>
	import { Modal } from 'flowbite-svelte';
	import type { BallotReview } from '@tabroom/types';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { CLASSIC_URL } from '$app/env/public';
	import { createRestJudgesBallotConfirm, getRestJudgesBallotContextQueryKey } from '$indexcards';
	import Button from '$lib/components/Button.svelte';
	import { handleMutation } from '$lib/helpers/query';
	import { toast } from '$lib/helpers/toasts';
	import { studentName } from './scoring/scoringGrid';

	type Props = {
		// The ballot as just saved, for the judge to check
		review: BallotReview;
		judgeId: number;
		panelId: number;
		open?: boolean;
	};

	let { review, judgeId, panelId, open = $bindable(false) }: Props = $props();

	const id = $props.id();
	const queryClient = useQueryClient();
	const mutation = createRestJudgesBallotConfirm();
	let confirming = $state(false);
	// Set when the API couldn't confirm; the scores are saved, so classic can still confirm them
	let failed = $state<string | null>(null);

	const winner = $derived(review.Entries.find((entry) => entry.ballot === review.winner));
	const classicConfirmUrl = $derived(`${CLASSIC_URL}/user/judge/ballot_confirm.mhtml?panel_id=${panelId}&judge_id=${judgeId}`);

	async function confirm() {
		confirming = true;
		failed = null;

		const confirmed = await handleMutation(mutation.mutateAsync({ judgeId, panelId }), {
			Problem: (problem, callDefault) => {
				if (problem.status === 503) {
					failed = problem.detail ?? 'Your ballot was saved but couldn\'t be confirmed.';
				} else {
					callDefault(problem);
				}
			},
		});

		if (confirmed) {
			// The page shows the ballot as confirmed from its context, so wait for the refetched one
			// before closing. The ballot is confirmed either way; only the page is out of date
			try {
				await queryClient.invalidateQueries({ queryKey: getRestJudgesBallotContextQueryKey(judgeId, panelId) }, { throwOnError: true });
			} catch {
				toast.error({ message: 'Your ballot was confirmed, but this page couldn\'t refresh', detail: 'Reload the page to see it.' });
			}
			open = false;
		}
		confirming = false;
	}
</script>

<Modal aria-labelledby='{id}-title' onclose={() => (failed = null)} size='md' bind:open>
	{#snippet header()}
		<h4 id='{id}-title' class='my-0 text-lg font-semibold'>Is this correct?</h4>
	{/snippet}

	<div class='flex flex-col gap-2 text-sm'>
		{#if winner}
			<p class='my-0'>
				Winner: <span class='font-semibold'>{winner.code} ({winner.sideLabel})</span>
				{#if review.lowPointWin}<span class='italic'>, a low-point win</span>{/if}
			</p>
		{/if}
		{#each review.Entries as entry (entry.ballot)}
			<div>
				<p class='my-0 font-semibold'>{entry.code} ({entry.sideLabel})</p>
				<ul class='my-0 ps-4'>
					{#each entry.Students as student (student.id)}
						<li>{studentName(student)}{#if student.points !== null}: {student.points}{/if}</li>
					{/each}
				</ul>
			</div>
		{/each}
		<p class='my-0 text-muted'>Once confirmed, changes to your decision need the tournament staff.</p>

		{#if failed}
			<p class='my-0 rounded-md border border-danger bg-danger-soft p-2 font-semibold text-danger' role='alert'>
				{failed}
				<a class='underline' href={classicConfirmUrl}>Confirm on classic Tabroom</a>
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<div class='flex w-full justify-end gap-3'>
			<Button disabled={confirming} onclick={() => (open = false)} variant='outline'>No, re-enter</Button>
			<Button color='primary' disabled={confirming} onclick={confirm}>Yes, confirm</Button>
		</div>
	{/snippet}
</Modal>
