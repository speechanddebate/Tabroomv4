<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import { Select, type SelectGroup } from '#lib/components/forms/index.ts';

	const { Story } = defineMeta({
		title     : 'Components/Forms/Select',
		component : Select,
	});

	const pronouns = [
		{ value: 'she/her', label: 'she/her' },
		{ value: 'he/him', label: 'he/him' },
		{ value: 'they/them', label: 'they/them' },
	];

	// A sample of classic's state groups, in its order
	const stateGroups: SelectGroup[] = [
		{ label: 'United States', options: [{ value: 'IA', label: 'Iowa' }, { value: 'NY', label: 'New York' }, { value: 'TX', label: 'Texas' }] },
		{ label: 'United Kingdom', options: [{ value: 'EN', label: 'England' }, { value: 'SL', label: 'Scotland' }, { value: 'WL', label: 'Wales' }, { value: 'NI', label: 'Northern Ireland' }] },
		{ label: 'Canada', options: [{ value: 'ON', label: 'Ontario' }, { value: 'QC', label: 'Quebec' }] },
		{ label: 'Australia', options: [{ value: 'NSW', label: 'New South Wales' }, { value: 'VIC', label: 'Victoria' }] },
		{ label: 'Other', options: [{ value: '', label: 'N/A' }] },
	];
</script>

<Story name="Flat options" asChild>
	<div class="max-w-sm">
		<Select label="Pronouns" options={pronouns} value="they/them" />
	</div>
</Story>

<Story name="Small" asChild>
	<div class="max-w-48">
		<Select label="Show" options={[{ value: 'all', label: 'All judges' }, { value: 'unrated', label: 'Unrated only' }]} size="sm" value="all" />
	</div>
</Story>

<Story name="Grouped" asChild>
	<div class="max-w-sm">
		<Select label="State" options={stateGroups} value="EN" />
	</div>
</Story>

<!-- Classic truncated German state codes to fit person.state; the stored value must not be lost -->
<Story
	name="Stored value not in the options"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByLabelText('State')).toHaveValue('DE-M');
	}}
>
	<div class="max-w-sm">
		<Select label="State" options={stateGroups} value="DE-M" />
	</div>
</Story>

<Story name="With error" asChild>
	<div class="max-w-sm">
		<Select error="Pick a state from the list" label="State" options={stateGroups} value="" />
	</div>
</Story>

<Story name="Disabled" asChild>
	<div class="max-w-sm">
		<Select disabled label="State" options={stateGroups} value="IA" />
	</div>
</Story>
