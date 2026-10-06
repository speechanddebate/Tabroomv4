<script lang='ts'>

	// This pattern leads to reactive data display in Svelte 5 & TanStack,
	// which is otherwise tricky.

	import { indexFetch } from '$lib/indexfetch';
	import type { EventField, InviteEvent, TournInvite } from '@tabroom/types';
	import { getContext } from 'svelte';

	import Loading from '$lib/layouts/Loading.svelte';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';

	import SVGrid from '$lib/layouts/grid/SVGrid.svelte';
	import type { GridOptions, SchematColumn } from '$lib/layouts/grid/svgrid';

	import { resolve } from '$app/paths';
	import { ucfirst } from '$lib/helpers/text';

	import { page } from '$app/state';

	import type { Tourn } from '$indexcards/schemas';
    import type { IRow } from '@svar-ui/svelte-grid';
	const tourn:Tourn = getContext('webnameTourn');
	const pageContent = $derived(indexFetch<TournInvite>(`/rest/tourns/${tourn.id}/invite`));

	const eventAbbr = $derived(page.params.eventAbbr);
	let fieldReports = $derived(indexFetch<EventField>(`/rest/tourns/${tourn.id}/events/${eventAbbr}/field`));

	const columns: SchematColumn[] = $derived.by( () => {
		return [
			{
				id     : 'id',
				header : 'ID',
				hidden : true,
				filter : false,
			},{
				id       : 'code',
				header   : 'Code',
				flexgrow : 2,
			},{
				id       : 'name',
				header   : 'Name',
				flexgrow : 3,
				width    : 128,
			},{
				id     : 'schoolId',
				header : 'School ID',
				filter : false,
				hidden : true,
			},{
				id     : 'schoolName',
				header : 'School',
				flexgrow : 3,
				width    : 128,
				template      : (value:string, row:IRow) => {
					return row.School?.name;
				},
			},{
				id            : 'waitlist',
				header        : 'Waitlist',
				flexgrow      : 1,
				filterSort    : 1,
				filterOptions : ['Yes', 'No'],
				template      : (value:string, row:IRow) => {
					return row.waitlist ? 'Yes' : '';
				},
			},
		];
	});

	const options:GridOptions = $derived.by( () => {
		return {
			title    : `Entry Field : ${ fieldReports.data?.name ?? '' }`,
			reorder  : true,
			noFilter : true,
		};
	});

	type LinkableEvent = InviteEvent & { abbr: string };

	let events = $derived.by( () => {

		const rawEvents = (pageContent.data?.Events ?? []).sort( (a:InviteEvent, b:InviteEvent) => {
			if (a.type !== b.type) return a.type.localeCompare(b.type);
			if (a.NSDACategory.id
					&& b.NSDACategory.id
					&& a.NSDACategory.id !== b.NSDACategory.id
			) return a.NSDACategory.id - b.NSDACategory.id;
			if (a.abbr !== b.abbr) return (a.abbr ?? '').localeCompare(b.abbr ?? '');
			if (a.name !== b.name) return (a.name ?? '').localeCompare(b.name ?? '');
			return a.id - b.id;
		// events without an abbr can't be linked to
		}).filter( (e:InviteEvent): e is LinkableEvent => !!e.settings.fieldReport && !!e.abbr );

		const eventsByType: Record<string, LinkableEvent[]> = {};

		rawEvents.forEach( (event:LinkableEvent) => {
			if (!eventsByType[event.type]) eventsByType[event.type] = [];
			eventsByType[event.type].push(event);
		});

		return eventsByType;
	});

	const selectedEvent = $derived.by( () => {
		if (page.url.pathname.includes(`/field`)) {
			return page.params.eventAbbr;
		}
	});

</script>

	<WithSidebar>
		<Loading tanstackJob={fieldReports} />

		{#if fieldReports.status === 'success'}
			<div class='w-full px-0 overflow-x-scroll py-0'>
				<SVGrid
					columns = { columns }
					data    = { fieldReports.data.Entries }
					options = { options }
				/>
			</div>
		{/if}

		{#snippet sidebar()}
			<div class="sidenote min-h-[50dvh]">
				{selectedEvent}

				<a
					class = '
						blue full bg-surface-alt text-xs
						text-text
						border-s-2 border-primary-deep
						border-y border-y-border
						hover:bg-accent-soft
						mb-4
					'
					href  = {resolve('/invite/[tourn]/events', { tourn: tourn.webname })}
				>Return to Events</a>

				{#each Object.keys(events).sort() as eventType (eventType) }
					<h6>{ucfirst(eventType)}</h6>
					{#each events[eventType] as otherEvent (otherEvent.id) }
						<a
							class = '
								blue w-[48%] text-xs
								border-s-2 border-primary-deep
								me-[2%]
								border-y border-y-border
								{selectedEvent === otherEvent.abbr
									? 'bg-primary-strong text-accent-soft hover:text-text hover:bg-accent'
									: 'bg-surface-alt text-text hover:bg-accent-soft'
								}'
							href  = {resolve('/invite/[tourn]/events/[eventAbbr]/field', {
								tourn     : tourn.webname,
								eventAbbr : otherEvent.abbr,
							})}
						>{otherEvent.abbr} Entries</a>
					{/each}
				{/each}

			</div>
		{/snippet}
	</WithSidebar>