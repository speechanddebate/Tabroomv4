<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';

	const { Story } = defineMeta({
		title: 'Layouts/Sidebar',
		parameters: {
			layout: 'fullscreen',
		},
	});
</script>

<Story
	name="Sidebar"
	play={async ({ canvasElement, step }) => {
		const canvas = within(canvasElement);
		const toggle = canvas.getByRole('button', { name: /toggle sidebar/i });

		await step('starts open: sidebar content is visible', async () => {
			await expect(toggle).toHaveAttribute('aria-expanded', 'true');
			await expect(canvas.getByText('Sidebar Links')).toBeVisible();
		});

		await step('closes on first click: sidebar content is hidden', async () => {
			await userEvent.click(toggle);
			await expect(toggle).toHaveAttribute('aria-expanded', 'false');
			await expect(canvas.getByText('Sidebar Links')).not.toBeVisible();
		});

		await step('reopens on second click: sidebar content is visible again', async () => {
			await userEvent.click(toggle);
			await expect(toggle).toHaveAttribute('aria-expanded', 'true');
			await expect(canvas.getByText('Sidebar Links')).toBeVisible();
		});
	}}
>
	<div class="flex h-screen bg-surface">
		<WithSidebar sidebarOpen={true}>
			<h5 class="border-b border-primary mb-4">Main Content</h5>
			<p>
				This area represents the page body. Resize the Storybook viewport to check how
				the main section and sidebar sit together.
			</p>
			<p>
				The sidebar should remain visually distinct while the main content keeps most
				of the horizontal space.
			</p>

			{#snippet sidebar()}
				<div class="sidenote">
					<h5 class="my-0 border-b border-accent pb-0 leading-8 mb-2">
						Sidebar Links
					</h5>
					<p class="mb-2">Secondary navigation and metadata live here.</p>
					<p>
						<a class="full blue" href="/" onclick={(e) => e.preventDefault()}>Main</a>
						<a class="full blue" href="/" onclick={(e) => e.preventDefault()}>Events</a>
						<a class="full blue" href="/" onclick={(e) => e.preventDefault()}>Rounds</a>
					</p>
				</div>
			{/snippet}
		</WithSidebar>
	</div>
</Story>
