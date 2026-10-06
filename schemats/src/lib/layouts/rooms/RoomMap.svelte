<script lang='ts'>

	let { room = undefined, row = {}, col = {} } = $props();

	import { MapPin } from '@lucide/svelte';

	$effect( () => {
		if (row && row.Room) room = row.Room;
		if (row && row.room) room = row.room;
	});

</script>

	{#if room}
		{#if room.url}
			<div class='w-full flex'>
				<a
					class  = '
						px-0.25 py-0.5 my-0 mr-1 text-success {col.elementClass}
						hover:bg-success hover:text-white
					'
					href   = '{ room.url }'
					target = '_blank'
					title  = 'Room Map Link'
				><MapPin size={16} /></a>
				<span class='{col.elementClass} grow py-1'>
					{ room.name }
				</span>
			</div>
		{:else}
			<span
				class  = '{col.elementClass}'
			>{ room.name }</span>
		{/if}
	{/if}
