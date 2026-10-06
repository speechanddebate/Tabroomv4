<script lang="ts">

	// Tournament title, dates and tabs, rendered by the invite layout above
	// the page and its sidebar. The layout only renders this once the invite
	// data has loaded, so the fetch here is served from the query cache.

	import { resolve } from '$app/paths';
	import { indexFetch } from '$lib/indexfetch';
	import type { TournInvite } from '@tabroom/types';
	import { getContext } from 'svelte';

	import MainTitle from '$lib/layouts/MainTitle.svelte';
	import { Tabs, TabItem } from '$lib/components/Tabs';

	import { isAuthenticated } from '$lib/helpers/SessionContext.svelte';
	import { ucfirst } from '$lib/helpers/text';
	import { showDateRange, shortZone } from '$lib/helpers/dt';

	import type { Tourn } from '$indexcards/schemas';

	const tourn:Tourn = getContext('webnameTourn');
	const pageContent = $derived(indexFetch<TournInvite>(`/rest/tourns/${tourn.id}/invite`));
	const loggedIn = $derived(isAuthenticated());

	const tabs = $derived.by( () => {
		const params = { tourn: tourn.webname };
		const routes = {
			main     : resolve('/invite/[tourn]', params),
			events   : resolve('/invite/[tourn]/events', params),
			register : resolve('/invite/[tourn]/register', params),
			rounds   : resolve('/invite/[tourn]/rounds', params),
			results  : resolve('/invite/[tourn]/results', params),
		};

		return (Object.keys(routes) as Array<keyof typeof routes>).map( (pageKey) => {

			const route = routes[pageKey];
			const matchPatterns = [];

			if (pageKey === 'main') {
				matchPatterns.push(`/invite/${tourn.webname}/page/`);
				matchPatterns.push(`/invite/${tourn.id}/page/`);
			}

			if (pageKey === 'rounds') {
				matchPatterns.push(`/invite/${tourn.webname}/entries/`);
				matchPatterns.push(`/invite/${tourn.id}/page/`);
				matchPatterns.push(`/invite/${tourn.id}/rounds/`);
			}

			// Rounds and results need a logged in user
			const disabled = (pageKey === 'rounds' || pageKey === 'results') && !loggedIn;

			return	{
				route,
				label   : ucfirst(pageKey) || '',
				matchPatterns,
				// Every invite page sits under main's route, so main only
				// matches exactly (or by its matchPatterns).
				exact   : pageKey === 'main',
				disabled,
				tooltip : disabled ? `Log in to see ${pageKey}` : undefined,
			};
		});
	});

	let ranges = $derived.by( () => {
		return showDateRange({
			endISO   : pageContent.data?.end,
			startISO : pageContent.data?.start,
			format   : 'medday',
			mode     : 'date',
			showTz   : true,
			tz       : pageContent.data?.tz,
		});
	});

	let tournLocation = $derived.by( () => {
		const invite = pageContent.data;
		if (!invite) return '';
		if (invite.inPerson == 0 && invite.hybrid == 0) {
			let site = `${ invite.city || 'Online'} `;
			site += shortZone(invite.tz);
			return site;
		};
		return `${invite.city}, ${invite.state || invite.country}`;
	});

</script>

	<div class="invite-header">
		<!-- svelte-ignore attribute_quoted -->
		<MainTitle
			subtitle   = '{tournLocation}'
			title      = '{pageContent.data?.name ?? tourn.name}'
			undertitle = {ranges?.dateOutput}
		>
		</MainTitle>

		<Tabs label='Tournament'>
			{#each tabs as tab (tab.route)}
				<TabItem
					disabled      = {tab.disabled}
					exact         = {tab.exact}
					href          = {tab.route}
					matchPatterns = {tab.matchPatterns}
					title         = {tab.label}
					tooltip       = {tab.tooltip}
				/>
			{/each}
		</Tabs>
	</div>
