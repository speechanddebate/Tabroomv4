<script lang="ts">

	let {myTourn, schematic}  = $props();

	import { intersection } from '$lib/helpers/text';
	import SVGrid from '$lib/layouts/grid/SVGrid.svelte';
	import type { SchematColumn, GridOptions } from '$lib/layouts/grid/svgrid.js';

	// SORT THOSE SECTIONS!
	let sections = $derived.by( () => {
		const sectionKeys = Object.keys(schematic.Sections);

		return sectionKeys.map( (key) => {

			if (myTourn?.me || myTourn?.mine) {
				['me', 'mine'].forEach( (owner) => {
					schematic.Sections[key][owner] = 0;

					if (intersection(
						myTourn[owner]?.entries,
						Object.keys(schematic.Sections[key].Entries)
					).length) schematic.Sections[key][owner] += 2;

					if (!schematic.Sections[key][owner]) {
						if (intersection(
							myTourn[owner]?.judges,
							Object.keys(schematic.Sections[key].Judges)
						).length) schematic.Sections[key][owner] += 1;
					}
				});
			}

			// The table structure wants and needs a few flat fields for the
			// search filtering to work properly.

			schematic.Sections[key].affCode = schematic.Sections[key].Entries[1]?.code || '';
			schematic.Sections[key].affId   = schematic.Sections[key].Entries[1]?.id;
			schematic.Sections[key].negCode = schematic.Sections[key].Entries[2]?.code || '';
			schematic.Sections[key].negId   = schematic.Sections[key].Entries[2]?.id;

			return schematic.Sections[key];

		// Thou may blowest it out thine ass, Typescript
		// oxlint-disable-next-line @typescript-eslint/no-explicit-any
		}).sort( (a:any,b:any) => {
			if (a.me !== b.me) return b.me - a.me;
			if (a.mine !== b.mine) return b.mine - a.mine;
			if (a.flight !== b.flight) return a.flight - b.flight;
			if (a.bracket !== b.bracket) return (a.bracket - b.flight);
			if (a.roomName) return (a.roomName.localeCompare(b.roomName));
			if (a.letter) return (a.letter.localeCompare(b.letter));
		});
	});

	const event = $derived( schematic.Event );

	const columns:Array<SchematColumn> = $derived.by( () => {

		const baseColumns:Array<SchematColumn> = [
			{
				id       : 'affCode',
				header   : event.Settings?.aff_label || 'Prosecution',
				flexgrow : 2,
			},{
				id       : 'negCode',
				header   : event.Settings?.neg_label || 'Defense',
				flexgrow : 2,
			},
		];

		if (
			schematic.Settings.useNormalRooms
			|| schematic.Event.Settings.online_mode == 'sync'
			|| !schematic.Event.Settings.online_mode
		) {
			baseColumns.unshift({
				id       : 'roomName',
				header   : 'Courtroom',
				width    : 128,
				flexgrow : 1,
			});
		}

		if (schematic.flighted > 1) {
			baseColumns.unshift({
				id     : 'flight',
				header : 'Flight',
				width  : 32,
				flexgrow : 0,
			});
		}

		baseColumns.unshift({
			id     : 'id',
			width  : 50,
			hidden : true,
			filter : false,
		});

		return baseColumns;
	});

	const options:GridOptions = $derived({
		title    : schematic.label || `Round ${schematic.name}`,
		bigTitle : false,
		reorder  : true,
		noPager  : true,
	});

</script>

	<div class='px-3 overflow-x-scroll pb-3 bg-surface wg-full'>
		<SVGrid
			columns   = { columns }
			options   = { options }
			bind:data = { sections }
		/>
	</div>