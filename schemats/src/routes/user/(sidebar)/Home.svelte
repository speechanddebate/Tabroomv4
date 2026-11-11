<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import SidebarLink from './SidebarLink.svelte';
</script>

<SidebarLink class="mb-2" href="/user/home">
	<ArrowLeft class="inline size-3 align-[-2px]" aria-hidden="true" />
	Back to Home
</SidebarLink>
