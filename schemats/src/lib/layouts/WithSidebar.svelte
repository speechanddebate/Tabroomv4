<script lang='ts'>
	import type { Snippet } from 'svelte';
	import Sidebar, { type SidebarControls } from '$lib/layouts/Sidebar.svelte';

	type Props = {
		children: Snippet;
		sidebar: Snippet<[SidebarControls]>;
		// Leave unset for the default: closed below lg, open at lg and up.
		sidebarOpen?: boolean;
	};

	let { children, sidebar, sidebarOpen = undefined }: Props = $props();
</script>

<div class="flex flex-1 flex-col lg:flex-row" data-with-sidebar>
	<div class="min-w-0 flex-1 p-4 sm:p-6">
		{@render children()}
	</div>
	<Sidebar initialOpen={sidebarOpen}>
		{#snippet children(controls)}
			{@render sidebar(controls)}
		{/snippet}
	</Sidebar>
</div>
