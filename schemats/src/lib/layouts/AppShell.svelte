<script lang="ts">
	import Header from '$lib/layouts/Header.svelte';
	import Footer from '$lib/layouts/Footer.svelte';
	import FeedbackBanner from '$lib/layouts/FeedbackBanner.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		logoutFn: () => Promise<void>;
		suEndFn: () => Promise<void>;
		notificationCount?: number;
		children: Snippet;
	};

	let { logoutFn, suEndFn, notificationCount = 0, children }: Props = $props();
</script>

<FeedbackBanner />
<Header {logoutFn} {notificationCount} {suEndFn} />

<main class= 'bg-linear-to-b from-primary-deep to-primary px-2 sm:px-6 min-h-full'>
	<div class='
		min-h-[80vh]
		border-warning
		border-x-2
		border-t-2
		rounded-t-md
		bg-page
	'>
		<!-- making this flex on the front page leads to the Gradually
		Growing bug that's driving me insane -- CLP -->

		<div class='
			flex min-h-[80vh] w-full flex-col
			rounded-t-sm
			bg-surface
			p-4 sm:p-6
			has-[[data-with-sidebar]]:p-0
		'>
			{@render children()}
		</div>
	</div>
</main>

<Footer />
