<script lang="ts">
	/*
	 * One tournament on the user home. What is owed sits between the header and
	 * the tabs as rows. The tabs are named for what they hold (the category judged, the
	 * school, the entries), not for the hat, so the card never tells the person
	 * they are a judge or a coach. A single-section card skips the tab strip.
	 */
	import { ExternalLink, FileText } from '@lucide/svelte';
	import type { HomeRole, HomeTourn } from '@tabroom/types';
	import Button from '$lib/components/Button.svelte';
	import OnlineRoom, { type OnlineRoomTarget } from '$lib/components/OnlineRoom.svelte';
	import { Tabs, TabItem } from '$lib/components/Tabs';
	import { shortZone, showDateRange } from '$lib/helpers/dt';
	import RoleSection from './RoleSection.svelte';
	import TaskRow from './TaskRow.svelte';
	import { homeTasks } from './tasks';

	const { tourn }: { tourn: HomeTourn } = $props();

	const tasks = $derived(homeTasks(tourn));
	const dates = $derived(showDateRange({ startISO: tourn.start, endISO: tourn.end, tz: tourn.tz, mode: 'date', format: 'long' }).dateOutput?.trim());
	const location = $derived(tourn.city ? [tourn.city, tourn.state].filter(Boolean).join(', ') : tourn.online ? 'Online' : '');
	const rooms = $derived(tourn.OnlineRooms.filter(room => room.joinable));

	const roomTarget = (room: HomeTourn['OnlineRooms'][number]): OnlineRoomTarget => {
		switch (room.kind) {
			case 'school': return { type: 'school', tournId: tourn.id, schoolId: room.id };
			case 'prep': return { type: 'entry', tournId: tourn.id, entryId: room.id };
			case 'utility': return { type: 'utility', tournId: tourn.id, roomId: room.id };
		}
	};

	const tabTitle = (role: HomeRole): string => {
		switch (role) {
			case 'judge': return (tourn.Judges.length === 1 ? tourn.Judges[0]?.Category.name : null) ?? 'Judging';
			case 'coach': return (tourn.Schools.length === 1 ? tourn.Schools[0]?.name : null) ?? 'Your schools';
			case 'competitor': return (tourn.Entries.length === 1 ? tourn.Entries[0]?.Event.name : null) ?? 'Your entries';
			case 'tab': return 'Tab';
		}
	};
</script>

{#snippet header()}
	<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
		<div class="min-w-0">
			<h3 class="m-0 font-display text-2xl leading-tight tracking-normal text-primary-deep normal-case">{tourn.name}</h3>
			<div class="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
				<span class="font-semibold text-text">{dates} <span class="font-normal text-muted">{shortZone(tourn.tz)}</span></span>
				{#if location}<span>{location}</span>{/if}
			</div>
		</div>
		<a
			class="inline-flex items-center gap-1 text-sm text-primary-strong hover:underline"
			href="/index/tourn/index.mhtml?tourn_id={tourn.id}"
		>{tourn.webname}.tabroom.com<ExternalLink aria-hidden="true" size="12" /></a>
	</div>
{/snippet}

<!--
	The links a person keeps reaching for during a tournament: each category's
	live doc, and, while an online tournament is running, the squad, prep, and
	tournament rooms they may enter.
-->
{#snippet liveDocs()}
	{#if tourn.LiveDocs.length > 0 || rooms.length > 0}
		<ul class="flex flex-wrap gap-2" aria-label={rooms.length > 0 ? 'Live docs and online rooms' : 'Live documents'}>
			{#each tourn.LiveDocs as doc (doc.url)}
				<li>
					<Button
						color="primary"
						href={doc.url}
						rel="noopener noreferrer"
						size="sm"
						target="_blank"
						variant="outline"
					>
						<FileText aria-hidden="true" size="14" />{doc.caption ?? `${doc.Category.abbr ?? doc.Category.name ?? ''} live doc`.trim()}
					</Button>
				</li>
			{/each}
			{#each rooms as room (`${room.kind}-${room.id}`)}
				<li><OnlineRoom {room} target={roomTarget(room)} text={room.name ?? 'Online room'} variant="text" /></li>
			{/each}
		</ul>
	{/if}
{/snippet}

<article class="raised overflow-hidden" aria-label={tourn.name}>
	<div class="flex flex-col gap-3 p-4">
		{@render header()}
		{@render liveDocs()}
	</div>

	{#if tasks.length > 0}
		<div class="sunken flex flex-col divide-y divide-border border-y border-border" aria-label="Due for {tourn.name}" role="group">
			{#each tasks as task, idx (idx)}
				<TaskRow {task} />
			{/each}
		</div>
	{/if}

	<div class="px-4 pt-2 pb-4 {tasks.length > 0 ? '' : 'border-t border-border'}">
		{#if tourn.roles.length > 1}
			<Tabs label="{tourn.name} sections">
				{#each tourn.roles as role, idx (role)}
					<TabItem open={idx === 0} title={tabTitle(role)}>
						<div class="pt-4"><RoleSection {role} {tourn} /></div>
					</TabItem>
				{/each}
			</Tabs>
		{:else if tourn.roles[0]}
			<div class="pt-2"><RoleSection role={tourn.roles[0]} {tourn} /></div>
		{/if}
	</div>
</article>
