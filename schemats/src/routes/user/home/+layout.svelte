<script lang="ts">
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import Chapters from '../(sidebar)/Chapters.svelte';
	import UserAccount from '../(sidebar)/userAccount.svelte';
	import Judging from '../(sidebar)/Judging.svelte';
	import SiteAdmin from '../(sidebar)/SiteAdmin.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<WithSidebar canvas>
	{@render children()}
	{#snippet sidebar()}
		<SiteAdmin />
		<Chapters chapters={data.chapters}/>
		<Judging />
		<UserAccount />
	{/snippet}
</WithSidebar>
