<script lang="ts">
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import UserAccount from '../(sidebar)/userAccount.svelte';
	import Judging from '../(sidebar)/Judging.svelte';
	import Home from '../(sidebar)/Home.svelte';

	let { children } = $props();
</script>
<WithSidebar>
	{@render children()}
	{#snippet sidebar()}
		<Home />
		<Judging />
		<UserAccount />
	{/snippet}
</WithSidebar>
