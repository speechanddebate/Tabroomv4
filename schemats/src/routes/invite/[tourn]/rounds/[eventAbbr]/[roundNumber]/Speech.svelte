<script lang="ts">

	let {myTourn, tourn, schematic}  = $props();
	import { Gavel } from '@lucide/svelte';
	import { intersection } from '$lib/helpers/text';
	import { resolve } from '$app/paths';

	// SORT THAT ARRAY
	const sections = $derived.by( () => {

		const sectionKeys = Object.keys(schematic.Sections);

		return sectionKeys.map( (key) => {

			['me', 'mine'].forEach( (owner) => {
				schematic.Sections[key][owner] = 0;
				if (intersection(
					myTourn[owner].entries,
					Object.keys(schematic.Sections[key].Entries)
				).length) schematic.Sections[key][owner] = 1;
				if (!schematic.Sections[key][owner]) {
					if (intersection(
						myTourn[owner].judges,
						Object.keys(schematic.Sections[key].Judges)
					).length) schematic.Sections[key][owner] = 1;
				}
			});

			return schematic.Sections[key];

		// Thou may blowest it out thine ass, Typescript
		// oxlint-disable-next-line @typescript-eslint/no-explicit-any
		}).sort( (a:any,b:any) => {
			if (a.me || b.me) return (a.me == b.me)? 0 : a.me? -1 : 1;
			if (a.mine || b.mine) return (a.mine == b.mine)? 0 : a.mine? -1 : 1;
			if (a.letter.localeCompare(b.letter)) return 1;
			if (b.letter.localeCompare(a.letter)) return -1;
			return 0;
		});
	});

</script>

<div class="flex flex-wrap w-full justify-around m-0 p-0">

	{#each sections as section (section.id)}
		<span class="
			w-45
			mx-1 mt-2
			bg-surface
			border
			border-primary-strong
			text-sm
			flex flex-col
			justify-between
		">

			<div>
				<div class="w-full border-primary-strong border-b-2 text-center">
					<div class="font-semibold pt-1 {
						section.me
							? 'text-warning'
							: section.mine ? 'text-success' : ''
					} ">
						{schematic.Event.type == 'congress' ? 'Chamber' : 'Section'}
						{section.letter}
					</div>

					{#if section.roomName}
						<div class="font-semibold text-xs">
							in {section.roomName}
						</div>
						{#if section.roomNotes}
							<div class="italic text-center text-xs">
								in {section.roomNotes}
							</div>
						{/if}
					{/if}
				</div>

				<div class='text-xs px-1 mt-1 pt-1'>
					{#if section.Entries}
						{#each Object
							.keys(section.Entries)
							.sort((a,b) =>  parseInt(a) - parseInt(b)) as speaker (speaker)
						}
							<div
								class='w-full flex py-1 border-b'
								title='{ section.Entries[speaker].code }'
							>
								<a
									class="w-full text-text font-normal flex pt-0.5"
									href= { resolve('/invite/[tourn]/entries/[entryId]', {
										tourn   : tourn.webname,
										entryId : String(section.Entries[speaker]?.id),
									}) }
								>
									<span class="w-1/6 ps-0.5 leading-3">
										{ speaker }
									</span>
									<span
										class='w-5/6 leading-3 pe-0.5 {
											myTourn.me.entries.includes(section.Entries[speaker].id)
											? 'font-semibold underline decoration-warning'
											: ''
										} {
											myTourn.mine.entries.includes(section.Entries[speaker].id)
											? 'font-semibold underline decoration-success text-success'
											: ''
										}'
									>
										{ section.Entries[speaker].code }
									</span>
								</a>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<div class='text-xs border-t-2 border-primary-strong
				px-1 mt-1 pt-1 pb-2
			'>
				{#if section.Judges}
					{#each Object.keys(section.Judges)
						.sort((a:string,b:string) => {
							if (section.Judges[a].chair) return -1;
							if (section.Judges[b].chair) return 1;
							return section.Judges[a].last.localeCompare(section.Judges[b]);
						}) as judgeId (judgeId)
					}
						<div class='w-full flex justify-around text-xs overflow-x-hidden whitespace-nowrap {
							myTourn.me.judges.includes(judgeId)
								? 'text-warning font-semibold'
								:  myTourn.mine.judges.includes(judgeId)
									? 'text-success font-semibold'
									: 'text-text'
						} '>
							{#if section.Judges[judgeId].chair}
								<div class='flex font-semibold text-xs'>
									<span class="pe-0.5 border">
										<Gavel color='#954535' size={17} />
									</span>
									{ section.Judges[judgeId].code }
									{ section.Judges[judgeId].first }
									{ section.Judges[judgeId].last }
								</div>
							{:else}
								{ section.Judges[judgeId].code }
								{ section.Judges[judgeId].first }
								{ section.Judges[judgeId].last }
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</span>
	{/each}
</div>