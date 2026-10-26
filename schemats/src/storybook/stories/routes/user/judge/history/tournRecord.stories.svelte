<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import JudgeTournHistory from '../../../../../../routes/user/judge/history/[tournId]/JudgeTournHistory.svelte';
	import { createTournHistory, schoolJudge, volunteerJudge } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Judge/History/Tournament',
		component: JudgeTournHistory,
		parameters: {
			layout: 'fullscreen',
		},
	});
</script>

<!-- A school's judge with a code, an obligation, and three assigned rounds -->
<Story
	name="Default"
	args={{ data: createTournHistory([schoolJudge]) }}
	play={async ({ canvasElement, step }) => {
		const canvas = within(canvasElement);

		await step('shows the tournament and the judge record', async () => {
			await expect(canvas.getByRole('heading', { name: 'Same Month Classic' })).toBeInTheDocument();
			await expect(canvas.getByText('2026')).toBeInTheDocument();
			await expect(canvas.getByText('Northview High School')).toBeInTheDocument();
			await expect(canvas.queryByText('Volunteer/Hire')).not.toBeInTheDocument();
			await expect(canvas.getByText('42A')).toBeInTheDocument();
			await expect(canvas.getByText('4 for school, 2 hired')).toBeInTheDocument();
			await expect(canvas.getByText('5 (7 flights)')).toBeInTheDocument();
		});

		await step('lists the assigned rounds in the tournament zone', async () => {
			await expect(canvasElement.querySelectorAll('tbody tr')).toHaveLength(3);
			await expect(canvas.getByRole('link', { name: 'LD Round 1' })).toHaveAttribute('href', '/invite/samemonth/rounds/LD/1');
			await expect(canvas.getByRole('link', { name: 'LD Quarterfinals' })).toBeInTheDocument();
			await expect(canvas.getByText('Flight 2')).toBeInTheDocument();
			await expect(canvas.getByText('No Room Listed')).toBeInTheDocument();
			await expect(canvas.getAllByText('Sat 10:00 AM')).toHaveLength(3);
			await expect(canvas.getAllByText('Northview AB')).toHaveLength(3);
		});
	}}
/>

<!-- A volunteer in a category that hides codes: no school, code, or obligation rows; speech entries by code -->
<Story
	name="Volunteer"
	args={{ data: createTournHistory([volunteerJudge]) }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('Volunteer/Hire')).toBeInTheDocument();
		await expect(canvas.queryByText('Judge code')).not.toBeInTheDocument();
		await expect(canvas.queryByText('Rounds', { exact: true })).not.toBeInTheDocument();
		await expect(canvas.getByText('2', { exact: true })).toBeInTheDocument();
		await expect(canvas.getByText('401')).toBeInTheDocument();
		await expect(canvas.queryByText('Alex Jordan')).not.toBeInTheDocument();
	}}
/>

<!-- One record per category the person judged in -->
<Story
	name="Two Records"
	args={{ data: createTournHistory([schoolJudge, volunteerJudge]) }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('heading', { name: 'Lincoln-Douglas (LD)' })).toBeInTheDocument();
		await expect(canvas.getByRole('heading', { name: 'Speech (SP)' })).toBeInTheDocument();
	}}
/>

<Story
	name="Not Judged"
	args={{ data: null, notFound: true }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('No judging record found for this tournament.')).toBeInTheDocument();
	}}
/>

<Story name="Loading" args={{ data: null, isLoading: true }} />
