<script lang="ts" module>
	import Editor from '#lib/components/Editor.svelte';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';

	const { Story } = defineMeta({
		title: 'Components/Editor',
		component: Editor,
		tags: ['autodocs'],
	});
</script>

<script lang="ts">
	let content = $state('<p>Hello World!</p>');
</script>

<Story name="Default" asChild>
	<Editor bind:content />

	<div style="margin-top: 20px; padding: 12px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface-alt);">
		<h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Content (HTML):</h3>
		<pre style="margin: 0; white-space: pre-wrap; word-break: break-all; font-size: 12px;">{content}</pre>
	</div>
</Story>

<!-- The toolbar must still show: Placeholder dispatches a transaction while the editor is built -->
<Story
	name="Placeholder"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByTitle('Undo')).toBeInTheDocument();
		await expect(canvas.getByRole('textbox', { name: 'Reason for decision' })).toBeInTheDocument();
	}}
>
	<Editor label="Reason for decision" placeholder="Minimum 50 words of RFD required" />
</Story>
