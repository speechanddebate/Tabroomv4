<script lang='ts' module>
	import type { BallotContext, OtherBallotContext } from '@tabroom/types';

	type Context = Exclude<BallotContext, OtherBallotContext>;

	// What the judge has written: the reason for decision and each entry's comments
	export type FeedbackDraft = Pick<NonNullable<Context['scoring']['feedback']>, 'rfd' | 'Entries'>;

	// Saves this long after the judge stops typing
	const AUTOSAVE_DELAY = 3000;

	const OFFLINE_MESSAGE = 'Errors were encountered saving; is your network connection active?';
</script>

<script lang='ts'>
	import { onDestroy } from 'svelte';
	import { Save } from '@lucide/svelte';
	import { createRestJudgesBallotFeedback } from '#indexcards';
	import Button from '#lib/components/Button.svelte';
	import Editor from '#lib/components/Editor.svelte';
	import { Tabs, TabItem } from '#lib/components/Tabs/index.ts';
	import { showDateTime } from '#lib/helpers/dt.ts';
	import { handleMutation } from '#lib/helpers/query.ts';
	import { toast } from '#lib/helpers/toasts.ts';

	type Props = {
		context: Context;
		// The context carries no ids, but the page has them
		judgeId: number;
		panelId: number;
		// What the judge has written, for the submit to send
		feedback?: FeedbackDraft;
		// Whether the last save failed for want of a connection, for the offline warning
		saveFailed?: boolean;
	};

	let {
		context,
		judgeId,
		panelId,
		feedback = $bindable({
			rfd: context.scoring.feedback?.rfd ?? null,
			Entries: (context.scoring.feedback?.Entries ?? []).map((entry) => ({ ...entry })),
		}),
		saveFailed = $bindable(false),
	}: Props = $props();

	const scoring = $derived(context.scoring.feedback);

	// ballot.mhtml 2987-2997
	const rfdTitle = $derived(
		context.eventType === 'mock_trial' ? 'Reason for Verdict'
			: context.eventType === 'congress' ? 'Reason for Rankings'
				: 'Reason for Decision'
	);

	const codes = $derived(new Map(context.Entries.map((entry) => [entry.ballot, entry.code])));
	const codeOf = (ballot: number, fallback: string) => codes.get(ballot) ?? fallback;

	// Classic orders the entries' tabs by code
	const entries = $derived(
		[...(scoring?.Entries ?? [])].sort((a, b) => codeOf(a.ballot, a.entryLabel).localeCompare(codeOf(b.ballot, b.entryLabel)))
	);

	const editableUntil = $derived(
		context.Tourn.end ? showDateTime({ dtISO: context.Tourn.end, tz: context.tz, format: 'medium', joinWord: 'at' }) : null
	);

	const rfdNote = $derived(
		'These comments go to all participants in the round.'
		+ (context.eventType === 'debate' && scoring?.minWords.rfd ? ` Must be at least ${scoring.minWords.rfd} words long.` : '')
	);

	const comments = (ballot: number) => feedback.Entries.find((entry) => entry.ballot === ballot)?.comments ?? '';

	function setRfd(html: string) {
		feedback.rfd = html;
		edited();
	}

	function setComments(ballot: number, html: string) {
		const entry = feedback.Entries.find((entry) => entry.ballot === ballot);
		if (entry) entry.comments = html;
		edited();
	}

	// All the feedback is saved at once: after the judge stops typing, when they switch boxes,
	// when they press Save Feedback, and when they leave the page
	const mutation = createRestJudgesBallotFeedback();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let dirty = false;
	let saving = false;
	// Set while a save waits for the one in flight; true when the judge asked for it
	let queued: boolean | undefined;

	function edited() {
		dirty = true;
		clearTimeout(timer);
		timer = setTimeout(() => save(false), AUTOSAVE_DELAY);
	}

	function flush() {
		if (dirty) save(false);
	}

	function offline() {
		saveFailed = true;
		// Try again on the next save
		dirty = true;
		toast.error({ message: OFFLINE_MESSAGE });
	}

	async function save(manual: boolean) {
		clearTimeout(timer);
		if (saving) {
			queued = Boolean(queued) || manual;
			return;
		}

		saving = true;
		dirty = false;

		const data = {
			...(scoring?.showRfd ? { rfd: feedback.rfd } : {}),
			Entries: feedback.Entries,
		};

		const saved = await handleMutation(mutation.mutateAsync({ judgeId, panelId, data }), {
			// The tournament being over or a bad entry gets the usual problem toast
			Problem: (problem, callDefault) => ((problem.status ?? 0) >= 500 ? offline() : callDefault(problem)),
			queryError: () => offline(),
		});
		saving = false;

		if (saved) {
			saveFailed = false;
			if (manual) toast.success({ message: 'All comments and feedback were saved' });
		}

		if (queued !== undefined) {
			const next = queued;
			queued = undefined;
			save(next);
		}
	}

	onDestroy(() => {
		clearTimeout(timer);
		flush();
	});
</script>

{#snippet box(note: string, label: string, placeholder: string, getContent: () => string, setContent: (html: string) => void)}
	<div class='flex flex-col gap-2 pt-3'>
		<div class='flex flex-wrap items-center justify-between gap-2'>
			<p class='my-0 text-sm'>{note}</p>
			<Button color='primary' onclick={() => save(true)} size='sm' variant='outline'>
				<Save class='h-4 w-4' /> Save Feedback
			</Button>
		</div>
		<Editor {label} {placeholder} bind:content={getContent, setContent} />
	</div>
{/snippet}

{#if scoring}
	<div class='flex flex-col gap-2'>
		<h5 class='my-0'>Feedback</h5>

		{#if editableUntil}
			<p class='my-0 text-sm text-muted'>
				You can write &amp; edit feedback until {editableUntil}.
				Please submit your ranks, scores and/or decision before writing or giving extensive feedback.
				After you fill out ranks, you can look under the Past tab of your judging home screen to see past results &amp; edit feedback.
			</p>
		{/if}

		{#if scoring.minWords.comments}
			<p class='my-0 text-sm font-semibold'>
				At least {scoring.minWords.comments} words of feedback are required for each speaker before you may submit your ballot.
			</p>
		{/if}

		{#if scoring.showRfd && scoring.minWords.rfd}
			<p class='my-0 text-sm font-semibold'>
				{#if context.eventType === 'mock_trial'}
					A written reason for verdict of at least {scoring.minWords.rfd} words is required before you may submit your ballot.
				{:else}
					A written RFD of at least {scoring.minWords.rfd} words is required before you may submit your ballot.
				{/if}
			</p>
		{/if}

		<Tabs label='Feedback' onchange={flush}>
			{#if scoring.showRfd}
				<TabItem title={rfdTitle}>
					{@render box(
						rfdNote,
						rfdTitle,
						scoring.minWords.rfd ? `Minimum ${scoring.minWords.rfd} words of RFD required` : '',
						() => feedback.rfd ?? '',
						setRfd,
					)}
				</TabItem>
			{/if}

			{#each entries as entry (entry.ballot)}
				{@const code = codeOf(entry.ballot, entry.entryLabel)}
				<TabItem title={code}>
					{@render box(
						`These comments go only to ${entry.entryLabel} & coaches`,
						`Comments for ${code}`,
						scoring.minWords.comments ? `Minimum ${scoring.minWords.comments} words of feedback required for each entry` : '',
						() => comments(entry.ballot),
						(html) => setComments(entry.ballot, html),
					)}
				</TabItem>
			{/each}
		</Tabs>
	</div>
{/if}
