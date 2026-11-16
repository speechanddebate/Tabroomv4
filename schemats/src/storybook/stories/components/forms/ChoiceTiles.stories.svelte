<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { ChoiceTiles } from '$lib/components/forms';

	// One choice from two to four as big tap targets; longer lists use Select
	const { Story } = defineMeta({
		title     : 'Components/Forms/ChoiceTiles',
		component : ChoiceTiles,
	});

	const sides = [
		{ value: 'aff', label: 'Westfield AB', description: 'aff' },
		{ value: 'neg', label: 'Roosevelt CD', description: 'neg' },
	];
</script>

<Story
	name="Ballot winner"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByText('Roosevelt CD'));
		await expect(canvas.getByRole('radio', { name: 'Roosevelt CD' })).toBeChecked();
	}}
>
	<div class="max-w-md">
		<ChoiceTiles label="Winner" options={sides} />
	</div>
</Story>

<Story name="Labels only" asChild>
	<div class="max-w-md">
		<ChoiceTiles
			label="Count the obligation by"
			options={[{ value: 'rounds', label: 'Rounds per entry' }, { value: 'judges', label: 'Entries per judge' }]}
			value="rounds"
		/>
	</div>
</Story>

<Story name="Four choices" asChild>
	<div class="max-w-xl">
		<ChoiceTiles
			description="Decision for the round"
			label="Panel decision"
			options={[
				{ value: '3-0', label: '3-0' },
				{ value: '2-1', label: '2-1' },
				{ value: '1-2', label: '1-2' },
				{ value: '0-3', label: '0-3' },
			]}
		/>
	</div>
</Story>

<Story name="With error" asChild>
	<div class="max-w-md">
		<ChoiceTiles error="Choose the winner" label="Winner" options={sides} required />
	</div>
</Story>

<Story name="Disabled" asChild>
	<div class="max-w-md">
		<ChoiceTiles disabled label="Winner" options={sides} value="aff" />
	</div>
</Story>
