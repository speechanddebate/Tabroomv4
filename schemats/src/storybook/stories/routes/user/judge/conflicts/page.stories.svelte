<script lang="ts" module>
	import type { ComponentProps } from 'svelte';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { getRestJudgesConflictAddMockHandler, getRestJudgesConflictRemoveMockHandler, getRestJudgesConflictsMockHandler } from '$indexcards/index.msw';
	import ConflictsPage from '../../../../../../routes/user/judge/conflicts/+page.svelte';
	import { empty, entryConflict, judgeId, mockTrial, readOnly, sheet } from './fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Judge/Conflicts',
		component: ConflictsPage,
		parameters: { layout: 'padded' },
		args: { data: { judgeId } as ComponentProps<typeof ConflictsPage>['data'] },
	});

	const serve = (response: ReturnType<typeof sheet>) => ({
		msw: {
			handlers: [
				getRestJudgesConflictsMockHandler(response),
				getRestJudgesConflictAddMockHandler(entryConflict),
				getRestJudgesConflictRemoveMockHandler(),
			],
		},
	});
</script>

<Story
	name="Sheet"
	parameters={serve(sheet())}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText('Westlake BB (LD)')).toBeInTheDocument();
		await expect(canvas.getAllByText('Conflicted through Riverdale Prep')).toHaveLength(2);
		await expect(canvas.getByText('Your school')).toBeInTheDocument();

		await userEvent.type(canvas.getByRole('searchbox', { name: 'Search school, code, or competitor' }), 'plano');
		await expect(canvas.getAllByText(/^Plano East [A-Z]{2}$/)).toHaveLength(2);
		await expect(canvas.queryByText('Westlake DD')).not.toBeInTheDocument();
	}}
/>

<Story name="Nothing marked" parameters={serve(empty())} />

<Story name="Category closed to judges" parameters={serve(readOnly())} />

<Story name="Mock trial regions" parameters={serve(mockTrial())} />
