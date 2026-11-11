<script lang="ts">
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import Home from '../user/(sidebar)/Home.svelte';
	import SiteAdmin from '../user/(sidebar)/SiteAdmin.svelte';
	import UserAccount from '../user/(sidebar)/userAccount.svelte';

	let { children } = $props();
</script>

<WithSidebar>
	{@render children()}
	{#snippet sidebar()}
		<Home />
		<SiteAdmin />
		<UserAccount />
	{/snippet}
</WithSidebar>
