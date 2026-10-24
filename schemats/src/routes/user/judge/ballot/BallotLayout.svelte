<script lang='ts'>
	import type { Attachment } from 'svelte/attachments';
	import type { BallotContext, BallotError, BallotReview, BallotValidationProblem, OtherBallotContext } from '@tabroom/types';
	import { CLASSIC_URL } from '$app/env/public';
	import { createRestJudgesBallotSave } from '$indexcards';
	import { handleMutation } from '$lib/helpers/query';
	import OnlineRoom from '$lib/components/OnlineRoom.svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import BallotSidebar from './BallotSidebar.svelte';
	import ConfirmBallot from './ConfirmBallot.svelte';
	import Feedback, { type FeedbackDraft } from './Feedback.svelte';
	import DebateScoring from './scoring/DebateScoring.svelte';
	import type { DebateScores } from './scoring/draft.svelte';

	type Props = {
		context: Exclude<BallotContext, OtherBallotContext>;
		// The context carries no ids, but the feedback and score saves need them
		judgeId: number;
		panelId: number;
	};

	let { context, judgeId, panelId }: Props = $props();

	// What the judge has written, sent with the scores, which replace the autosaved drafts
	// svelte-ignore state_referenced_locally
	let feedback = $state<FeedbackDraft>({
		rfd: context.scoring.feedback?.rfd ?? null,
		Entries: (context.scoring.feedback?.Entries ?? []).map((entry) => ({ ...entry })),
	});

	// Why the server refused the last submit. The server is the only check; any edit clears them
	let errors = $state<BallotError[]>([]);
	const clearErrors = () => {
		if (errors.length > 0) errors = [];
	};
	// The ballot as last saved, which the judge checks in the confirm popup
	let review = $state<BallotReview | null>(null);
	let confirmOpen = $state(false);
	let submitting = $state(false);
	// Confirmed scores are final (ballot.mhtml 1535-1567); feedback stays editable. Confirming
	// refetches the context before the popup closes
	const confirmed = $derived(context.status === 'confirmed');

	const save = createRestJudgesBallotSave();

	async function submitScores(scores: DebateScores) {
		submitting = true;
		review = null;

		const saved = await handleMutation(save.mutateAsync({ judgeId, panelId, data: { ...scores, feedback } }), {
			// A ballot that breaks its rules lists every problem; anything else gets the usual toast
			Problem: (problem, callDefault) => {
				const listed = (problem as Partial<BallotValidationProblem>).errors;
				if (problem.status === 422 && listed) {
					errors = listed;
				} else {
					callDefault(problem);
				}
			},
		});
		submitting = false;

		if (saved) {
			errors = [];
			review = saved;
			confirmOpen = true;
		}
	}

	// Brings a new errors box into view
	const reveal: Attachment<HTMLElement> = (element) => {
		element.focus();
	};

	const classicUrl = $derived(`${CLASSIC_URL}/user/judge/ballot.mhtml?panel_id=${panelId}&judge_id=${judgeId}`);

	const judgeName = $derived(
		[context.Judge.code, context.Judge.first, context.Judge.middle, context.Judge.last]
			.filter(Boolean)
			.join(' ')
	);

	// A rubric has its own rules for each row
	const pointsRules = $derived(context.scoring.points?.rubric ? undefined : context.scoring.points);

	const notedEntries = $derived(context.Entries.filter((entry) => entry.notes));
</script>

{#snippet placeholder(label: string)}
	<div class='rounded-md border-2 border-dashed border-border-strong p-6 text-center text-muted'>
		{label}
	</div>
{/snippet}

<WithSidebar>
	<div class='flex flex-col gap-3'>
		<!-- lg:me-4 keeps it clear of the sidebar toggle, like the header below -->
		<p class='my-0 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-text lg:me-4'>
			This is the beta ballot. If you have any issues,
			<a class='font-semibold underline hover:text-warning' href={classicUrl}>use the classic ballot</a>.
		</p>

		<!-- lg:pe-4 keeps the judge name clear of the sidebar toggle, which sits over the page's right edge -->
		<header class='flex flex-col gap-1 border-b border-border pb-2 sm:flex-row sm:items-start lg:pe-4'>
			<span class='sm:w-1/3'>
				{#if context.Room?.joinable}
					<OnlineRoom
						room    = {context.Room}
						size    = 'md'
						target  = {{ type: 'section', tournId: context.Tourn.id, sectionId: panelId }}
						text    = {context.Room.name ? `Room ${context.Room.name}` : undefined}
						variant = 'text'
					/>
				{:else}
					<p class='text-lg font-semibold text-primary-strong'>
						{context.Room?.name ? `Room: ${context.Room.name}` : 'NO ROOM ASSIGNED'}
					</p>
				{/if}
			</span>
			<span class='sm:w-1/3 sm:text-center'>
				<h4 class='my-0 text-muted'>
					{#if context.eventType !== 'mock_trial'}{context.Event.abbr}{/if}
					{context.Round.label ?? `${context.eventType === 'congress' ? 'Session' : 'Round'} ${context.Round.name ?? ''}`}
					{#if context.flight}Flt {context.flight}{/if}
				</h4>
			</span>
			<span class='sm:w-1/3 sm:text-right'>
				<h5 class='my-0'>{judgeName}</h5>
			</span>
		</header>

		{#if context.chair}
			<h6 class='my-0 text-center font-semibold uppercase text-muted'>
				{context.chairLabel ?? (context.eventType === 'congress' ? 'Parliamentarian' : 'Chair Judge')}
			</h6>
		{/if}

		{#if context.Round.notes}
			<!-- Display the round notes, converting URLs into clickable links -->
			<p class='rounded-md border-t-2 border-primary bg-warning-soft p-2 whitespace-pre-line text-warning'>
				Note: {#each context.Round.notes.split(/(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])/) as part, index (index)}{#if index % 2}<a class='break-all underline' href={part} rel='noopener noreferrer' target='_blank'>{part}</a>{:else}{part}{/if}{/each}
			</p>
		{/if}

		{#if context.topic}
			<!-- Classic capitalizes only TOPIC, not Motion or Resolution -->
			<div class='max-w-none text-center font-semibold [--tw-prose-body:var(--color-primary-strong)]'>
				<span class:uppercase={context.topic.label === 'Topic'}>{context.topic.label}:</span>
				{@html context.topic.text}
			</div>
		{/if}

		{#if context.ballotHeader}
			<div class='prose prose-sm max-w-none rounded-md border border-border p-3'>
				{@html context.ballotHeader}
			</div>
		{/if}

		{#each context.rules as rule, index (index)}
			<div class='prose prose-sm max-w-none'>
				{@html rule}
			</div>
		{/each}

		{#if errors.length > 0}
			<!-- ballot.mhtml 1448-1465. Keyed so each refused submit brings it back into view -->
			{#key errors}
				<div
					class='flex flex-col gap-2 rounded-md border-2 border-danger p-3 text-center'
					{@attach reveal}
					role='alert'
					tabindex='-1'
				>
					<h6 class='my-0 font-semibold text-primary-strong'>Oh, drat. Your ballot had errors.</h6>
					<ul class='my-0 list-none p-0 font-semibold text-danger'>
						{#each errors as error, index (index)}
							<li>{error.message}</li>
						{/each}
					</ul>
					<p class='my-0 font-semibold text-primary-strong'>Please correct these before continuing.</p>
				</div>
			{/key}
		{/if}

		{#if pointsRules || notedEntries.length > 0}
			<div class='flex flex-col gap-2 border-t border-border pt-3'>
				{#if pointsRules}
					<p class='text-center font-semibold italic'>
						<span class='text-danger'>Points Rules:</span>
						<span class='text-primary-strong'>Range:</span>
						{pointsRules.min}-{pointsRules.max}.
						{#if pointsRules.step === 1}Whole points only.{/if}
						{pointsRules.ties ? 'Ties are OK.' : 'No ties.'}
						{#if pointsRules.ranksAgree}Ranks and points must agree.{/if}
						{#if context.scoring.winloss?.lpw === 'forbid'}Winner must have higher points.{/if}
						{#if pointsRules.step !== 1}Steps of {pointsRules.step}.{/if}
					</p>
				{/if}

				{#if notedEntries.length > 0}
					<div class='flex flex-col gap-1 text-center'>
						<span class='font-semibold text-danger'>Accommodation Notes</span>
						{#each notedEntries as entry (entry.ballot)}
							<!-- Notes come from a textarea, so keep their line breaks -->
							<p class='whitespace-pre-line'><span class='font-semibold'>{entry.code}:</span> {entry.notes}</p>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- input bubbles from every field, the feedback editor included, so any edit clears the errors -->
		<section aria-label='Scoring' oninput={clearErrors}>
			{#if confirmed}
				<!-- ballot.mhtml 1535-1567 -->
				<p class='my-0 rounded-md border border-success bg-success-soft p-3 text-center font-semibold' role='status'>
					This ballot has been entered and confirmed already.
					Changes to confirmed results require contacting the tournament staff.
				</p>
			{:else if context.eventType === 'debate'}
				<DebateScoring {context} onsubmit={submitScores} {submitting} />
			{:else}
				{@render placeholder('Scoring')}
			{/if}
		</section>

		{#if review}
			<ConfirmBallot {judgeId} {panelId} {review} bind:open={confirmOpen} />
		{/if}

		<!-- Classic shows nothing here for Congress judges who aren't the chair, or mock trial without mock_trial_feedback -->
		{#if context.scoring.feedback}
			<section aria-label='Feedback' oninput={clearErrors}>
				<Feedback {context} {judgeId} {panelId} bind:feedback />
			</section>
		{/if}

		{#if context.ballotTopics}
			<div class='mt-4 border-t-2 border-primary pt-3'>
				<h6>Topics for {context.Round.label ?? `${context.eventType === 'congress' ? 'Session' : 'Round'} ${context.Round.name ?? ''}`}:</h6>
				<div class='prose prose-sm max-w-none'>
					{@html context.ballotTopics}
				</div>
			</div>
		{/if}
	</div>

	{#snippet sidebar()}
		<BallotSidebar {context} />
	{/snippet}
</WithSidebar>
