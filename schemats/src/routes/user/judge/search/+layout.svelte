<script lang="ts">
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import UserAccount from '../../(sidebar)/userAccount.svelte';
	import Judging from '../../(sidebar)/Judging.svelte';

	let { children } = $props();

</script>
<WithSidebar>
	{@render children()}
	{#snippet sidebar()}
		<Judging />
		<UserAccount />
	{/snippet}
</WithSidebar>
