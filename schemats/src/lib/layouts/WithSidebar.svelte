<script lang='ts'>
	import type { Snippet } from 'svelte';
	import Sidebar, { type SidebarControls } from '$lib/layouts/Sidebar.svelte';

	type Props = {
		children: Snippet;
		sidebar: Snippet<[SidebarControls]>;
		// Leave unset for the default: closed below lg, open at lg and up.
		sidebarOpen?: boolean;
		// Gray content area for pages built from raised cards; see the elevation levels in app.css.
		canvas?: boolean;
	};

	let { children, sidebar, sidebarOpen = undefined, canvas = false }: Props = $props();
</script>

<div class="flex flex-1 flex-col lg:flex-row" data-with-sidebar>
	<div class="min-w-0 flex-1 p-4 sm:p-6 {canvas ? 'rounded-tl-sm bg-page' : ''}">
		{@render children()}
	</div>
	<Sidebar initialOpen={sidebarOpen}>
		{#snippet children(controls)}
			{@render sidebar(controls)}
		{/snippet}
	</Sidebar>
</div>
