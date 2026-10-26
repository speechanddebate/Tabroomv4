<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { getUserJudgesHistoryMockHandler } from '$indexcards/index.msw';
	import HistoryPage from '../../../../../../routes/user/judge/history/+page.svelte';
	import { createHistory, pageOf } from './fixtures';

	const history = createHistory();

	const { Story } = defineMeta({
		title: 'Routes/User/Judge/History',
		component: HistoryPage,
		parameters: {
			layout: 'fullscreen',
		},
	});
</script>

<Story
	name="Default"
	parameters={{
		msw: {
			handlers: [getUserJudgesHistoryMockHandler((info) => pageOf(history, info.request.url))],
		},
	}}
	play={async ({ canvasElement, step }) => {
		const canvas = within(canvasElement);

		await step('shows the first page of 50 with dates in the tournament zone', async () => {
			await expect(await canvas.findByText('1-50 of 120')).toBeInTheDocument();
			await expect(canvas.getByText('3/13 - 15')).toBeInTheDocument();
			await expect(canvas.getByText('1/30 - 2/1')).toBeInTheDocument();
			// The weekend's dates, not the month-long tournament's
			await expect(canvas.getByText('2/20 - 21')).toBeInTheDocument();
			await expect(canvas.getAllByTitle('Rounds judged/Rounds obligated')).toHaveLength(50);
			await expect(canvas.getByRole('link', { name: 'Same Month Classic' })).toHaveAttribute('href', '/user/judge/history/1120');
		});

		await step('fetches the next page from the server', async () => {
			await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
			// The previous page stays on screen until the next one arrives
			await expect(await canvas.findByText('Invitational 70')).toBeInTheDocument();
			await expect(canvas.getByText('51-100 of 120')).toBeInTheDocument();
			await expect(canvas.getByText('Page 2 of 3')).toBeInTheDocument();
			await expect(canvas.queryByText('Same Month Classic')).not.toBeInTheDocument();
		});
	}}
/>

<Story
	name="Empty"
	parameters={{
		msw: {
			handlers: [getUserJudgesHistoryMockHandler({ items: [], total: 0 })],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText('No data available')).toBeInTheDocument();
		await expect(canvas.getByText('0-0 of 0')).toBeInTheDocument();
	}}
/>
