<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import type { BallotFeedback } from '@tabroom/types';
	import { getRestJudgesBallotFeedbackMockHandler } from '#indexcards/index.msw';
	import Feedback from '../../../../../../routes/user/judge/ballot/Feedback.svelte';
	import { congressContext, debateContext, feedbackFor, mockTrialContext } from './fixtures';

	// The feedback boxes under the scoring (ballot.mhtml 2892-3132)
	const { Story } = defineMeta({
		title: 'Routes/User/Judge/Ballot/Feedback',
		component: Feedback,
		args: { judgeId: 1, panelId: 1 },
	});

	const debate = debateContext();
	const mockTrial = mockTrialContext();
	const congress = congressContext();

	// Records each saved body and echoes it back, as the API returns what it saved
	const savedBodies = fn();
	const recordSaves = [
		getRestJudgesBallotFeedbackMockHandler(async ({ request }) => {
			const body = await request.json() as BallotFeedback;
			savedBodies(body);
			return { rfd: body.rfd ?? null, Entries: body.Entries ?? [] };
		}),
	];
</script>

<Story name="Default" args={{ context: debate }} />

<Story
	name="Saved Feedback"
	args={{
		context: debateContext({
			scoring: {
				...debate.scoring,
				feedback: {
					...feedbackFor(debate.Entries),
					rfd: '<p>Aff won on the framework: Neg never answered the <strong>limits</strong> argument.</p>',
					Entries: [
						{ ballot: 11, comments: '<p>Great cross-ex. Slow down in the 2AR.</p>', entryLabel: 'Northview AB' },
						{ ballot: 12, comments: null, entryLabel: 'Central CD' },
					],
				},
			},
		}),
	}}
/>

<Story
	name="Word Minimums"
	args={{
		context: debateContext({
			scoring: { ...debate.scoring, feedback: feedbackFor(debate.Entries, { minWords: { rfd: 100, comments: 50 } }) },
		}),
	}}
/>

<!-- The API builds each label from the category and event settings -->
<Story
	name="Entry Labels"
	args={{
		context: mockTrialContext({
			scoring: {
				...mockTrial.scoring,
				feedback: {
					...feedbackFor(mockTrial.Entries),
					Entries: [
						{ ballot: 21, comments: null, entryLabel: 'Lincoln Mock Trial - Lincoln High School - Casey - Taylor' },
						{ ballot: 22, comments: null, entryLabel: 'Westfield Mock Trial - Westfield Academy - Jamie - Quinn' },
					],
				},
			},
		}),
	}}
/>

<Story
	name="Mock Trial"
	args={{
		context: mockTrialContext({
			scoring: { ...mockTrial.scoring, feedback: feedbackFor(mockTrial.Entries, { minWords: { rfd: 75, comments: null } }) },
		}),
	}}
/>

<!-- The chair comments on each legislator but writes no reason for rankings -->
<Story
	name="Congress Chair"
	args={{
		context: congressContext({
			chair: true,
			scoring: { ...congress.scoring, feedback: feedbackFor(congress.Entries, { showRfd: false }) },
		}),
	}}
/>

<Story
	name="No Tournament End"
	args={{ context: debateContext({ Tourn: { id: 1, end: null } }) }}
/>

<Story
	name="Save Feedback"
	args={{ context: debate }}
	parameters={{ msw: { handlers: recordSaves } }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		savedBodies.mockClear();

		await userEvent.click(await canvas.findByRole('textbox', { name: 'Reason for Decision' }));
		await userEvent.keyboard('Aff won the weighing.');
		await userEvent.click(canvas.getByRole('button', { name: /Save Feedback/ }));

		await waitFor(() => expect(savedBodies).toHaveBeenCalledWith(expect.objectContaining({
			rfd: '<p>Aff won the weighing.</p>',
			Entries: [
				{ ballot: 11, comments: null, entryLabel: 'Northview AB' },
				{ ballot: 12, comments: null, entryLabel: 'Central CD' },
			],
		})));
	}}
/>

<!-- Switching boxes saves right away, and the text is still there on the way back. Wide, because it clicks the tab strip. -->
<Story
	name="Switch Boxes"
	args={{ context: debate }}
	globals={{ viewport: { value: 'desktop', isRotated: false } }}
	parameters={{ msw: { handlers: recordSaves } }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		savedBodies.mockClear();

		await userEvent.click(await canvas.findByRole('textbox', { name: 'Reason for Decision' }));
		await userEvent.keyboard('Neg dropped the turn.');
		await userEvent.click(canvas.getByRole('tab', { name: 'Central CD' }));

		await waitFor(() => expect(savedBodies).toHaveBeenCalledWith(expect.objectContaining({ rfd: '<p>Neg dropped the turn.</p>' })));
		await expect(await canvas.findByText(/These comments go only to Central CD & coaches/)).toBeInTheDocument();

		await userEvent.click(canvas.getByRole('tab', { name: 'Reason for Decision' }));
		await expect(await canvas.findByText('Neg dropped the turn.')).toBeInTheDocument();
	}}
/>