<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import { Field, controlBox, controlHeights } from '#lib/components/forms/index.ts';

	// The label, description and error wrapper every form control renders inside
	const { Story } = defineMeta({
		title     : 'Components/Forms/Field',
		component : Field,
	});

	const input = ['w-full px-3', controlBox, controlHeights.md];
</script>

<Story name="Label only" asChild>
	<Field label="School name">
		{#snippet children(control)}
			<input class={input} {...control} />
		{/snippet}
	</Field>
</Story>

<Story name="With description" asChild>
	<Field description="Shown on pairings and ballots" label="Pronouns">
		{#snippet children(control)}
			<input class={input} {...control} />
		{/snippet}
	</Field>
</Story>

<Story
	name="With error"
	asChild
	play={async ({ canvasElement }) => {
		const field = within(canvasElement).getByLabelText('Last name');
		await expect(field).toBeInvalid();
		await expect(field).toHaveAccessibleDescription('Names can\'t contain digits');
	}}
>
	<Field error="Names can't contain digits" label="Last name">
		{#snippet children(control)}
			<input class={input} value="Smith2" {...control} />
		{/snippet}
	</Field>
</Story>

<Story name="Required" asChild>
	<Field label="First name" required>
		{#snippet children(control)}
			<input class={input} required {...control} />
		{/snippet}
	</Field>
</Story>

<!-- For a control whose table column or row already names it -->
<Story
	name="Hidden label"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByLabelText('Rank for Maya Lindqvist')).toBeInTheDocument();
	}}
>
	<Field hideLabel label="Rank for Maya Lindqvist">
		{#snippet children(control)}
			<input class={['w-14 px-2', controlBox, controlHeights.sm]} value="1" {...control} />
		{/snippet}
	</Field>
</Story>
