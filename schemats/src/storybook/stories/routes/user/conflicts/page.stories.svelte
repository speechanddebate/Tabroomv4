<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import {
		getUserConflictAddMockHandler,
		getUserConflictRemoveMockHandler,
		getUserConflictsChaptersMockHandler,
		getUserConflictsMockHandler,
		getUserConflictsPeopleMockHandler,
	} from '$indexcards/index.msw';
	import ConflictsPage from '../../../../../routes/user/conflicts/+page.svelte';
	import { chapters, conflicts, people, quinn } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Conflicts',
		component: ConflictsPage,
		parameters: { layout: 'padded' },
	});

	const serve = (list: typeof conflicts) => ({
		msw: {
			handlers: [
				getUserConflictsMockHandler(list),
				getUserConflictsPeopleMockHandler(people),
				getUserConflictsChaptersMockHandler(chapters),
				getUserConflictAddMockHandler(quinn),
				getUserConflictRemoveMockHandler(),
			],
		},
	});
</script>

<Story
	name="With conflicts"
	parameters={serve(conflicts)}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText('Riverdale Prep (NY)')).toBeInTheDocument();
		await expect(canvas.getByText('Quinn Quill')).toBeInTheDocument();

		await userEvent.type(canvas.getByRole('textbox', { name: 'Last name' }), 'Quil');
		await userEvent.click(canvas.getAllByRole('button', { name: 'Search' })[0]);
		await expect(await canvas.findByText('Quincy Quill')).toBeInTheDocument();
		await expect(canvas.getByText('Plano East, Westlake')).toBeInTheDocument();
		await expect(canvas.getByText('Already a conflict')).toBeInTheDocument();
		await expect(canvas.getAllByRole('button', { name: 'Conflict' })).toHaveLength(2);
	}}
/>

<Story name="None yet" parameters={serve([])} />
