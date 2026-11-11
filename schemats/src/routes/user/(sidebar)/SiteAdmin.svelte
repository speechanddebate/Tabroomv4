<script lang="ts">
	/*
	 * The site admin group, as on classic's user pages (user/admin/menu.mas). A stub for now:
	 * classic's People, Chapters, IP, and Bans links move here as their pages are ported.
	 * It draws nothing for anyone else, so a layout can include it without checking.
	 */
	import { getPerson } from '$lib/helpers/SessionContext.svelte';
	import SidebarLink from './SidebarLink.svelte';

	const person = $derived(getPerson());
</script>

{#if person?.site_admin}
	<div class="sidenote">
		<h4>Site Admin</h4>

		<SidebarLink href="/admin/jobs">Scheduled Jobs</SidebarLink>
	</div>
{/if}
