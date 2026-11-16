<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import { Switch, TextInput } from '$lib/components/forms';

	// Saves the moment it changes; a yes/no inside a form that waits for Save is a Checkbox
	const { Story } = defineMeta({
		title     : 'Components/Forms/Switch',
		component : Switch,
	});

	const saves = () => new Promise<void>(resolve => setTimeout(resolve, 400));
	const fails = () => new Promise<void>((_, reject) => setTimeout(() => reject(new Error('offline')), 400));
</script>

<Story
	name="Saves on change"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('switch', { name: 'Publish the judge list online' }));
		await expect(await canvas.findByText('Saved')).toBeInTheDocument();
	}}
>
	<div class="max-w-md">
		<Switch label="Publish the judge list online" save={saves} />
	</div>
</Story>

<Story name="With description" asChild>
	<div class="max-w-md">
		<Switch checked description="Neutral judges can be placed in any round regardless of school." label="Coaches can mark neutral judges" save={saves} />
	</div>
</Story>

<Story
	name="Save fails"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const toggle = canvas.getByRole('switch', { name: 'Web alerts on this browser' });
		await userEvent.click(toggle);
		await expect(await canvas.findByText('Not saved')).toBeInTheDocument();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');
	}}
>
	<div class="max-w-md">
		<Switch checked label="Web alerts on this browser" save={fails} />
	</div>
</Story>

<Story name="With settings under it" asChild>
	<div class="flex max-w-md flex-col divide-y divide-border">
		<Switch checked class="py-2" label="Coaches can mark first-year judges" save={saves}>
			<TextInput class="max-w-56" label="Label for first-year judges" value="FYO" />
		</Switch>
		<Switch class="py-2" label="Hide judge codes; show names only" save={saves} showChildrenWhen={false}>
			<TextInput class="max-w-40" inputmode="numeric" label="Start judge codes at" value="100" />
		</Switch>
	</div>
</Story>

<Story name="Disabled" asChild>
	<div class="max-w-md">
		<Switch checked disabled label="Web alerts on this browser" description="This browser blocks notifications." save={saves} />
	</div>
</Story>
