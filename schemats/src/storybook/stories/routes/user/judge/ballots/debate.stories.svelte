<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { HttpResponse, http } from 'msw';
	import type { BallotValidationProblem } from '@tabroom/types';
	import { getRestJudgesBallotSaveMockHandler } from '$indexcards/index.msw';
	import BallotLayout from '../../../../../../routes/user/judge/ballot/BallotLayout.svelte';
	import { debateContext, savedDebateBallot, submitDebateBallot } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Judge/Ballot/Debate',
		component: BallotLayout,
		args: { judgeId: 1, panelId: 1 },
		parameters: {
			layout: 'fullscreen',
		},
	});

	// An elim where the entries flip for sides online, with the flip at the given step
	const flipContext = (flipStatus: 'winner' | 'done') => debateContext({
		Round: { id: 6, name: 6, label: 'Quarterfinals', notes: null },
		debate: { affLabel: 'Aff', negLabel: 'Neg', sides: 'flip', flipStatus, winner: null },
	});

	// The server's 422 for a ballot whose RFD is too short
	const refused: BallotValidationProblem = {
		type: 'about:blank',
		title: 'Ballot has errors',
		status: 422,
		errors: [
			{ field: 'rfd', message: 'This tournament requires a Reason for Decision. Please leave at least 50 words. (You left 0)' },
		],
	};
</script>

<Story name="Default" args={{ context: debateContext() }} />

<Story name="Flip Incomplete" args={{ context: flipContext('winner') }} />

<Story name="Flip Complete" args={{ context: flipContext('done') }} />

<!-- The server refuses the ballot: its errors show above the points rules -->
<Story
	name="Server Errors"
	args={{ context: debateContext() }}
	parameters={{
		msw: {
			handlers: [http.put('*/rest/judges/:judgeId/panels/:panelId/ballots', () => HttpResponse.json(refused, { status: 422 }))],
		},
	}}
	play={async ({ canvasElement }) => {
		await submitDebateBallot(canvasElement);

		const canvas = within(canvasElement);
		await expect(await canvas.findByText('Oh, drat. Your ballot had errors.')).toBeInTheDocument();
		await expect(canvas.getByText(refused.errors[0].message)).toBeInTheDocument();
	}}
/>

<!-- Any edit clears the errors until the next submit -->
<Story
	name="Errors Clear On Edit"
	args={{ context: debateContext() }}
	parameters={{
		msw: {
			handlers: [http.put('*/rest/judges/:judgeId/panels/:panelId/ballots', () => HttpResponse.json(refused, { status: 422 }))],
		},
	}}
	play={async ({ canvasElement }) => {
		await submitDebateBallot(canvasElement);

		const canvas = within(canvasElement);
		await expect(await canvas.findByText('Oh, drat. Your ballot had errors.')).toBeInTheDocument();

		await userEvent.type(canvas.getByRole('spinbutton', { name: 'Points for Avery Brooks' }), '5');
		await expect(canvas.queryByText('Oh, drat. Your ballot had errors.')).not.toBeInTheDocument();
	}}
/>

<!-- The API couldn't confirm: the scores are saved, and classic can still confirm them -->
<Story
	name="Confirm Fails"
	args={{ context: debateContext() }}
	parameters={{
		msw: {
			handlers: [
				getRestJudgesBallotSaveMockHandler(savedDebateBallot),
				http.post('*/rest/judges/:judgeId/panels/:panelId/ballots/confirm', () => HttpResponse.json({
					type: 'about:blank',
					title: 'The Server is temporarily unable to handle the request.',
					status: 503,
					detail: 'Your ballot was saved but couldn\'t be confirmed. Confirm it on classic Tabroom',
				}, { status: 503 })),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		await submitDebateBallot(canvasElement);

		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(await page.findByRole('button', { name: 'Yes, confirm' }));

		await expect(await page.findByRole('link', { name: 'Confirm on classic Tabroom' })).toHaveAttribute('href', expect.stringMatching(/ballot_confirm\.mhtml\?panel_id=1&judge_id=1$/));

		// The popup stays open; let its fade-in finish so the a11y check doesn't see it half transparent
		await Promise.all(page.getByRole('dialog').getAnimations({ subtree: true }).map((animation) => animation.finished));
	}}
/>

<Story name="Already Confirmed" args={{ context: debateContext({ status: 'confirmed' }) }} />
